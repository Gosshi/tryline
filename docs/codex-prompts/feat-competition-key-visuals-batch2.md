`/specs/feat-competition-key-visuals-batch2.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象ファイルは `app/c/[competition]/page.tsx` のみ
- **画像生成 API は呼び出さないこと。** 画像は Owner が既に用意し、`public/visuals/urc.jpg` / `top-14.jpg` / `autumn-nations.jpg` / `pnc.jpg` / `league-one.jpg` としてワークツリーに配置済み

**重要: この5つの画像ファイルは現時点で git 未追跡（untracked）です。コミットに含めるのを忘れないでください。** `git status` で `public/visuals/` 配下に未追跡ファイルがあることを確認し、実装のコード変更と一緒に必ず `git add` してコミット・PR に含めること。画像ファイルが PR に含まれていない状態で完了報告をしないこと。

入出力の例:
- 変更前: `COMPETITION_HERO_IMAGES` に `premiership` / `rugby-championship` / `six-nations` / `super-rugby-pacific` の4エントリのみ
- 変更後: 上記4件に加えて `urc` / `top-14` / `autumn-nations` / `pnc` / `league-one` の5エントリが追加され、計9エントリになる

処理すべきエッジケース:
- `nations-championship` はマップに追加しないこと（画像が無いため、意図的に `DEFAULT_COMPETITION_HERO` にフォールバックさせる）
- 既存4エントリの値・フォールバックロジック（`DEFAULT_COMPETITION_HERO`）は変更しないこと

完了の定義:
- `COMPETITION_HERO_IMAGES` に5エントリが追加されている
- `public/visuals/urc.jpg` / `top-14.jpg` / `autumn-nations.jpg` / `pnc.jpg` / `league-one.jpg` の5ファイルが `git status`/`git diff --stat` 上でこの PR に含まれていることを確認する
- `/c/urc`・`/c/top-14`・`/c/autumn-nations`・`/c/pnc`・`/c/league-one` でヒーロー画像の表示をスクリーンショット確認する
- `pnpm tsc --noEmit` / `pnpm build` が通る

要件:
- 受け入れ条件セクションのすべてを実装する
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイル・追加した画像ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
