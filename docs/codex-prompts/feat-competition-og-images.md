`/specs/feat-competition-og-images.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 既存の動的OG画像生成基盤は `app/api/og/route.tsx`（`@vercel/og` の `ImageResponse`、`type=result` 分岐が既存）。フォント取得ロジック（`interFont`/`fontData`/`fontName`）はファイル冒頭で共通化されているので重複取得しない
- 呼び出しヘルパのパターンは `lib/seo/og-image.ts` の既存 `createMatchOgImage` を参照する
- アクセントカラーは `lib/format/competition.ts` の `getCompetitionFamilyColor`、大会名表示は `formatFamilyName` を使う（新規実装しない）

入出力の例:
- `GET /api/og?type=competition&family_name=Pacific+Nations+Cup&accent=%23c93a3a` → 1200x630 PNG、大会名が大きく中央に表示される
- `GET /api/og?type=competition&family_name=Six+Nations&accent=%23173c74&season=2026` → 大会名の下にシーズンラベルも表示される
- `type=result` へのリクエストは従来通り試合結果カードを返す（本 spec で変更しない）

処理すべきエッジケース:
- `family_name` が42文字を超える場合は既存の `truncate` 関数で省略する
- `season` パラメータが無い場合はシーズンラベル行を描画しない
- `accent` パラメータが不正な値（CSS color として無効）の場合のフォールバック値を用意する（spec記載のデフォルト `#c93a3a` を使う）

完了の定義:
- specs の受け入れ条件 1〜7 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 主要大会（PNC・Six Nations・URC・RWC）のOG画像を実際に生成し、スクリーンショットを提示する

要件:
- 「スコープ対象外」（試合結果OG画像のデザイン変更、大会に紐付かないページのOG画像、動的スコアデータの表示）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
