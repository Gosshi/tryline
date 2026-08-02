# Codex プロンプト: fix-ios-privacy-policy-mobile-data

`specs/fix-ios-privacy-policy-mobile-data.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 対象ファイルは `app/legal/privacy/page.tsx` のみ。静的テキストページで、追加する文言はspecに確定済みなので、文言自体を変える判断は不要
- 既存の`<ul>`リスト構造・`thirdPartyServices`配列の書式（1行=1タプル）を踏襲する

要件:
- specの「UIサーフェス」に記載した4点(収集する情報への追加/利用目的への追加/thirdPartyServicesへの行追加/最終更新日の更新)をそのまま反映する
- 既存のメール・Stripe・GA4に関する記載は一切変更しない
- 「最終更新日」は実装日（コミット日）に更新する

やらないこと:
- App Store Connect側の設定変更(このプロンプトの対象外、Owner対応)
- Web側の新規データ収集の追加実装

完了の定義:
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` が通る(既存テストに影響がないことを確認、新規テストは静的テキストのみのため不要)
- 変更ファイルを報告する

完了時:
- 変更内容を要約する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
