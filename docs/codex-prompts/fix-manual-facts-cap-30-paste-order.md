# Codex 指示書: 手動入力の事実の上限を30件にし、同時刻の事実を貼った順に並べる

仕様書: `specs/fix-manual-facts-cap-30-paste-order.md`
決定: `docs/decisions.md` の D036
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## やること

1. `lib/llm/sourced-facts/fetch.ts` の `MAX_MANUAL_FACTS_FOR_GENERATION` を 30 にする。
2. `app/api/discord/interactions/route.ts` の `processResearchFactEntry` で、保存する行の `metadata` に `paste_index`（`rows.push` の時点の `rows.length`）を足す。
3. `selectSourcedFactsForGeneration` で、手動の事実を「`fetched_at` の新しい順 → `paste_index` の小さい順（無い行は後ろ）→ `fact` の文字列順」に並べ替えてから上限で切る。
4. Discord の上限超過の文言（`route.ts:238`）を仕様書の UI サーフェスのとおりにする。

## 触るファイル

- `lib/llm/sourced-facts/fetch.ts`
- `app/api/discord/interactions/route.ts`
- `tests/llm/sourced-facts.test.ts`、`tests/api/discord-interactions.test.ts`

## 守ること

- 並べ替えは新しい配列で行い、引数の配列を変えない。
- 自動取得の事実の並びと、手動が8件未満のときに自動で埋める規則は変えない。
- 既存のテストは消さない。上限16を前提にした assert は件数だけ30に合わせ、変えた assert を PR 本文に一覧にする。

## 処理すべきエッジケース

1. `metadata` が `null`、または `paste_index` が数値でない（文字列など）行 → 「`paste_index` が無い」として扱う。
2. `fetched_at` の文字列の書式が行ごとに違う（`+00` と `Z` など） → 文字列比較でなく `Date.parse` で比べる。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）: 並べ替えから `paste_index` の比較を外すと、受け入れ条件 2 のテストが落ちること。内容と結果を PR 本文に書く。

## やってはいけないこと

- 本番 DB の既存の行に `paste_index` を後から入れること。
- 本番の Discord に送信すること、LLM を実際に呼ぶこと（テストはモック）。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜8 のそれぞれについて、確認の方法と結果
  - 30 に合わせた既存の assert の一覧
  - 「壊して落ちた」確認の内容
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
