`/specs/feat-bento-card-redesign.md` の仕様のうち、**「UI サーフェス」節の3のみ**を実装してください（`components/calendar/week-schedule.tsx` の非対称レイアウト化）。1・2（ホームページ）・4（料金ページFAQ）は別PRで対応するため、このPRでは触らないでください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 基準ビジュアルは `docs/design/mock-cards-b-bento.html`（`.cal-block` / `.cal-date-col` / `.cal-rows` セクション）を参照する
- `components/calendar/week-schedule.tsx` は共有コンポーネントで、`app/page.tsx:381-386`（ホーム「今週の試合」、`compact` prop あり）と `app/calendar/page.tsx:50-53`（`/calendar` ページ、`compact` なし）の両方から使われている。両方の呼び出し元で見た目が破綻しないこと
- `groupMatchesByJstDay` のグルーピングロジック・`MatchRow` が持つ情報（大会名・チーム名・スコア/時刻・ステータスバッジ・「解説」バッジ）は変更しない。変更するのは日付見出しとレイアウト構造のみ

入出力の例:
- 変更前: 各 `DayGroup` は「日付テキスト見出し＋試合数」の上に、試合の`<ul>`が縦に並ぶ
- 変更後: 左に固定幅の縦長日付ブロック（曜日＋日付数字、濃色背景）、右に試合行が縦に並ぶ横並びレイアウト。`compact` 時は日付ブロックを一回り小さくする

処理すべきエッジケース:
- 1日に試合が1件のみの日、5件以上ある日の両方でレイアウトが崩れないこと
- `matches.length === 0` の空状態表示（既存の `rounded-xl border-dashed` メッセージ）は変更しない
- `compact` と非`compact` の両方の呼び出し元（ホーム・カレンダーページ）で実際に表示確認すること

完了の定義:
- specs の受け入れ条件のうち3・6・7・8を満たす（1・2・4は対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- ホーム（`compact`）と `/calendar`（非`compact`）両方のスクリーンショットを提示する

要件:
- `MatchRow` が表示する情報の種類は変更しない（レイアウトのみ変更）
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
