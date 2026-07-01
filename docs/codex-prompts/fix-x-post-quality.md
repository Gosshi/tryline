# Codex プロンプト: X投稿ドラフト品質の2件修正

仕様: `specs/fix-x-post-quality.md` を参照（内容はインライン展開しない）。

このプロンプトは独立した2つの修正（Part 1, Part 2）をまとめたものです。同一PRでも別々のPRでも構いません。どちらも既存ロジックへの小規模な変更で、アーキテクチャ変更は伴いません。

---

## Part 1: Discord/X投稿のカタカナ表記バグ（差し戻し・v2）

**注意: このPartは一度実装されましたが、レビューで不十分と判明し差し戻しになりました。** v1実装（`competition?.name_ja ?? competition?.name` を直接使う方式）はコミット済みですが、以下の理由で今回のv2実装に置き換えてください。

### v1で発覚した問題（このため差し戻し）

1. `competitions.name_ja` には season が含まれていない（例: `"シックスネイションズ"`）。v1は season 込みだった英語 `name` から season 抜きの `name_ja` に切り替えたため、**日本語投稿の大会名から season が消える退行**が発生した（32大会中31大会に影響）。
2. `competitions.name_ja` が null の大会が1件存在し（`"Nations Championship 2026"` — 本specの発端になった大会そのもの）、v1のロジックだとその大会だけ英語のまま出力される。**元のバグが再現している。**

サイト本体・LLM生成パイプラインは既に `lib/format/competition.ts` の `getCompetitionDisplayName()` / `formatCompetitionTitle()` と `lib/format/team.ts` の `getTeamDisplayName()` を使っており、これらは `nameJa → family/slugベースの辞書 → 英語name` の3段フォールバック＋season自動付加を正しく行う。**DBカラムを直接見るのではなく、この既存ユーティリティを再利用する方式に直す。**

### タスク（v2）

`app/api/cron/notify-discord/route.ts` の表示名ロジックを、自前のフォールバックチェーンから既存の `getCompetitionDisplayName` / `formatCompetitionTitle`（`lib/format/competition.ts`）と `getTeamDisplayName`（`lib/format/team.ts`）の呼び出しに置き換える。

### 変更ファイルと内容（1ファイルのみ）

`app/api/cron/notify-discord/route.ts`

1. ファイル冒頭に import を追加:
   ```typescript
   import { getCompetitionDisplayName, formatCompetitionTitle } from "@/lib/format/competition";
   import { getTeamDisplayName } from "@/lib/format/team";
   ```
2. `TeamRow` 型に `slug: string | null` を追加（`name_ja` は既にv1で追加済みのはず。なければ追加）
3. Supabaseクエリのselect句のteam部分に `slug` を追加:
   ```
   home_team:teams!matches_home_team_id_fkey ( name, name_ja, english_name, slug ),
   away_team:teams!matches_away_team_id_fkey ( name, name_ja, english_name, slug ),
   ```
   （competition側は `family` が既に選択済みなので変更不要）
4. `competitionLabel` / `homeDisplayName` / `awayDisplayName` の算出を、v1の `name_ja ?? name` 直接参照から `formatCompetitionTitle()` / `getTeamDisplayName()` 呼び出しに置き換える
5. `appendOfficialReplyFields` 呼び出しの `awayTeamNameJa` / `homeTeamNameJa` も同様に `getTeamDisplayName()` に置き換える

具体的なbefore/afterコードは spec の Part 1「実装詳細（修正版）」節にそのまま記載されているので、そのとおりに適用すること。

### 受け入れ条件（Part 1・v2）

- ビルド・TypeScriptエラーなし
- `content.language === "en"` の挙動は変更されていない（既存の `english_name` 優先ロジックのまま）
- **`competitionLabel` に season が含まれる**（例: `シックスネイションズ 2026`）— v1からの最重要差分
- **`"Nations Championship 2026"`（`name_ja` が null）でも `family` ベースの辞書経由でカタカナ表記になる**（英語のまま出力されない）
- 既存テスト（`tests/api/notify-discord.test.ts`）を更新し、season込みの `competitionLabel` と `name_ja` が null の大会ケースの両方をアサートすること

### エッジケース・注意事項（Part 1・v2）

- `formatCompetitionTitle` は「season が名前に含まれていなければ末尾に付加する」処理を内部で持っているため、二重付加を心配する必要はない
- この修正は `buildTweetText` / `buildLinklessReplyText`（`lib/x/post.ts`）自体には手を加えない。呼び出し側（route.ts）で渡す引数を正しい日本語名にするだけで十分
- `getTeamDisplayName` の `language === "en"` 分岐は `english_name` を見ない仕様（`team.name` を返すだけ）ため、英語投稿の分岐にはこのヘルパーを使わず、既存の `english_name ?? name` ロジックをそのまま残すこと

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
