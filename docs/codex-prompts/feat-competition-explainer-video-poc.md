`/specs/feat-competition-explainer-video-poc.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- これは PoC（1本の試作生成のみが目的）です。毎週の自動運用化・SNS投稿連携・DB永続化は明確にスコープ対象外です
- 台本生成は `lib/llm/pipeline.ts` や `lib/llm/stages/generate-narrative.ts` 等、既存のLLM呼び出しパターン（`lib/llm/openai.ts` 経由、モデルIDは `lib/llm/models.ts` の `MODELS` 定数を使う）に従うこと。TTS用に `MODELS.TTS` を新設すること
- 画像スライドのデザインは `.claude/skills/x-post/SKILL.md` の「データ画像の作り方」節にある既存の手動フロー（HTML+CSS、`app/globals.css` のCSS変数、日本語表示崩れを防ぐシステムフォント指定）を踏襲するが、本PoCでは手動のPlaywright MCP操作ではなく、スクリプト内でheadless browserを直接呼び出して自動化すること
- 大会データの取得は `lib/db/queries/` 配下の既存クエリパターン（`getCompetitionBySlug` 等、実際の関数名はコードベースを確認）を再利用すること

入出力の例:
- `node --env-file=.env.local tools/run-ts.cjs scripts/generate-competition-explainer-video.ts --family=nations-championship --season=2026` → ローカルに `tmp/video-poc/` 等の出力先へ、台本テキストファイル（例: `script.txt`）と動画ファイル（例: `explainer.mp4`、60秒以内・縦型9:16・日本語ナレーション付き）が生成される
- 実行ログに、生成コスト概算（台本生成+TTS合計、目安$0.05未満）と、使用したDBデータの要約（大会名・シーズン・参照した試合数等）が出力される

処理すべきエッジケース:
- 指定した大会の試合データが極端に少ない、または存在しない場合はエラーで終了し、動画生成を試みない
- TTS API呼び出しが失敗した場合、部分生成物（台本テキストのみ等）を残さず、明確なエラーメッセージで終了する
- 生成コストが$0.05を超えた場合は警告をログ出力する（処理自体は継続してよい）
- 台本に含まれる数値・チーム名がDBデータの範囲を超えないよう、既存のfabrication-guard相当の考え方（`lib/content/fabrication-guard.ts` 等、実際のファイルを確認）を踏襲した検証を入れること

完了の定義:
- specs の受け入れ条件 1〜6 をすべて満たす（受け入れ条件6の品質評価自体はOwnerが行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 新規依存関係（headless browser、ffmpeg関連ライブラリ等）を追加した場合は `package.json` の変更内容を完了報告に明記する

要件:
- スコープ対象外（週次自動運用化、SNS投稿API連携、DBスキーマ変更、大会ハブページへのUI埋め込み）は実装しない
- 未解決の質問（TTS音声選定、画像スライドの枚数・構成、動画合成ツールの選定、題材大会の選定）は実装判断で進めて良いが、判断の根拠を完了報告に記載する

完了時:
- 実装内容、変更ファイルを要約する
- 生成された動画・台本テキストの場所を報告する
- 実際にかかった生成コストを報告する
- 仕様書からの逸脱があれば理由を明示する
