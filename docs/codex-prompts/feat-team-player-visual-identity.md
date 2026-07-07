`/specs/feat-team-player-visual-identity.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 既存のユーティリティを使う。新規データ・新規画像生成は不要: `getTeamColor(slug)`（`lib/format/team-identity.ts`）、`getPositionGroup(position)`（`lib/utils/rugby-positions.ts`）
- 対象ファイル: `app/teams/[slug]/page.tsx:99-117`、`components/team-players-section.tsx`、`app/players/[slug]/page.tsx:103-135`
- 新規コンポーネント `components/player-avatar.tsx` を作る（仕様書にサンプル実装あり。座標・形状の細部は裁量でよいが、「顔の特徴を描かない・正面向きの抽象的な人型シルエット」という条件は守ること）
- 参考: `public/logos/*.svg` は公式エンブレムでなく自作の簡易バッジ。今回のアバターも同じ「自作シンプル素材」路線

入出力の例:
- チームページ（例: `/teams/japan`）: ヘッダー背景が白一色から `getTeamColor("japan")` を使った薄いカラーグラデーションに変わる
- 選手一覧（`/teams/japan` の選手セクション）: 各選手名の左に、ポジション（FW/BK）で色分けされた円形シルエットアイコンが付く
- 選手ページ（例: `/players/kotaro-matsushima`）: プロフィール見出しの左に同じシルエットアイコン（サイズ48px）が付く
- クラブチーム（例: URC所属クラブ）のページは `getTeamColor` がフォールバック色（`#94a3b8`グレー）を返すため、背景は薄いグレーのグラデーションになる。これは既存の仕様であり崩れなければ問題ない

処理すべきエッジケース:
- `player.position` が `null` の選手は `getPositionGroup` が `"unknown"` を返すので、アイコンは `--color-ink-muted` 色になる（エラーにしない）
- クラブチーム（`getTeamColor` フォールバック）でも背景グラデーションが破綻しないこと
- 選手一覧グリッドの既存レイアウト（`grid-cols-2 sm:grid-cols-3 md:grid-cols-4`）にアイコン追加後も崩れないこと

完了の定義:
- specs の受け入れ条件6項目すべてを満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 国代表チーム1例・クラブチーム1例・選手ページ1例のスクリーンショットまたは説明を提示する

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目（AI生成画像、実在選手要素、クラブチーム専用配色マップの新規作成）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
