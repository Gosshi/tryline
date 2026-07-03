`/specs/feat-home-hero-generated-image.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象ファイルは `app/page.tsx` のみ（`public/hero-bg.mp4` の削除も含む）
- `public/visuals/home-hero.jpg` は既に配置済み。画像生成は不要

入出力の例:
- 変更前: `<video autoPlay loop muted playsInline preload="none"><source src="/hero-bg.mp4" type="video/mp4" /></video>`
- 変更後: `<Image alt="" className="object-cover object-center opacity-25" fill priority sizes="100vw" src="/visuals/home-hero.jpg" />`

処理すべきエッジケース:
- `opacity-25` と `<div className="bg-[var(--color-ink)]/60 absolute inset-0" />` オーバーレイは既存のまま維持すること（テキスト可読性のため）
- ヒーローのテキスト・CTA・`HeroTexture`・右側装飾パネルは一切変更しないこと
- `public/hero-bg.mp4` を削除した後、他にこのファイルを参照している箇所が無いことを確認すること（`grep -rn "hero-bg.mp4" app components` 等）

完了の定義:
- `app/page.tsx` のヒーロー背景が `Image` コンポーネントに置き換わっている
- `public/hero-bg.mp4` が削除されている
- デスクトップ・モバイル（375px）双方でヒーローのスクリーンショットを確認する
- `pnpm tsc --noEmit` / `pnpm build` が通る

要件:
- 受け入れ条件セクションのすべてを実装する
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
