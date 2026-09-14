# Codex プロンプト: feat-top14-lnr-match-events

`specs/feat-top14-lnr-match-events.md` の受け入れ条件に従って実装してください。**仕様の内容をここで繰り返しません。先に spec を全文読んでください。**

## やること

Top 14 の得点イベントを `top14.lnr.fr` の試合シートから取り込み、レビューが生成されるようにします。**得点データは SSR HTML の中に JSON で埋まっており、JS レンダリングは不要です**（実測確認済み）。

## 先に読むファイル

```
specs/feat-top14-lnr-match-events.md
lib/scrapers/top14-match-stats.ts       ← :368-383 URL 組み立てと fetch の型。これに揃える
lib/ingestion/events.ts                 ← :112-148 resolvePlayerId / :155-170 buildMetadata / :175-290 upsertMatchEvents
lib/scrapers/wikipedia-match-events.ts  ← :3-31 ParsedMatchEvent の型定義
lib/format/match-event-points.ts        ← 得点換算。検算に使う
lib/ingestion/sources/top14-lnr-live.ts ← :10-13 既存の定数（節上限3・待機3秒）
components/match-events-section.tsx     ← :17-24 EVENT_TYPE_LABEL（全種別が定義済み。UI 変更は不要）
```

## 取得元の形

`matches.external_ids.top14_lnr_match_path` に試合シートの URL が**全試合分すでに保存されています**。名寄せは不要です。末尾に `/resumes-replays` を付けたページに、次の形で埋まっています。

```html
<header-timeline :game-facts='[{"type":"Point","subtype":"Essai",
  "slugSubType":"essai","club":"home","minute":16,"additionalMinute":0,
  "score":[5,0],"player":{"firstName":"Kalvin","lastName":"GOURGUES"}}, ...]'>
```

`cheerio` の `$("header-timeline").attr(":game-facts")` → `JSON.parse` で取れます（実測確認済み）。

## 一番間違えやすいところ

**変換は `game-facts` に存在しません。`score` の差分から作ります。**

**すべての fact について、両クラブ分の差分を直前の fact から求めてください。** トライ行だけを見てはいけません。

| 差分 | 生成するもの |
|---:|---|
| 0 | なし |
| **+2** | **`conversion`**（**どの種別の fact に乗っていても拾う**） |
| +3 | `penalty_goal` |
| +5 | `try` |
| +7 | `try` ＋ `conversion` |
| それ以外 | **例外で停止** |

**初版は「トライ行の差分だけ」を見ており、本番 dry-run で2点取りこぼして停止しました（2026-09-14 訂正）。** ペルピニャン×カストルでは、46分のトライの変換が **47分のカード行**に `[29,15]→[31,15]` として乗っていました。**LNR は得点を必ずしも得点イベントの行に載せません。**

**変換の `playerName` は空文字にしてください。** 蹴った選手はデータに含まれません。**トライの得点者名で埋めないでください。** 埋めても件数も得点合計も変わらないため、**受け入れ条件3・5・6 はすべて通ってしまいます。** これを検出するのは条件10だけです。

**未知の `slugSubType` は読み飛ばさず、例外で停止してください。**

読み飛ばすと得点合計が最終スコアと合わず、`upsertMatchEvents` が `score_mismatch` で拒否します。**そのとき「未知の種別があった」ことが分からなくなります。** ドロップ・レッドカード・ペナルティトライの綴りは**未観測**なので、出現したら必ず止まる設計にしてください。

**`minute` に `additionalMinute` を足さないでください。** `40+2` を `42` にすると実際の42分の得点と区別できなくなります。`11832` に `40+2` と `80+3` が実在します。

**`resolvePlayerId` の空文字ガードを忘れないでください。**

現在の実装は `ilike("name", "%%")` を発行し、**そのチームの全選手に一致します。** 登録選手がちょうど1人のチームでは誤った選手が紐付きます。**trim して空なら DB を引かずに `null` を返してください。**

**Top 14 の14チームは全て登録選手0人なので、投入されるイベントは全件 `player_id = null` になります。これは正常です。** `onUnresolvedPlayer` が毎回発火しますが、失敗として扱わないでください。

