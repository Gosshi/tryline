`/specs/fix-lineup-refresh-after-match.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## 直すのは実質1箇所です

`lib/cron/orchestrate.ts` の **recap ループで `ingestLineups` を呼ぶ**。それだけです。

```
recapCandidates（status: "finished"）のループ
  → deps.ingestLineups(matchId, competitionFamily)   ← 追加
  → fetchSourcedFacts(matchId, "recap")
  → generateContent(matchId, "recap")
```

preview 側のループには**既に同じ呼び出しがあります**。同じ書き方に揃えてください。

## なぜ必要か（実際に虚偽が公開されました）

2026-08-30 の南アフリカ × ニュージーランドで、キックオフ直前に**15人中5人**が入れ替わりました。`match_lineups` は発表時のままなので、recap にこう書かれています。

> **オックス・ンチェ、マルコム・マークス、ウィルコ・ラウ**の先発フロントローを含む南アフリカは…

**この3人は誰も出場していません。** 実際は Steenekamp / Fourie / Thomas du Toit です。10番も Pollard ではなく Feinberg-Mngomezulu でした。

**QA はこれを検出できません。** 参照元の DB がそう言っているので、`factual_grounding: 5` / 指摘0件で通りました。**DB が嘘をつくと、既存のゲートは全部素通りします。**

一方 `match_events` は実際の出場者を正しく持っています。同じ試合で2つのテーブルが矛盾している状態です。

## 最初に読むファイル

| ファイル | 何を確認するか |
|---|---|
| `lib/cron/orchestrate.ts` | **preview ループの `ingestLineups` 呼び出し。これを写す** |
| 同ファイルの recap ループ | 追加する場所 |
| `app/api/cron/ingest-lineups/route.ts` | 既に正しく動く。**変更しない** |

## 4つ守ってください

**1. 順序**

**必ず `generateContent(matchId, "recap")` より前**に呼んでください。後だと、その回の記事は古いラインアップで生成されます。

**2. 失敗しても止めない**

ラインアップ取得が失敗しても、**recap 生成は続行**してください。preview 側と同じく `try`/`catch` で握ります。ラインアップが無くても記事は書けるので、ここで止めると損失のほうが大きいです。

**3. preview 由来と recap 由来を区別する**

`OrchestrateResult` の `lineups` は現在 `{ triggered, no_url }` です。**どちらのループで動いたか分かるようにしてください。** 区別が無いと「試合後の更新が効いているか」を運用で確認できません。

**既存フィールドの意味と型は変えないでください。**

**4. 置き換えは「全部入れ替えるか、一切触らないか」**

**2026-08-31 訂正: 初版の指示書は矛盾していました。** 「人数が減ったら対処せよ」と書きながら、対処に必要な `app/api/cron/ingest-lineups/route.ts` を変更禁止にしていました。**同ルートの変更を許可します**（範囲は下記に限る）。

upsert は `onConflict: "match_id,team_id,jersey_number"` なので、新しい結果に無い背番号の行は残ります。

**ただし「含まれない背番号を削除する」だけの実装にしないでください。** あなたの報告どおり `lib/scrapers/wikipedia-lineups.ts` は**部分的な行だけでも成功として返します**。それで削除すると、**23人のうち20人が消えて3人だけ残る**という、古いまま残るより悪い状態になります。

守るべき不変条件は「**1試合のラインアップは常に単一のパース結果に由来する**」です。混ざった状態を作らないでください。

| パース結果 | 動作 |
|---|---|
| **十分に完全**（各チームで先発15人が揃う） | **差し替える。** そのチームの、結果に含まれない背番号の既存行を削除 |
| **不完全** | **一切書き込まない。** 既存行を維持し、スキップをログとレスポンスに出す |

- 判定は**チーム単位**（片方だけ完全なら、そのチームだけ差し替える）
- 完全性の閾値は**定数**で持つ
- スキップは**エラーではない**。200 を返し、スキップした旨を含める

## やってはいけないこと

- **`ingest-lineups` の変更を、置き換え整合（完全性判定・削除・スキップ報告）以外に広げること。** パース結果の解釈やプレイヤー解決のロジックは触らない
- `lib/scrapers/wikipedia-lineups.ts` の変更
- `match_lineups` のスキーマ変更・マイグレーション・シード追加
- **交代時刻（`suboff` / `subon`）の取り込み。** 列が無く別 spec です
- **preview 側ループの挙動変更**
- QA 側の改修（`specs/fix-qa-lineups-and-events-grounding.md` の対象）
- 既存記事の再生成（Owner が手動で行います）

## 完了の定義

spec の「受け入れ条件」14項目をすべて満たすこと。特に:

- **recap ループでラインアップが更新されるテスト**
- **取得失敗でも recap が生成されるテスト**
- **順序（ラインアップ → 事実取得 → 生成）を検証するテスト**
- **部分的なパース結果で既存行が消えないテスト**
- **完全なパース結果で余分な背番号が消えるテスト**
- `git diff -- lib/scrapers/wikipedia-lineups.ts` が**空**
- `supabase/migrations/` と `supabase/seeds/` に新規ファイルが無い
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が clean

## PR 本文に必ず含めること

- 変更後の `OrchestrateResult` の形（preview 由来と recap 由来の区別が分かる実例）
- **背番号が減る場合に古い行が残るかの結論と根拠**
- 追加したテストの一覧
- `git diff --stat`
