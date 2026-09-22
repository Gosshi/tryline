# 既存コンテンツの除外が1000行で切れ、公開済み記事が毎日作り直される

## 背景

**公開済みの recap が毎日いくつか再生成され、品質が下がった版に置き換わっている。**

2026-09-22 の実例（Discord 通知）:

```
コンテンツ品質回帰 [recap]
試合: クイーンズランド・レッズ 対 フィジアン・ドルア（2026-05-29）
QAスコア: 情報密度 4→5 / 日本語品質 4→5 / 事実根拠 5→4 / 戦術的深さ 4→4
本文: 1277字→2607字
```

本番 DB を確認したところ、この記事は **2026-09-22 20:16 に再生成され、
`factual_grounding` 5→4 のまま `published` として置き換わっていた**。
5 月の試合である。

### 原因

`lib/cron/orchestrate.ts:156-161` の既存コンテンツ除外クエリが、
**`match_id` で絞らずに全件を取得している。**

```ts
const { data: existingContent, error: contentError } = await params.db
  .from("match_content")
  .select("match_id")
  .eq("content_type", params.contentType)
  .eq("language", "ja")
  .in("status", [...EXISTING_CONTENT_STATUSES]);
```

**PostgREST の既定上限は 1,000 行。** 本番の `match_content` は

| content_type | language | 行数 |
|---|---|---:|
| recap | ja | **1,004** |
| preview | ja | 113 |
| recap | en | 10 |
| preview | en | 6 |

`recap`×`ja` が **1,004 行で上限を超えている**。返らなかった 4 行は
`existingIds` に入らず、**その試合が「未生成」と判定されて再生成される。**

`getMatchIdsMissingContent`（`:107`）は直前で `allMatchIds` を作っているのに、
それを `.in("match_id", allMatchIds)` として渡していない。

### 実害と進行

古い記事の再生成が毎日起きている（本番 DB 実測。キックオフ +30日 以降に生成された recap）。

| 日付 | 件数 | 対象 |
|---|---:|---|
| 2026-09-22 | 4 | Benetton v Leinster / Bulls v Zebre Parma / Queensland Reds v Fijian Drua / Ulster v Stormers |
| 2026-09-21 | 1 | Sharks v Benetton |
| 2026-09-19 | 1 | Leinster v Lions |
| 2026-09-18 | 2 | Connacht v Munster / Ospreys v Scarlets |
| 2026-09-17 | 1 | Dragons v Edinburgh |

**記事が増えるほど漏れる件数が増える。** 1,004 行の現在は 4 件だが、
1,100 行になれば 100 件が毎回再生成対象になる。LLM コストも比例して増える。

**同型の既知バグ**: `.is("match_events.id", null)` が効かなかった件（PR #842、
`project_urc_srp_event_gap` / `project_top14_lnr_ingestion`）。
あちらは「埋め込みリソースへのフィルタ」、こちらは「絞り込み無しの全件取得＋暗黙の1000行上限」だが、
**症状は同じ「除外が黙って効かない」**である。

## スコープ

対象:
- `lib/cron/orchestrate.ts` の `getMatchIdsMissingContent`
- 同種の危険を持つ他の 2 箇所（下記）
- 上記のテスト

対象外:
- 再生成そのものを止める仕組み（本来除外されるべきものが除外されれば足りる）
- 品質回帰通知の仕様（`lib/llm/pipeline.ts:836-856`）。**通知は正しく機能している**
- `match_content` 以外のテーブルの同種走査の全面監査（未解決の質問へ）
- recap バッチの時間予算・スキップ通知（別件）

## 実装方針

### 1. 候補 ID で絞る（本丸）

`getMatchIdsMissingContent` は直前で `allMatchIds` を作っている。
**それを `.in("match_id", allMatchIds)` として渡す。**

これで返る行数は候補数（preview は 24 時間窓、recap は 60 件上限）に収まり、
1,000 行上限に触れなくなる。ページングより確実で、クエリも軽くなる。

**`allMatchIds` 自体が 1,000 件を超える可能性**がある場合は、
分割して問い合わせること。`recap` の候補は `status='finished'` の全件なので
1,000 件を超えうる（現在 finished は 1,088 件）。

### 2. 同種の危険がある 2 箇所

