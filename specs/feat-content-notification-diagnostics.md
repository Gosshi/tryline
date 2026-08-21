# コンテンツ生成通知に機械的な診断値を載せ、品質回帰を検知する

## 背景

2026-08-21 03:47、南アフリカ vs ニュージーランド第1テストの preview が却下され、Discord にこの通知が届いた。

```
⚠️ コンテンツ却下 [preview]
試合ID: d6d5b1ab-58ec-44c8-a31d-54fadc0a662e
QAスコア: 情報密度 2/5 / 日本語品質 5/5 / 事実根拠 3/5
問題点: 本文は1500字以上で、字数要件を満たしています / 直近5試合の対戦相手・スコアや8月22日という日付は、提示された許可済み事実には含まれていません / 戦術分析が...具体性が不足しています / 本文が目標字数の下限未満です
対応: Supabase Studio の match_content テーブルで status を確認し、必要に応じて published に変更してください
```

**Owner はこの通知から何も判断できず、「なんだろう」から調査が始まった。** 原因の特定には本番 DB を6回引く必要があった。

### この通知が判断材料にならない理由

**1. 矛盾した文言が並んでいる**

「本文は1500字以上で、字数要件を満たしています」と「本文が目標字数の下限未満です」が同一リストにある。実測は 1,468 字なので前者が誤り。

`lib/llm/stages/qa.ts:485-486` は `measureContentLength(...) < lengthRequirement.min` で決定的に判定し、同 573-575 行のコメントは**プログラム側が字数の single source of truth** と明言している。つまり誤っているのは LLM が `issues` に書き足した文言のほうで、判定自体は正しい。**正しい判定と誤った作文が同じ強さで並んでいる。**

**2. 採点4項目のうち3項目しか出ていない**

`lib/llm/notify.ts:62`

```ts
`QAスコア: 情報密度 ${qaResult.scores.information_density}/5 / 日本語品質 ${qaResult.scores.japanese_quality}/5 / 事実根拠 ${qaResult.scores.factual_grounding}/5`,
```

**`tactical_depth` が欠落している。** 今回それは 2/5 で、却下理由の中心の1つだった。

**3. 試合が識別できない**

`試合ID: d6d5b1ab-...` だけ。どのカードか、いつキックオフかが分からない。

**4. 素材の状態が分からない**

sourced_facts が0件なのか7件なのか、ラインアップが入っているのかで、Owner の次の行動は全く変わる。今回は facts 7件・ラインアップ0件で、**取るべき行動はラインアップの取り込みだった**が、通知からは読み取れなかった。

### さらに、静かな品質低下が検知できない

同日 22:06、`cron-weekend-preview-refresh` が同じ試合を再生成し、published を上書きした。

| | 18:45（手動） | 22:06（cron） |
|---|---|---|
| 情報密度 | 5 | **4** |
| 事実根拠 | 4 | **3** |
| 戦術的深さ | 3 | 4 |
| 字数 | 1,944 | 1,844 |

**verdict は publish なので通知は一切飛ばなかった。** 選手名のカタカナが総取り替えになり（マークス→マルクス、ラウ→ルー、ムーアビー→ムービー）、主将コリシの欠場という最重要情報が本文から消えたが、Owner がたまたま確認するまで誰も気づかなかった。

**却下だけが通知され、劣化は通知されない。**

## スコープ

対象:

- `notifyContentRejected` に機械的な診断値を追加する
- LLM 由来の字数言及を `issues` から除去する
- 再生成でスコアが下がった場合の新しい通知を追加する

対象外:

- **QA の採点ロジック・ルーブリック・閾値の変更**
- **`verdict` の判定基準の変更。** 劣化しても publish されること自体は本 spec では変えない（通知するだけ）
- 生成プロンプトの変更
- `postOpsAlert` の送信先・Webhook 設定（`fix-ops-notifications-discord.md` の結果を維持する）
- 却下されたコンテンツの自動再試行
- 選手名カタカナの安定化（`players.name_ja` 欠落。**別 spec の候補**、下記「未解決の質問」参照）
- Discord 以外の通知経路

## データモデル変更

**なし。マイグレーション不要。** 既存の `match_content.qa_scores` / `match_sourced_facts` / `match_lineups` / `matches` / `teams` を読むだけ。

## API サーフェス

### 1. `notifyContentRejected` の拡張（`lib/llm/notify.ts:53-74`）

`ContentRejectedNotificationOptions` に診断値を追加し、メッセージへ出力する。**すべて呼び出し側が既に持っているか、決定的に算出できる値だけを使う。LLM に問い合わせない。**

出力すべき項目:

