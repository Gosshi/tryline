# Codex プロンプト: fix-recap-placeholder-time-promise

```
specs/fix-recap-placeholder-time-promise.md を実装してください。

- AGENTS.md の規約に従うこと
- 変更は components/content-placeholder.tsx の COPY.recap.pre_window の文言のみ
  （preview 側・preparing/unavailable・表示ロジックは変更しない）

変更前: レビューは試合終了 1 時間後に公開予定
変更後: レビューは試合データの確認後、順次公開されます

### 完了の定義

- 仕様書の受け入れ条件 1〜4 を満たす
- 該当文言を参照する既存テストがあれば期待値を更新
- pnpm tsc --noEmit / lint / test / build が通る
```
