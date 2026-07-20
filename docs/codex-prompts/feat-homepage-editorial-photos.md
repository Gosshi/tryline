`/specs/feat-homepage-editorial-photos.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- トップページ「最近レビューのある大会」セクション（`app/page.tsx:619-648`）は写真が一切ない。一方 `app/c/[competition]/page.tsx:26` の `COMPETITION_HERO_IMAGES` は大会ファミリーごとの既存画像資産（`public/visuals/{family}.jpg`）を既に持っている
- 新規の画像調達・ライセンス確認は不要で、既存アセットの流用で対応する

やること:
- `COMPETITION_HERO_IMAGES`（または同等のマッピング）を `lib/` 配下の共通モジュールに切り出し、`app/page.tsx` と `app/c/[competition]/page.tsx` の両方から参照できるようにする
- 「最近レビューのある大会」カード（`reviewedFamilies.map`）に、対応する大会ファミリーの画像をサムネイル表示する（16:9〜4:3程度）
- 「注目大会」カード（Featured Competition）の既存写真領域の比率を大きく崩さない範囲で、テキスト情報とのバランスを見直す

処理すべきエッジケース:
- 画像アセットが存在しない大会ファミリーの場合、`DEFAULT_COMPETITION_HERO` 相当のフォールバックを表示する
- モバイル幅（375px前後）でレイアウト崩れが起きないこと

完了の定義:
- specs の受け入れ条件1〜6を満たす（6番目のOwner目視確認は、実装後にスクリーンショットを添えて報告し、Owner確認を待つ形でよい）
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- ニュースサイト等、第三者のog:image再利用は実装しない（別途Owner判断が必要、spec本文「未解決の質問」参照）
- 新規画像の生成・調達はしない。既存の `public/visuals/` 配下のアセットのみを使う
- 「今後の試合」セクションへの写真追加はしない（別spec `feat-upcoming-fixture-visual-redesign.md` の対象）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- デスクトップ・モバイルのスクリーンショットを添付する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