**`match_content` を絞り込み無しで全件取得し、結果を完全な集合として使っている箇所**が他に 2 つある。

| 箇所 | 現状 | 想定行数 |
|---|---|---|
| `tools/audit-entity-grounding.ts:260-262` | `.eq("status","published")` のみ | published ja recap 877 + preview |
| `scripts/report-style-guard-shadow.ts:87-91` | `.eq("status","published").eq("language","ja").in("content_type",[...])` | **約 990。1,000 に極めて近い** |

どちらも**監査・レポート用**なので、切り捨てられると**黙って過少報告になる**。
本 spec で同時に直すこと。

**既にページングしている前例がある。**

- `lib/db/queries/players.ts:104` の `SUPABASE_PAGE_SIZE = 1000` と `:166-171` の `.range()` ループ
- `tools/audit-published-recap-event-integrity.ts:445` の `.range(offset, offset + PAGE_SIZE - 1)`

**共有ヘルパは存在しない。** 新設するか既存パターンを踏襲するかは実装者の判断でよいが、
**3 箇所で別々の書き方をしないこと。**

## 受け入れ条件

1. `getMatchIdsMissingContent` が `match_content` を問い合わせるとき、
   **候補の `match_id` で絞り込んでいる**。
2. 候補が 1,000 件を超える場合でも、**すべての候補について既存コンテンツの有無が判定される**。
   分割問い合わせでもページングでもよい。
3. `match_content` に 1,001 行以上の `published`/`draft` が存在し、
   そのうち **1,000 行目より後に位置する行に対応する試合が候補に含まれる**とき、
   その試合が `eligibleMatches` に**含まれない**（＝再生成されない）。

   これが本バグの再現条件。**このテストが修正前に落ちることを必ず確認すること。**
4. 既存の除外挙動（`content_type` / `language='ja'` / `status in ('draft','published')`）は変わらない。
5. `skippedCount` の意味が変わらない（候補数 − 対象数）。
6. `tools/audit-entity-grounding.ts` が 1,000 行を超える `published` を
   **全件処理する**（切り捨てない）。
7. `scripts/report-style-guard-shadow.ts` が同様に全件処理する。
8. 3 箇所のページング/分割の書き方が統一されている
   （共有ヘルパを作るか、既存の `SUPABASE_PAGE_SIZE` パターンに揃えるか）。

### 検証手順

9. AC 3 / 6 / 7 のテストを**修正前のコードに対して実行して落ちること**を確認してから実装する。
   AC 3 は 1,001 行以上のモックを用意しないと再現しない。**1,000 行以下のモックでは通ってしまう。**
10. `tests/cron/orchestrate.test.ts`（29 件）と `tests/api/orchestrate.test.ts` が全緑。
11. `pnpm vitest run tests/cron tests/api tests/scripts` が全緑。
12. `pnpm tsc --noEmit` と `pnpm lint` が通る。
13. PR を出す前に `gh pr checks` で CI の緑を確認する（main では CI が走らない）。

## デプロイ後の運用手順

実装には含めない。

1. `cron-live-pipeline` を手動実行し、**キックオフ +30 日以降に生成された recap が増えない**ことを確認する

   ```sql
   select count(*) from match_content mc join matches m on m.id = mc.match_id
   where mc.content_type='recap' and mc.language='ja'
     and mc.generated_at > m.kickoff_at + interval '30 days'
     and mc.generated_at >= now() - interval '1 day';
   ```

2. 品質回帰通知が止まることを確認する
3. 既に品質が下がった版に置き換わった記事（上表の 9 件）を確認し、
   必要なら再生成するか手当てするかを Owner が判断する

## 未解決の質問

1. **他テーブルにも同種の走査がある可能性がある。** `match_content` 以外で
   「絞り込み無しの全件取得＋結果を完全な集合として使用」を洗い出す監査は本 spec のスコープ外。
   1,000 行を超えうるテーブル（`matches` 1,399 / `players` 2,539 /
   `match_events` 15,796 / `match_sourced_facts`）が対象になる。

2. **既に置き換わった 9 件の扱い。** 本 spec は再発を止めるだけで、
   既に品質が下がった版になった記事を戻さない。
   旧版は保持されていないため、戻すには再生成しかない。
