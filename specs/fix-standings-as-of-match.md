# 記事に使う順位表を、試合の時点のものに限る

## 背景

2026-09-24、Nations Championship 第 1 節（7/4）の 5 試合のレビューを今の仕組みで作り直したところ、**5 本すべてに、その後の節まで進んだ今の順位表が、試合の時点の順位として書かれた**。

- 南アフリカ 45-21 イングランド: 「この勝利により 3 試合 3 勝、勝ち点 15」
- アルゼンチン 38-47 スコットランド: 「スコットランドは勝点 11 で順位 2 位、2 勝 1 敗」
- 日本 27-10 イタリア: 「試合前の順位表では日本が 5 位で勝ち点 4」
- オーストラリア 31-33 アイルランド、フィジー 24-39 ウェールズにも、同じ種類の記述がある。

GPT-6 の監査（`docs/content-prompt-audit-2026-09-24.md` の 1 章、P2「順位の鮮度判定は played の下限」）が指摘していた問題が、実際に起きた。

**原因:** 順位表を使ってよいかの判定 `hasCurrentStandings`（`lib/llm/lineups.ts:8`）は、「順位表の試合数（`played`）が、試合の時点までに終わった試合数（`expected_played`、`calculateStandingsFreshness` の `lib/llm/stages/assemble.ts:618-641`）**以上**」なら使ってよいとしている。後の節まで進んだ順位表は `played` が大きいので、この判定を通る。

**順位表の作られ方（2026-09-24 に本番 DB で確認）:** 今季の各大会（Nations Championship 2026、Premiership 2026-27、URC 2026-27、Top 14 2026-27、Six Nations 2027 など）では、順位表のすべてのチームで `played` が DB の完了試合数と一致している。順位表は DB の試合結果から計算されている（`scripts/calculate-standings.ts`、`lib/ingestion/standings.ts`）。そのため、**試合の直後に作る記事では `played` と `expected_played` がちょうど一致し、後から作り直した記事では `played` の方が大きくなる。**

## スコープ

**対象**
- `hasCurrentStandings` を、「`played` と `expected_played` が両チームとも**ちょうど一致する**」ときだけ `true` にする。

**対象外**
- 試合の時点の順位表を計算し直して使うこと（as-of の順位表）。作り直しのときにも順位の文脈を残したい場合の拡張で、別に扱う。
- すでに公開した 5 本のレビューの順位の記述の修正（Owner の判断で、新しい版を残す）。
- 順位表の計算そのもの。

## データモデル変更

なし。

## API サーフェス

`lib/llm/lineups.ts`:

```ts
export function hasCurrentStandings(
  freshness: StandingsFreshness | undefined,
): boolean
```

- `freshness` が `undefined` のとき: `true`（今までどおり。鮮度の情報が無い入力は判定しない）。
- それ以外は、次をすべて満たすときだけ `true`。
  - `home.played` と `away.played` が null でない。
  - `home.played === home.expected_played`
  - `away.played === away.expected_played`

この関数を使っている次の箇所は、コードを変えずにこの判定に従う。
- `buildStandingsBlock`（`lib/llm/prompts/shared-prompt-blocks.ts:72`）: 日本語の本文プロンプト（A と B）に順位表を入れるかどうか。
- `buildUsableContentInput`（`lib/llm/lineups.ts:61`）: 抽出・本文・加筆・QA に渡す入力から順位表を外すかどうか。

## UI サーフェス

なし。

## LLM 連携

- 本文・抽出・QA に渡す順位表が、試合の時点と合わない場合に外れる。プロンプトの文言は変えない。
- 本文プロンプトに埋め込む入力 JSON が変わりうるので、版番号をパッチで上げる: `preview@3.15.2` → `preview@3.15.3`、`recap@4.21.1` → `recap@4.21.2`。A のプロンプトのスナップショット（`tests/llm/__snapshots__/content-prompt-a-baseline.test.ts.snap`）の入力が「一致」になっていれば、差分は出ない。差分が出た場合は、その内容を PR 本文に示す。

## 受け入れ条件

1. `hasCurrentStandings` のテスト（`tests/llm/lineups.test.ts`）:
   - 両チームとも `played === expected_played` → `true`
   - どちらかが `played > expected_played`（後の節まで進んだ順位表）→ `false`
   - どちらかが `played < expected_played`（更新が遅れた順位表）→ `false`（今までどおり）
   - どちらかの `played` が null → `false`（今までどおり）
   - `freshness` が `undefined` → `true`（今までどおり）
   - 確認方法: 判定を `>=` に戻すと、2 つ目のテストが落ちること。
2. `buildUsableContentInput` に「`played > expected_played`」の入力を渡すと、`competition_standings` が `[]` になるテストがある。
3. レビューのプロンプト（`buildGenerateRecapPrompt`）に同じ入力を渡すと、「最新の大会順位表」のブロックが入らないテストがある。
4. 既存のテストのうち、`played > expected_played` を「使ってよい」前提にしているものがあれば、この変更の意図に合わせて直し、PR 本文にどのテストをなぜ変えたかを書く。
5. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## マージ後の確認（Claude Code が行う）

6. 作り直した Nations Championship の 5 試合のうち 1 試合（日本 対 イタリア `f56e9ee9`）について、新しいコードで入力を組み立て（DB の読み取りだけ。LLM は呼ばない）、`competition_standings` が空になることを確かめる。
7. 次の週末の新しいレビュー（URC 2026-27 の第 1 節など）で、順位表が今までどおり使われていることを確かめる（`played` と `expected_played` が一致するため）。

## 未解決の質問

なし。
