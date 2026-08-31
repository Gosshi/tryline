# 試合後にラインアップが更新されず、公開記事に虚偽が入る

## 背景

**`match_lineups` は試合前に発表されたメンバーのまま、試合後も更新されない。** 直前変更があった試合では、公開中のレビュー記事に「出場していない選手が先発した」という記述が入る。

### 実際に起きた（2026-08-30、南アフリカ 33-26 ニュージーランド）

キックオフ直前に南アフリカが5人を入れ替えた。**15人中5人**が発表時と異なる。

| 背番号 | Tryline の `match_lineups`（発表時） | 実際に出場 |
|---|---|---|
| 1 | Ox Nché | **Gerhard Steenekamp** |
| 2 | Malcolm Marx | **Deon Fourie**（Marx は16番で36分から） |
| 3 | Wilco Louw | **Thomas du Toit** |
| 10 | Handré Pollard | **Sacha Feinberg-Mngomezulu** |
| 14 | Kurt-Lee Arendse | **Cheslin Kolbe** |

残り10人は一致。

**その結果、公開中の recap に虚偽が2箇所入った。**

> **オックス・ンチェ、マルコム・マークス、ウィルコ・ラウ**の先発フロントローを含む南アフリカは、前半終盤のスクラムからコリシのトライにつながる局面を生んだ。

> コバス・レイナックとロイガードの9番同士、**ハンドレ・ポラード**とラブの10番同士の対面では

いずれも実際には出場していない選手を先発として記述している。

### QA は検出できない

この recap の QA は **`factual_grounding: 5` / 指摘0件**だった。**参照元の DB がそう言っているため、検出しようがない。**

捏造対策のゲート（`#467`）も style guard も、**DB が誤っている場合には無力**である。読者が最も基本的に信頼する「誰が出ていたか」で、それが起きた。

### 得点イベント側は正しい

`match_events` は実際の出場者を持っている（コルビの7本のキックを正しく記録）。**同じ試合について、DB 内の2つのテーブルが矛盾している。**

サイト上でも、メンバー表とレビュー本文が食い違って見える。

### 根本原因

`lib/cron/orchestrate.ts` で **`ingestLineups` は preview 側のループでしか呼ばれていない。**

```
previewCandidates（status: "scheduled"）のループ
  → deps.ingestLineups(matchId, competitionFamily)   ← ここだけ
  → fetchSourcedFacts(matchId, "preview")
  → generateContent(matchId, "preview")

recapCandidates（status: "finished"）のループ
  → fetchSourcedFacts(matchId, "recap")
  → generateContent(matchId, "recap")                ← ingestLineups を呼んでいない
```

**試合が `finished` になった後、ラインアップを取り直す経路が存在しない。**

### 追加コストはほぼゼロ

実際の出場者は、**既に取得している Wikipedia の同じページ**に載っている。得点イベントを取る `{{rugbybox}}` と同じ試合ブロックに出場15人と交代時刻がある。

```
|FB ||15||Damian Willemse || || {{suboff|40}}
|RW ||14||Cheslin Kolbe
|FH ||10||Sacha Feinberg-Mngomezulu
```

取り込みの仕組みも既にある。**`POST /api/cron/ingest-lineups?match_id=<uuid>` が該当ページを取得し、`onConflict: "match_id,team_id,jersey_number"` で upsert する。再実行すれば実際のメンバーで上書きされる。**

## スコープ

対象:
- `lib/cron/orchestrate.ts` の **recap ループで `ingestLineups` を呼ぶ**
- 呼ぶ順序（**recap 生成より前**）
- 更新後に残る不整合行の扱い

- **`app/api/cron/ingest-lineups/route.ts` の置き換え整合**（2026-08-31 追記。後述「初版の矛盾」参照）

対象外:
- **`lib/scrapers/wikipedia-lineups.ts` の変更**
- **交代時刻（`suboff` / `subon`）の取り込み。** `match_lineups` に列が無く、マイグレーションを伴う。**別 spec**
- `match_lineups` のスキーマ変更
- QA 側の改修（`specs/fix-qa-lineups-and-events-grounding.md` の対象。後述）
- **既に公開済みの記事の再生成**（後述の運用で対応）
- preview 側の挙動

## 修正内容

**recap ループの先頭で `ingestLineups` を呼ぶ。**

```
recapCandidates（status: "finished"）のループ
  → deps.ingestLineups(matchId, competitionFamily)   ← 追加
  → fetchSourcedFacts(matchId, "recap")
  → generateContent(matchId, "recap")
```

### 順序が重要

**必ず `generateContent(matchId, "recap")` より前に呼ぶ。** 後に呼ぶと、その回の記事は古いラインアップで生成される。

### 失敗しても recap 生成を止めない

preview 側と同じ扱いにする。ラインアップの取得に失敗しても `try`/`catch` で握り、**recap 生成は続行する**。ラインアップが無くても記事は書けるため、ここで止めるのは損失が大きい。

失敗は `console.error` に残し、結果に件数を出す。

### 結果に件数を出す

`OrchestrateResult` の `lineups` は現在 `{ triggered, no_url }` を持つ。**preview 由来と recap 由来を区別できるようにする。** 区別が無いと「試合後の更新が動いているか」を運用で確認できない。

### 初版の矛盾（2026-08-31 訂正）

初版は「人数が減ったら対処せよ」と要求しながら、対処に必要な `app/api/cron/ingest-lineups/route.ts` を変更禁止にしていた。**矛盾していたので、同ルートの変更を対象に含める。** 範囲は下記の置き換え整合に限る。

