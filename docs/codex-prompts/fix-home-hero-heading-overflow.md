`/specs/fix-home-hero-heading-overflow.md` の仕様を実装してください。

バグ: PR #500（`feat-home-matchday-board.md`）マージ後、本番 `https://www.trylinerugby.com/` のヒーロー見出し「今週の海外ラグビーを、日本時間で追う。」と Matchday board が、320px・375px・1440px で画面右側にあふれて見切れる。

再現手順:
1. `/` を 320px・375px・1440px の各幅で開く
2. ヒーロー h1 のテキストと、右側の Matchday board（`aria-label="今週の注目試合"`）を確認する

期待動作: h1・Matchday board とも画面内に収まり、水平方向のはみ出し・クリップが発生しない
実際の動作: h1 のテキストがコンテナ幅を大きく超えて1行のまま描画され、ヒーロー `<section>` の `overflow-hidden` によって見切れる。lg未満（320/375px）では Matchday board も巻き添えで見切れる

調査済み（DOM 実測で確認済み。詳細は spec の「背景」節を参照）:
- h1 に付いている `break-keep`（`word-break: keep-all`）が、空白のない「今週の海外ラグビーを、」全体を分割不可能な1行として扱っている
- 旧コピー「海外ラグビーを、」（7文字・単カラム全幅レイアウト）では同じ `break-keep` でも問題なかった。新コピー（11文字）+ PR #500 の2カラム化でコンテナ幅が狭くなった（実測: 1440px時636px、375px時343px）ことで顕在化した
- 375px時のテキスト行幅は514.8px（コンテナ343px比+172pxオーバー）、1440px時は772px（h1箱幅636px比+136pxオーバー）
- lg未満のグリッドコンテナに明示的な `grid-template-columns` が無いため、h1 の分割不可能な最小幅が暗黙グリッドの auto トラック幅を押し広げ、同じ列の Matchday board も巻き添えで広がる

原因と思われる場所: `app/page.tsx` のヒーロー h1（`break-keep` クラス）と、その親のグリッドコンテナ（`grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px]`、lg未満で列指定なし）

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- spec の UI サーフェス節に修正後の具体的なコード（`<wbr />` 挿入位置、グリッドクラスの変更）を記載済み。そのまま反映する
- `break-keep` は `app/page.tsx` のこの h1 でのみ使用されている（他コンポーネントに影響なし。`grep -rn "break-keep" app components` で確認可能）

処理すべきエッジケース:
- `<wbr />` 挿入後、`tests/app/home-page.test.tsx` の既存 h1 テキストアサーション（`screen.getByText(...)` 等）がテキストノード分割によって失敗する場合は、アサーション方法を調整する（例: `container.querySelector("h1")?.textContent` で結合テキストを比較する）
- 320px幅で `<wbr />` 4分割でもまだあふれる場合、spec の「未解決の質問」に従い、「ラグビー」より短い単位への分割は避けつつ調整し、対応内容を完了報告に明記する
- グリッドクラス変更が Matchday board 非表示時（`homepageWeekMatches.length === 0` で `max-w-3xl` 分岐）に影響しないこと

成果物: 修正 + リグレッションテスト（`tests/app/home-page.test.tsx` の更新を含む）

完了の定義:
- specs の受け入れ条件 1〜7 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 320 / 375 / 768 / 1440px のスクリーンショットを提示し、h1・Matchday board が画面内に収まっていることを示す

要件:
- コピー文言・`break-keep` 自体の削除・Matchday board 内部レイアウトは変更しない（スコープ対象外）
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