| 項目 | 出どころ |
|---|---|
| 対戦カード（日本語表記）とキックオフ JST | `matches` / `teams.name_ja`。JST 整形は `lib/format/kickoff.ts` の既存関数 |
| 採点**4項目すべて** | `qaResult.scores`。`tactical_depth` を必ず含める |
| 実測字数 / 下限 | `measureContentLength` と `getContentLengthRequirement`（`lib/llm/content-length.ts`） |
| sourced_facts 件数 | 呼び出し側の assembled |
| ラインアップの有無・件数 | 同上 |
| 決定的ガードの発火有無 | `lib/llm/stages/qa.ts` のプログラム側判定（字数・捏造ガード等） |

**Discord の 2,000 字上限**（`DISCORD_MESSAGE_CONTENT_LIMIT`、`notify.ts:12`）があるため、診断値を優先し、LLM の `issues` は末尾に置いて切り詰められる側にすること。

### 2. LLM 由来の字数言及を `issues` から除去

`qa.ts` 側で、LLM が返した `issues` のうち字数に言及する要素を落とす。**プログラム側が付与する `CONTENT_LENGTH_ISSUE`（`lib/llm/content-length.ts:3`）だけを残す。**

判定方法は実装者の判断でよいが、**`CONTENT_LENGTH_ISSUE` と完全一致する要素は必ず残すこと。** 誤って本物の指摘を落とすより、多少の取りこぼしを許容する方向へ寄せる。

### 3. 品質回帰の通知（新規）

再生成で既存 `qa_scores` より採点が下がった場合に通知する。

- **比較対象は上書き前の `qa_scores`。** 更新前に読み出して保持する必要がある
- 発火条件: 4項目のいずれかが下がったとき（実装時に緩めてよいが、**本 spec 背景の事例（密度 5→4・事実根拠 4→3・戦術 3→4）が必ず発火すること**）
- 既存 published が無い初回生成では発火しない
- メッセージには前後のスコア、前後の字数、対戦カード、キックオフ JST を含める

`notifyContentRejected` と同じ `postOpsAlert` を使い、新しい送信経路を作らない。

## UI サーフェス

なし。

## LLM 連携

**新規 LLM 呼び出しを追加しない。** 本 spec は既に得られている値を通知に載せるだけで、コスト増はゼロ。モデル ID は直書きせず `lib/llm/models.ts` を参照すること。

## 受け入れ条件

1. `notifyContentRejected` の出力に `tactical_depth` が含まれる。**修正前は含まれないことを固定するテストを置くこと。**
2. 出力に対戦カードの日本語表記とキックオフ JST が含まれる。JST は `lib/format/kickoff.ts` の既存関数の出力と一致する。
3. 出力に実測字数と下限が含まれ、`content-length.ts` の値と一致する。**下限値をコードへ直書きしない。**
4. 出力に sourced_facts 件数とラインアップ件数が含まれる。0件のときも「0件」と明示される。
5. メッセージが 2,000 字を超える場合、診断値が残り LLM の `issues` 側が切り詰められる。
6. LLM が `issues` に「1500字以上で、字数要件を満たしています」を含めても、通知には出力されない。
7. プログラム側が付与する `CONTENT_LENGTH_ISSUE` は通知に残る。
8. 上書き前 `qa_scores` が `{density:5, grounding:4, tactical:3, japanese:4}`、上書き後が `{density:4, grounding:3, tactical:4, japanese:4}` のとき、回帰通知が発火する。
9. 上書き前の `qa_scores` が存在しない（初回生成）とき、回帰通知は発火しない。
10. 全項目が同点または上昇したとき、回帰通知は発火しない。
11. 既存の `notifyCostAlert` / `notifyDataIntegrityReport` / `notifyBroadcastIngestReport` / `notifyNewsletterDelivery` の出力が変わっていない。
12. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。
13. **本番へ通知を送るテストを書かない。** `postOpsAlert` はモックする。

## 未解決の質問

1. **選手名カタカナが生成のたびに変わる。** 2026-08-21 の実測で `players.name_ja` が対象選手全員 NULL（今日登録した6人だけでなく、5月登録の Marx / Louw / Reinach / Libbok も）。日本語表記が DB に無いため LLM が都度カタカナ化しており、同じ試合の再生成で「マークス→マルクス」「ラウ→ルー」「ムーアビー→ムービー」「デ・ヴィリアーズ→デフィリアス」と総取り替えになった。**全記事に影響する別 spec の候補。** 検索流入と読者の信頼の両方に効く。

2. **劣化した再生成を自動で棄却すべきか。** 本 spec は通知するだけに留める。自動棄却は「良い記事が更新されない」副作用があるため、通知を数週間運用してから判断したい。

3. **`Ruan Nortjé` の slug が `ruan-nortj` になっている**（`é` が落ちた）。`lib/db/player-slug.ts` の正規化がダイアクリティカルマークを落としている疑い。本 spec の対象外だが、URL とマッチングの両方に影響する。
