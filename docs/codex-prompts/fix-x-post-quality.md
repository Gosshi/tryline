# Codex プロンプト: X投稿ドラフト品質の2件修正

仕様: `specs/fix-x-post-quality.md` を参照（内容はインライン展開しない）。

このプロンプトは独立した2つの修正（Part 1, Part 2）をまとめたものです。同一PRでも別々のPRでも構いません。どちらも既存ロジックへの小規模な変更で、アーキテクチャ変更は伴いません。

---

## Part 1: Discord/X投稿のカタカナ表記バグ

### タスク

`app/api/cron/notify-discord/route.ts` が日本語投稿でもチーム名・大会名を英語の `name` カラムのまま出力している。`teams.name_ja` / `competitions.name_ja` を優先するよう修正する。

### 変更ファイルと内容（1ファイルのみ）

`app/api/cron/notify-discord/route.ts`

1. `TeamRow` 型（L19-22）と `CompetitionRow` 型（L24-28）に `name_ja: string | null` を追加
2. Supabaseクエリのselect句（L254-256）に `name_ja` を追加:
   ```
   home_team:teams!matches_home_team_id_fkey ( name, name_ja, english_name ),
   away_team:teams!matches_away_team_id_fkey ( name, name_ja, english_name ),
   competition:competitions!matches_competition_id_fkey ( name, name_ja, season, family )
   ```
3. `competitionLabel` / `homeDisplayName` / `awayDisplayName` の算出（L316-324）で、`content.language !== "en"` の場合に `name_ja ?? name` を使うよう変更（`en` の場合の `english_name` 優先ロジックは変更しない）
4. `appendOfficialReplyFields` 呼び出し（L432-438）の `awayTeamNameJa` / `homeTeamNameJa` を `name_ja ?? name` に変更

具体的なbefore/afterコードは spec の Part 1 「実装詳細」節にそのまま記載されているので、そのとおりに適用すること。

### 受け入れ条件（Part 1）

- ビルド・TypeScriptエラーなし
- `content.language === "en"` の挙動は変更されていない（既存の `english_name` 優先ロジックのまま）
- `name_ja` が null のチーム・大会では従来通り `name`（英語）にフォールバックする（クラッシュしない）

### エッジケース・注意事項（Part 1）

- `competitionLabel` に season を含める既存の結合処理がすでに別の場所にある場合、二重結合にならないよう確認すること（spec の「未解決の質問」参照）。見つからなければ spec 記載の `${name_ja ?? name} ${season ?? ""}`.trim() 形式で統一してよい
- この修正は `buildTweetText` / `buildLinklessReplyText`（`lib/x/post.ts`）自体には手を加えない。呼び出し側（route.ts）で渡す引数を正しい日本語名にするだけで十分

---

## Part 2: プレビュー冒頭パターンの収束解消

### タスク

`lib/llm/prompts/generate-preview.ts` の「この試合の核心」セクションが、LLMに3パターンを提示しているにもかかわらず実際には数値対決型に強く収束している（直近40件サンプル中82%）。LLMに選ばせるのをやめ、コード側で `key_stats.result_streak` と `match_phase` から使用パターンを決定論的に選択する方式に変更する。

### 変更ファイルと内容（1ファイルのみ）

`lib/llm/prompts/generate-preview.ts`

1. `selectCorePattern` 関数を新規追加（`match_phase` がプレーオフ系なら `"context"`、`result_streak` が winning/losing のいずれかなら `"form"`、それ以外は `"numeric"`）
2. `NUMERIC_AXES` 配列を新規追加（3つの比較軸: 得点/失点、得失点差、勝率）
3. `buildCoreQuestionBlock` 関数を新規追加し、選択されたパターンに応じた指示文のみを返す（3パターン全部を毎回提示しない）。`numeric` の場合は `matchId` の文字コード合計を `NUMERIC_AXES.length` で割った余りで軸を選ぶ
4. 既存の `coreQuestionBlock` 変数の代入を `buildCoreQuestionBlock(assembled, assembled.match.id)` の呼び出しに置き換える
5. `PROMPT_VERSION` を `"preview@3.5.0"` に更新

具体的なコードは spec の Part 2「実装詳細」節にそのまま記載されているので、そのとおりに適用すること。`assembled.match.id` の実際のフィールド名は既存の `AssembledContentInput` 型定義で確認し、異なる場合は合わせること。

### 受け入れ条件（Part 2）

- ビルド・TypeScriptエラーなし
- `PROMPT_VERSION === "preview@3.5.0"`
- 既存の `tests/llm/*.ts` が通る（`coreQuestionBlock` の文字列に対するアサーションがあれば更新すること）
- 手動確認: `result_streak` が winning/losing の試合でフォーム型の文言が、`match_phase` がプレーオフ系の試合で大会文脈型の文言が生成されること

### エッジケース・注意事項（Part 2)

- `generate-recap.ts` には一切手を加えない（対象外）
- `shared-prompt-blocks.ts` の `PROHIBITIONS_BLOCK` は変更不要
- `NUMERIC_AXES` のハッシュ選択は簡易的な分散であり、厳密な重複排除は保証しない（spec の「未解決の質問」に理由を記載）。今回はこれで十分とする

---

## 参考パターン

- `docs/codex-prompts/fix-recap-opening-variety.md` — 同種の「LLM冒頭パターン分散」修正の先行事例（recap側、実装済み）
- Part 1 と Part 2 は完全に独立しているため、レビュー・マージも別々に進めてよい
