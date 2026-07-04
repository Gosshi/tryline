# projected_lineups のキャップ数順フォールバックによる選手情報捏造を修正

## 背景

2026-07-04、日本 vs イタリア（Nations Championship 2026、`match_id = f56e9ee9-14be-49e3-b47d-c51a29c07593`）のプレビュー再生成後も、実在しない役割付けの選手情報（例:「日本のリーダーシップを担うのはキャプテンのハルミチ・タテカワ」「フルバックのアンジェ・カプオッツォ」等）が published された。`specs/fix-preview-fabricated-player-names.md`（PR #464、マージ済み）で追加したガードは `hasLineups=false` の場合のみ発火する設計だったが、本番の `pipeline_runs` ログを確認したところ **`hasLineups` は `true` と評価されていた**ため、ガードは設計通りスルーしていた（ガード自体のバグではない）。

**本番データで確認した根本原因**: `lib/llm/stages/assemble.ts` の `loadProjectedLineup()`（355-397行目）は以下の2段構え。

1. `match_lineups`（試合確定メンバー）を検索 → この試合は0件
2. **フォールバック**: 0件の場合、`players` テーブルから該当チームの**全選手を通算キャップ数（`caps`）降順**で取得して返す。`is_starter` は常に `null`。

この試合では (2) のフォールバックが発動し、`projected_lineups.home/away` にはそのチームの歴代選手（引退選手・今日の登録外選手を含む。例: リーチマイケル、松島幸太朗）がキャップ数順に並んだ配列が入った。`hasLineups = projected_lineups.home.length > 0 || away.length > 0` は非空なので `true` となり、プレビュー生成プロンプト（`generate-preview.ts` の `lineupUsageBlock`）は「`is_starter` で先発/控えを区別し、主将・先発を本文に反映せよ」と指示する。しかし `is_starter` は全件 `null` のため、LLM は先発・主将を**判断材料なしに創作**した。

**この問題の性質**: 前回の修正（`fix-preview-fabricated-player-names`）が対象としたのは「lineupデータが空 (`hasLineups=false`) なのに選手個別言及がある」ケース。今回は逆に **「lineup配列は非空 (`hasLineups=true`) だが、その中身が試合確定情報ではなく歴代選手プールの推測補完」** という、既存ガードの前提（"lineupがあれば安全"）そのものが成立しない新しいケース。実在する選手名を使っているため単純な人名検出では防げず、本質的には「確定情報と推測補完の区別が `hasLineups` という1つの真偽値に潰れていること」が問題。

**影響範囲**: Nations Championship 固有ではなく、`match_lineups` が未取得で `players.caps` にデータがあるチームが絡む thin-data な試合全般に共通する潜在リスク（他の試合にも同様の問題が既に公開されている可能性があるが、本 spec の範囲では追加調査しない）。

## スコープ

対象:
- `lib/llm/stages/assemble.ts`: `loadProjectedLineup()` の戻り値、または `AssembledContentInput` に「`match_lineups` 由来の確定lineupか、`players` キャップ数順フォールバックか」を区別する信号を追加する（例: `projected_lineups` に `source: "confirmed" | "roster_fallback"` を持たせる、または `AssembledContentInput` に真偽値フィールドを追加する等。具体的な型設計は Codex の判断に委ねる）
- `lib/llm/pipeline.ts`: `hasLineups` の算出を「配列が非空か」ではなく「確定lineupかどうか」に変更し、`containsUngroundedPlayerReference` へ渡す
- `lib/llm/prompts/generate-preview.ts`: `hasLineups`（構成分岐・`lineupUsageBlock`）の判定を同様に「確定lineupかどうか」に変更する。フォールバック時は既存の「ラインアップなし」パス（`isDataSparse` 相当の分岐、キープレイヤーセクション省略）に合流させる
- 対応するテスト（`tests/llm/stages/assemble.test.ts`、`tests/llm/prompts/generate-preview.test.ts`、`tests/llm/stages/qa.test.ts` 等、既存の慣例に合わせる）

