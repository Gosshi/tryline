既存のPR #491（ブランチ `codex/feat-bento-card-redesign-pricing-faq`）に対する修正依頼です。新規PRは作らず、このブランチに修正コミットを追加してください。

CI（`pnpm test`）で `tests/app/pricing-page.test.tsx` の `renders the redesigned pricing landing page sections` が失敗しています。これは実装の不具合ではなく、テストが**リデザイン前の常時展開状態**を前提にしているためです。新しいアコーディオンでは、2件目以降のFAQ（ヒーロー表示される1件目以外）は初期状態で回答が非表示（DOMに存在しない）で、対応する質問をクリックして展開するまで回答テキストは現れません。

失敗箇所: `screen.getByText("試合スコア・順位表・ラインナップ・...")`（FAQ2件目「無料でどこまで利用できますか？」の回答）を、クリックせずに探している。

修正内容（テストのみ。実装は変更不要）:
- `tests/app/pricing-page.test.tsx` の該当箇所で、まず「無料でどこまで利用できますか？」の質問ボタン（`screen.getByRole("button", { name: "無料でどこまで利用できますか？" })` 等）を `fireEvent.click` または `userEvent.click` でクリックしてアコーディオンを展開してから、回答テキストの `getByText` を実行するように変更する
- `@testing-library/user-event` が既にプロジェクトで使われていればそれに合わせる（他のテストの慣例を確認すること）
- テストの検証意図（「そのFAQの回答が正しく表示される」）は変えないこと

完了の定義:
- `pnpm test` で該当テストを含む全テストが通る
- `pnpm tsc --noEmit` / `pnpm lint` clean
- 実装ファイル（`components/pricing-faq.tsx` / `app/pricing/page.tsx`）は変更しない（前回のPR内容のまま）

完了時:
- 変更したテストの内容を要約する
- 曖昧な箇所があれば質問として記載する
