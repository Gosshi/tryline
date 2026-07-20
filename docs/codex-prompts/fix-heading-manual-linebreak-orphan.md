`/specs/fix-heading-manual-linebreak-orphan.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- Ownerが本番サイト（1920px幅）で実機確認・スクリーンショットで再現済みのバグ: トップページ「注目大会」カード（`components/featured-competition-card.tsx:47`）の見出しが「ネーションズチャンピオンシップ 2026 を追」で改行され、「う」1文字だけが2行目に孤立する
- 同種の問題（読点・`<wbr>`・手動`<br>`の多用による不自然な改行）が `app/page.tsx:266-274` のメインヒーロー見出しにもある

やること:
- `components/featured-competition-card.tsx:47` の見出しに `text-wrap: balance`（または同等の孤立文字防止CSS）を適用する
- それでも孤立文字が解消しない場合は、`lib/featured-competition.ts` の `headline` 文言短縮を検討し、変更する場合はOwnerに確認してから実施する
- `app/page.tsx:266-274` のメインヒーロー見出しの手動改行制御（`<br>` ・ `<wbr>`）を整理し、`text-wrap: balance` を基本に、本当に必要な箇所だけ改行制御を残す

処理すべきエッジケース:
- `text-wrap: balance` 未対応ブラウザでのフォールバック挙動を確認する
- モバイル幅（375px前後）で両見出しが適切に折り返されること

完了の定義:
- specs の受け入れ条件1〜6を満たす（6番目のOwner目視確認は、実装後にスクリーンショットを添えて報告し、Owner確認を待つ形でよい）
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- 見出し文言自体を変更する場合は、変更前にOwnerへ確認する（実装を一旦停止して質問する）
- `app/pricing/page.tsx` 等、spec本文で言及していない他ページの見出しは対象外
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 1920px・1440px・375pxのスクリーンショットを添付し、孤立文字が解消されたことを示す
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