対象外:
- `players` テーブルのキャップ数順フォールバック自体の削除（他の用途で使われている可能性があるため、フォールバックの存在自体は変更しない。「確定情報として扱わない」ようにするのがスコープ）
- `players.position` が未設定（日本側チームで確認）であることの修正（別問題）
- 既に公開済みの他試合コンテンツへの同様の問題の有無調査・再生成（本 spec の範囲外。Owner が別途判断）
- 今回の該当試合（`f56e9ee9-14be-49e3-b47d-c51a29c07593`）のプレビュー再生成の実行（本 spec 実装後、Owner の承認を得て別途実行する）

## データモデル変更

なし（既存カラムのみ使用。TypeScript の型定義に信号を追加する）。

## API サーフェス

なし。

## LLM 連携

- `generate-preview.ts`: `hasLineups` 判定ロジックの変更に伴い、`PROMPT_VERSION` をバンプすること（例: `preview@3.7.0`）
- コスト影響: 追加の LLM 呼び出しはなし

## 実装方針（提案。詳細実装は Codex 判断）

1. `loadProjectedLineup` の戻り値に確定/フォールバックの区別を持たせる（例えば関数を `{ entries: [...], isConfirmed: boolean }` を返す形に変更するか、`AssembledContentInput["projected_lineups"]` に `home_confirmed: boolean` / `away_confirmed: boolean` を追加する）
2. `lib/llm/pipeline.ts` の `hasLineups` 算出（`const hasLineups = assembled.projected_lineups.home.length > 0 || assembled.projected_lineups.away.length > 0;`）を、確定lineupの有無ベースに変更する
3. `generate-preview.ts` の `hasLineups`（97-100行目付近）・`lineupUsageBlock`（158-167行目付近）も同じ確定フラグを参照するよう変更する。フォールバックのみの場合は既存の「ラインアップなし」パス（`isDataSparse` 相当の分岐、キープレイヤーセクション省略）に合流させる
4. `containsUngroundedPlayerReference` 自体（`fabrication-guard.ts`）は変更不要。呼び出し側から渡す `hasLineups` の意味が正しくなれば動作する設計のはず

## 受け入れ条件

1. 本 spec 記載の実際の失敗ケース（`match_lineups` 0件・`players` にキャップ数順データがあるチーム同士の試合）を再現するテストで、`hasLineups` 相当の判定が `false`（または「確定なし」）になることを確認する
2. そのケースで `containsUngroundedPlayerReference` が発火し、`factual_grounding` が1に低下、`retry`/`reject` に流れることを単体テストで確認する
3. `match_lineups` に実データがある通常ケースでは従来通り `hasLineups=true` として扱われ、既存の合格ケース（PR #464 のテスト群）が壊れていないことを確認する
4. `pnpm test` 全体が通る
5. TypeScript strict エラーなし

## 今回発覚した個別対応（spec範囲外・Owner判断事項）

- 本 spec の実装・マージ後、該当試合（日本vsイタリア、`f56e9ee9-14be-49e3-b47d-c51a29c07593`）のプレビューを再度試し焼き→検品してから published にするか Owner が判断すること。現在は draft 化済み
- サイト全体で同様のキャップ数順フォールバックが絡む thin-data な試合が他に published されていないか、監査の要否を Owner が判断すること（本 spec は対応しない）

## 未解決の質問

- `projected_lineups` にフォールバックの選手名自体を一切渡さないようにするか（安全側）、それとも「キャップ数上位の選手」という一般的なチーム深度情報としてのみ使わせ、断定的な役割付け（主将・先発・特定マッチアップ）だけを禁止するプロンプト指示に留めるか。後者の方が生成コンテンツの厚みは出るが、プロンプト設計がより複雑になる。Codex の実装しやすさを優先して判断してよい
