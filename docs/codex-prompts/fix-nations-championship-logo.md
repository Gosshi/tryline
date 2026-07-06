`/specs/fix-nations-championship-logo.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象ロジックは `app/page.tsx` の `COMPETITION_LOGO_FAMILIES`（44-55行目）と `getCompetitionLogoSrc`（57-61行目）
- 既存の他大会ロゴ10点（`public/logos/six-nations.svg`、`urc.svg`、`top-14.svg` 等）はいずれも公式エンブレムの複製ではなく、`viewBox="0 0 64 64"` の角丸背景＋ブランドカラー＋簡易アイコンまたは略称テキストで構成された自作バッジ。同じ形式で新規作成すること
- Nations Championship のブランドカラーは `lib/format/competition.ts` の `COMPETITION_FAMILY_COLORS["nations-championship"]`（`#1A3A5C`）に既に定義済みなのでそれを使う

入出力の例:
- 変更前: ホームページの大会リストで Nations Championship が `/logos/default-competition.svg`（汎用プレースホルダー）で表示される
- 変更後: `/logos/nations-championship.svg`（`#1A3A5C` 地に白文字で "NC" 等の短い略称、既存ファイルと同じトーン）で表示される
- 参考: `public/logos/six-nations.svg` は `<rect fill="#001489" rx="14"/>` + `<text>6N</text>` という構成

処理すべきエッジケース:
- `COMPETITION_LOGO_FAMILIES` への追加により、他の既存大会（`six-nations`、`urc` 等）のロゴ表示に影響が出ないこと
- 新規SVGのファイルサイズ・寸法・構造（`viewBox`、`role="img"`、`aria-label`）を既存10点と揃えること

完了の定義:
- specs の受け入れ条件5項目すべてを満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目（公式トレードマーク付き素材の使用）は行わない。自作の簡易バッジに留める
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する（または未実装の理由）
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
