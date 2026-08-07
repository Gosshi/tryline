`specs/feat-migrate-to-gpt-5-6.md` の仕様を実装してください。

**着手前提**: PR #661（`fix-content-pipeline-revalidate-outside-request`）がマージ済みであること。同じ `lib/llm/pipeline.ts` を触るため、未マージなら先にそちらを片付けてください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- **調査済みの事実（再調査不要）**:
  - モデル ID `gpt-5.6-terra` は有効。実際に API を叩き、「model not found」ではなく `Unsupported parameter: 'temperature' is not supported with this model.` という具体的なパラメータエラーが返ることを確認済み
  - `temperature` の指定箇所は7つ。spec の背景にある表が実測結果
  - 価格は 2026-08-07 に OpenAI 公式価格ページで確認済み。spec の表を正とすること
- 変更対象:
  - `lib/llm/models.ts`（モデル ID）
  - `lib/llm/openai.ts`（`temperature` を送らない）
  - `lib/llm/pipeline.ts` / `lib/llm/stages/extract-facts.ts` / `qa.ts` / `verify-entities.ts` / `lib/llm/sourced-facts/fetch.ts`（`temperature` 指定の除去）
  - `lib/llm/pricing.ts`（新モデル価格とフォールバック是正）

実装のポイント:
- `temperature` は**ラッパーのシグネチャから除去する**のが望ましい。呼び出し側に引数が残っていると将来また送信されます
- `createWebSearchJsonResponse` は `options.temperature ?? 0` という既定値を持つため、**未指定でも必ず送信されます**。ここの除去を忘れると移行が失敗します
- `normalizeModelForPricing` の**無言フォールバックを直すこと**。現行は未知のモデル ID をすべて `gpt-4o` として計算するため、放置すると新モデルのコストが誤って算出され、コストアラートが静かに誤った値を出し続けます。今日この「静かに間違い続ける」問題を別件で2つ見つけたばかりです

エッジケース:
- **`temperature` 以外の非互換がある可能性**。今回の実験は `temperature` で止まったため、その先は未検証です。実装後に必ず1件生成し、別のパラメータエラーが出たら**そこで実装を止めて報告してください**。推測で他のパラメータを削らないこと
- `temperature: 0` に依存していた決定性（QA・事実抽出・実体検証）が失われます。挙動が変わる可能性があるため、気づいた点は報告してください
- 既存テストが `temperature` を期待している場合、テスト側を実態に合わせること。ただしテストを消すのではなく、送信されないことを検証する形に置き換えてください

やらないこと:
- **プロンプト本文の変更**。モデル差の効果を切り分けるため据え置きます
- QA の合格基準・文字数要件の変更
- sourced facts の収集ロジック・許可ドメインの変更
- **AI チャット（`app/api/chat/[matchId]/route.ts`）のモデル変更**。挙動特性が異なるため別途判断します
- 既存コンテンツの一括再生成
- キャッシュ入力単価の計算式への反映（別途）

テスト:
- リポジトリ全体で `temperature` の grep が0件になること
- `normalizeModelForPricing` が未知のモデル ID を無言で `gpt-4o` にフォールバックしないこと
- 新モデル3件の単価が spec の表と一致すること

完了の定義:
- spec の受け入れ条件1〜9をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **8/8 日本×オーストラリア戦（match_id `2c276057-bb3a-4617-a5b1-b7742e65f034`）のプレビューを実際に1本生成し、結果を報告してください。** 現行モデルでの実測値は「582文字 / `japanese_quality` 4 / `factual_grounding` 3」です。材料（sourced facts 4件）は同一条件なので、差分はモデル由来と判断できます。文字数・QA スコア・本文の読み比べを報告してください
- `temperature` 以外の非互換があったかを報告する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
