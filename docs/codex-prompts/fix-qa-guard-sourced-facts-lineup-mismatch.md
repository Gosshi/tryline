# Codex 指示: QA ガードを sourced_facts 由来のラインアップに対応させる

## 仕様書

`specs/fix-qa-guard-sourced-facts-lineup-mismatch.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## 何が壊れているか（一文）

日本代表戦の試合登録メンバーは Owner 判断により `match_lineups` ではなく `match_sourced_facts` に保存されるが、`lib/content/fabrication-guard.ts:140` の `containsUngroundedPlayerReference()` は `hasLineups` / `hasEvents` しか見ないため、確定メンバーが手元にあるのに「ラインアップ不在にもかかわらず選手個別言及を含む」で必ず reject される。

## 先に実読すべきファイル

着手前に以下を必ず開くこと。**推測で書かないこと。**

| ファイル | 何を確認するか |
|---|---|
| `lib/llm/sourced-facts/fetch.ts:132-155` | `buildJrfuLineupSourcedFacts()` が生成する fact の**実際の文字列形式**。テストはこの形式で書く |
| `lib/content/fabrication-guard.ts:140-159` | ガード本体。`KEY_PLAYER_CONTEXT_PATTERN` / `RUGBY_POSITION_PATTERN` が名前を見ていないこと |
| `lib/llm/stages/qa.ts:455-475` | ガードの唯一の呼び出し箇所 |
| `lib/llm/stages/qa.ts:76-88` | `isFactualGroundingHardBlock()`。この issue がハードブロックであること |
| `lib/llm/pipeline.ts:200-210` | `hasLineups` / `hasEvents` / `allowedEntities` の算出 |
| `lib/llm/prompts/generate-preview.ts:100-175, 220-230` | `isDataSparse` / `structureInstruction` / `dataSparseBlock` / `lineupUsageBlock` / 223 行目 |
| `lib/llm/prompts/generate-recap.ts:295-305` | 302 行目の同一文 |
| `lib/llm/types.ts:132-137` | `SourcedFactInput` の型 |
| `tests/content/fabrication-guard.test.ts` | 既存テストの書き方 |

## 絶対にやってはいけないこと

1. **`players` テーブルや `match_lineups` に書かない。** 2026-08-13 の Owner 判断で明示的に除外されている（`specs/feat-jrfu-lineup-ingestion.md` 冒頭の注記を読むこと）。「ラインアップなんだから `match_lineups` に入れれば全部解決する」は**既に検討され却下された案**。ローマ字と漢字で名寄せが成立せず 46 名の重複選手が作られる
2. **ガードを無効化・削除しない。** `hasLineups || hasEvents` の early return に第 3 項を足すのであって、条件を消すのではない
3. **「sourced_facts が空でなければ根拠あり」にしない。** 天候の fact でガードが解除されると `fix-preview-fabricated-player-names`（PR #464）が塞いだ捏造の穴が再び開く
4. **`hasLineups` / `hasEvents` の意味を変えない。** 「sourced_facts があるとき `hasLineups=true` にする」という近道を取らないこと。この 2 つは他の分岐でも使われており、意味を変えると影響範囲が読めなくなる
5. **`verifyNarrativeEntities` を触らない。** すでに sourced_facts 対応済み（`entity-verification@1.1.0`）で、これが名前レベルの最後の砦

## 入出力の具体例

### 判定関数

入力（`confidence: "high"`、JRFU 経路の実形式）:
```ts
[
  { fact: "日本代表の先発は1 岡部崇人、2 江良颯、3 竹内柊平、4 ハリー・ホッキングス、5 ワーナー・ディアンズ、…。",
    fact_ja: "同上", source_url: "https://www.rugby-japan.jp/match/30035",
    source_domain: "rugby-japan.jp", confidence: "high" }
]
```
→ `true`

入力（会場情報のみ）:
```ts
[
  { fact: "会場はタウンズビルのQueensland Country Bank Stadium。",
    source_domain: "rugby-japan.jp", confidence: "high" }
]
```
→ `false`

入力（`先発` は含むが列挙がない）:
```ts
[
  { fact: "両チームとも先発を大幅に入れ替えた。",
    source_domain: "rugby-japan.jp", confidence: "high" }
]
```
→ `false`

### ガード

```
本文: "…先発のスクラムハーフ齋藤直人がテンポを作る…"
hasLineups=false, hasEvents=false, 確定ラインアップ fact あり  → false（reject しない）
hasLineups=false, hasEvents=false, 確定ラインアップ fact なし  → true（従来どおり reject）
```

## エッジケース

- 相手チーム側の fact しか無い（日本側が取れなかった）→ **未解決の質問 1**。Owner 判断が出るまでは「片側のみでも解除」で実装し、その旨を PR 本文に明記すること
- `fact` が空文字・`null` の要素が混ざる → クラッシュせず `false` 側に倒す
- fact に背番号がなく読点区切りの人名だけ（LLM 検索経由で入りうる形）→ 仕様書の判定条件 2 の後半（読点区切り人名 3 つ以上）で拾う
- 英語コンテンツ（`language: "en"`）の recap/preview → `starting XV` / `replacements` を条件に含めてあるが、実データが手元にないなら英語側は保守的に（拾えなくても既存挙動どおり）でよい。無理に正規表現を複雑化しないこと

## テストの書き方

過去に繰り返し起きた失敗を避けること: **手作りの理想化された文字列だけでテストを書かない。** `buildJrfuLineupSourcedFacts()` を実際に呼んで得た出力（またはその出力を逐語コピーした文字列）をフィクスチャにすること。

## 完了の定義

- `specs/fix-qa-guard-sourced-facts-lineup-mismatch.md` の受け入れ条件 1〜15、18、19 をすべて満たす
- 変更ファイル: `lib/content/fabrication-guard.ts` / `lib/llm/stages/qa.ts` / `lib/llm/pipeline.ts` / `lib/llm/prompts/generate-preview.ts` / `lib/llm/prompts/generate-recap.ts` / `tests/content/fabrication-guard.test.ts`
- `pnpm test` と型チェックが green
- **本番での再生成は実行しない。** 受け入れ条件 16・17（8/15 オーストラリア戦 1 件のみでの試し焼き）は Owner が PR マージ後に判断する。PR 本文に「再生成は未実施。試し焼き対象は 8/15 日本 vs オーストラリア戦」と明記すること
- PR 本文に、未解決の質問 1（片側のみのラインアップの扱い）をどう実装したかを 1 行で書くこと
