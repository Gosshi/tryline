既存のPR #490（ブランチ `codex/feat-bento-card-redesign-calendar`）に対する修正依頼です。新規PRは作らず、このブランチに修正コミットを追加してください。

CI（`pnpm test`）で `tests/components/week-schedule.test.tsx` の `groups matches by JST day and links every match page` が失敗しています。これは実装の不具合ではなく、テストが**リデザイン前の日付表記**（`"2026-06-08 (月)"` という単一のテキスト）を探しているためです。新デザインでは日付が曜日（`月`）・日（`8`）・月（`6月`）の3つの別要素に分割されているため、`screen.getByText("2026-06-08 (月)")` が一致しません。

修正内容（テストのみ。実装は変更不要）:
- `tests/components/week-schedule.test.tsx` の該当アサーション（`screen.getByText("2026-06-08 (月)")` を含む2箇所、同様の `"2026-06-09 (火)"` があれば同様に）を、分割された新しいDOM構造に合わせて書き換える
- 推奨アプローチ: 各日付グループの `<section aria-labelledby="calendar-YYYY-MM-DD">` の `id` を使って要素を特定する（例: `document.getElementById("calendar-2026-06-08")` の親 `section` を取得し、そこに対して `toHaveTextContent` で試合数を検証する）。あるいは日・曜日・月それぞれを個別に `getByText` で検証してもよい
- テストの検証意図（「その日付グループに何試合あるか」）は変えないこと

完了の定義:
- `pnpm test` で該当テストを含む全テストが通る
- `pnpm tsc --noEmit` / `pnpm lint` clean
- 実装ファイル（`components/calendar/week-schedule.tsx`）は変更しない（前回のPR内容のまま）

完了時:
- 変更したテストの内容を要約する
- 曖昧な箇所があれば質問として記載する