### 置き換えは「全部入れ替えるか、一切触らないか」

`onConflict: "match_id,team_id,jersey_number"` の upsert は**背番号が一致する行だけを上書きする**。新しいパース結果に無い背番号の行は残る。

**単純に「含まれない背番号を削除する」実装にしてはいけない。** `lib/scrapers/wikipedia-lineups.ts` は**1〜23番の部分的な行だけでも成功として返す**（既存テストも2〜3人のラインアップを正常にパースしている）。部分的な結果で削除すると、**23人のうち20人が消えて3人だけ残る**という、古いまま残るより悪い状態になる。

守るべき不変条件は「**1試合のラインアップは常に単一のパース結果に由来する**」である。混ざった状態を作らない。

| パース結果 | 動作 |
|---|---|
| **十分に完全**（各チームで先発15人が揃っている） | **差し替える。** そのチームの、結果に含まれない背番号の既存行を削除する |
| **不完全** | **一切書き込まない。** 既存行を維持し、スキップしたことをログとレスポンスに出す |

- 判定は**チーム単位**で行う（片方だけ完全な場合、そのチームだけ差し替える）
- 完全性の閾値は**定数として持つ**
- スキップは**エラーではない**。`ingest-lineups` は 200 を返し、スキップした旨を含める

## データモデル変更

なし。

## API サーフェス

`POST /api/cron/orchestrate` のレスポンス `lineups` に、recap 由来の件数を示すフィールドが増える（後方互換。既存フィールドは変えない）。

## UI サーフェス

なし。既存のメンバー表が、試合後は実際の出場者を表示するようになる。

## LLM 連携

パイプラインの段階は変えない。**recap 生成が参照するラインアップが、発表時のものから実際の出場者に変わる。**

## 受け入れ条件

1. `lib/cron/orchestrate.ts` の recap ループで `ingestLineups` が呼ばれる
2. **`generateContent(matchId, "recap")` より前に呼ばれる**
3. ラインアップ取得が失敗しても recap 生成が続行される（例外を握り、ログに残す）
4. `OrchestrateResult` で **preview 由来と recap 由来の件数が区別できる**
5. 既存フィールド（`previews` / `recaps` / `lineups.triggered` / `lineups.no_url`）の意味と型を壊していない
6. **recap ループでラインアップが更新されることのテスト**がある
7. **ラインアップ取得が失敗しても recap が生成されることのテスト**がある
8. **順序（ラインアップ → 事実取得 → 生成）を検証するテスト**がある
9. **各チームで先発15人が揃った場合のみ**、そのチームの既存行を差し替える（結果に含まれない背番号を削除する）
10. **不完全なパース結果では一切書き込まず**、既存行が維持される
11. 完全性の閾値が**定数として定義されている**
12. 判定が**チーム単位**である（片方だけ完全なら、そのチームだけ差し替わる）
13. スキップ時も `ingest-lineups` が 200 を返し、**スキップした旨がレスポンスに含まれる**
14. **部分的なパース結果で既存行が消えないことのテスト**がある
15. **完全なパース結果で余分な背番号が消えることのテスト**がある
16. `lib/scrapers/wikipedia-lineups.ts` に差分が無い
17. `match_lineups` のスキーマに差分が無い（マイグレーション・シードを追加しない）
18. preview 側のループの挙動が変わっていない
19. **`ingest-lineups` の変更が、置き換え整合（完全性判定・削除・スキップ報告）に限られている**
20. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

## 公開済み記事の扱い（運用）

本 spec の修正は**今後の試合にのみ効く**。recap が既に生成済みの試合は `recapCandidates` に入らないため、自動では直らない。

**2026-08-30 の南アフリカ × ニュージーランド（`12d74f1b-0032-4288-a8f8-cd11f3a5bd9f`）は、デプロイ後に手動で対応する。**

1. `POST /api/cron/ingest-lineups?match_id=12d74f1b-...` を実行してラインアップを更新
2. `content-regen` の手順で recap を再生成
3. 「オックス・ンチェ」「ハンドレ・ポラード」の記述が消えたことを確認

**同種の誤りが他の試合にもある可能性がある。** 直前変更は珍しくないため、`match_lineups` と `match_events` の得点者が矛盾する試合を洗い出す監査は別途検討する（未解決の質問へ）。

## 未解決の質問

- **交代時刻（`suboff` / `subon`）の取り込み。** 同じページに載っており、取れれば「36分に交代」といった記述が可能になる。`match_lineups` に列が無いのでマイグレーションが要る。**別 spec の候補**
- **過去の矛盾の洗い出し。** `match_events` の得点者が `match_lineups` に存在しない試合を検出すれば、同種の誤りを機械的に見つけられる。週次監査（`app/api/cron/audit-data-integrity/route.ts`）への追加候補。**この検出があれば今回の件も自動で見つかっていた**
- **QA 側の防御。** `specs/fix-qa-lineups-and-events-grounding.md` は QA にラインアップと得点イベントの両方を渡す。実装されれば、**両者が矛盾すること自体を QA が検出できる可能性がある**。本 spec（データを正す）と補完関係にあり、どちらも必要
- **発表時メンバーの保存。** 現在は上書きするため、発表時の情報は失われる。「発表 → 実際」の変更をコンテンツの題材にする価値はあるが、列の追加が要る