## テストのフィクスチャは実データを使ってください

**手で組んだ HTML を使わないでください。** 過去に手作りフィクスチャが実データで壊れた実績があります。実ページから取得した `:game-facts` の JSON をそのまま `tests/fixtures/` に保存してください。

| フィクスチャ | 期待値 |
|---|---|
| `11828-clermont-paris` | try 4・conversion 3・penalty_goal 5・yellow_card 1 = **13件**。ホーム25・アウェイ16 |
| `11832-toulouse-bordeaux` | try 10・conversion 5・その他0 = **15件**。ホーム48・アウェイ12 |
| **`11826-perpignan-castres`** | try 10・**conversion 8**・penalty_goal 2・yellow_card 3 = **23件**。ホーム43・アウェイ29 |

**`11826` が訂正の要です。** `conversion` の分は **15 / 19 / 25 / 31 / 47 / 52 / 63 / 75** で、**47 が46分のトライの変換**（カード行に計上）。トライ行だけを見る実装では22件・41-29 になり、**この1本を落とします**。3フィクスチャとも 2026-09-14 に実データで検算済みです。

`11828` の内訳は全10 facts を直接観測した確定値です。try の分は **52 / 63 / 71 / 73**、conversion の分は **52 / 63 / 71** です。

## テストは RED から始めてください

**RED になるのは 1〜11・12・14〜17 です。** スクレイパーと CLI が存在しないため、import が解決しません。**条件12 は既存関数の変更なので、現行実装で落ちます。**

GREEN（実装前から通る保護テスト）は **13・18・19** の3つだけです。

## 実装後に意図的に壊して確認してください

**13・19 は自明に通るため、壊して初めて検出力が確認できます。**

| 壊し方 | 落ちるべき条件 |
|---|---|
| `resolvePlayerId` のガードを外す（空文字でも DB を引く） | **12**（13 は通ったまま） |
| 未知の `slugSubType` を `continue` で読み飛ばす | **8** |
| 変換の `playerName` にトライの得点者名を入れる | **10 だけ**（3・5・6 は通る） |
| `minute` に `additionalMinute` を加算する | **11** |

3つ目が最も重要です。**件数も合計も変わらない改変を、条件10だけが捕まえることを PR 本文で示してください。**

## リクエスト量の制約（必ず守ること）

`docs/decisions.md:678` の 2026-08-29 の判断は「**節単位・1回3節上限・節間3秒・全26節の一括取得はしない**」です。背景はフランスの sui generis データベース権です。

- `MAX_TOP14_LNR_MATCHES_PER_RUN = 7` を定数で持つ
- 試合間に `TOP14_LNR_MATCH_DELAY_MS = 3_000` 待機する
- **終了済みかつイベント0件の試合だけ**を対象にする。取得済みを取り直さない
- **ワークフローの `schedule` はコメントアウトしたままにする。** `workflow_dispatch` のみ有効

## 触ってはいけないもの

```
lib/llm/pipeline.ts / lib/llm/stages/assemble.ts   events_unavailable の判定
lib/ingestion/live-ingest.ts                        live 経路への統合は対象外
lib/scrapers/wikipedia-match-events.ts              既存の vevent 解析
scripts/backfill-top14-match-events.ts              Wikipedia 経由の既存スクリプト
components/match-events-section.tsx                 ラベルは全種別定義済み
match_events / matches のスキーマ
他大会・2026-27 より前のシーズン
```

## 完了の定義

1. spec の受け入れ条件20項目すべてを満たす
2. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
3. PR 本文に次を貼る
   1. 実装前に RED だった条件の出力（RED → GREEN）
   2. 意図的破壊4種の出力。**とくに「変換にトライの得点者名を入れる」で条件10だけが落ちること**
   3. `--dry-run` の実行結果。**14試合すべてで得点合計が `matches.home_score` / `away_score` と一致すること**

**期待値を手で書き写さないでください。** 実際に走らせた出力を貼ってください。

**1件でも得点合計が一致しない試合があれば、実装を進めずに `slugSubType` の内訳を添えて報告してください。** 未観測の種別が存在する可能性があります。
