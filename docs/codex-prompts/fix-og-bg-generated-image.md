`/specs/fix-og-bg-generated-image.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `public/og-bg.png` のアセット差し替えのみ。`app/api/og/route.tsx` はコード変更不要（パス `/og-bg.png` を変更しないため）
- `sharp`（`package.json` に既存）を使って `public/visuals/og-bg.jpg` を 1200x630 の PNG に変換する
- `public/visuals/og-bg.jpg` は既に配置済み。画像生成は不要

入出力の例:
- 変更前: `public/og-bg.png` が旧アセット
- 変更後: `public/og-bg.png` が `public/visuals/og-bg.jpg` を 1200x630 PNG 変換した内容に差し替わっている

処理すべきエッジケース:
- 次元を必ず 1200x630 に合わせること（`resize` の `fit: "cover"` を使うか、元画像の比率を確認して適切に調整すること）
- 変換に使った一時スクリプトはコミットせず実行後に削除すること
- `app/api/og/route.tsx` に一切コード変更が無いことを確認すること（`git diff` で確認）

完了の定義:
- `public/og-bg.png` が新しい内容・1200x630 次元になっている
- `/api/og?type=result&home=Test&away=Team&hs=10&as=5` と `/api/og?home=Test&away=Team` の両方をローカルで叩き、背景画像が正しく表示されることを確認する（`pnpm dev` 起動後 `curl` でレスポンス取得、または画像として保存して目視確認）
- `pnpm build` が通る

要件:
- 受け入れ条件セクションのすべてを実装する
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容を要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
