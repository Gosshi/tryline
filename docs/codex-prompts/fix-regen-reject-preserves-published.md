# Codex プロンプト: fix-regen-reject-preserves-published

```
specs/fix-regen-reject-preserves-published.md を実装してください。

- AGENTS.md の規約に従うこと
- 仕様書と実環境に食い違いがあれば、その場で実装を停止して Owner に確認すること
- スコープ対象外（QA判定ロジック・workflow yaml・スクリプトのフラグ追加）は実装しないこと

### 実装対象

lib/llm/pipeline.ts の match_content 永続化ブロック（約608〜625行の upsert）。
persistedStatus が 'draft' になるケースで、既存行が published のときだけ upsert をスキップして温存する。
温存時は notifyContentRejected の通知文言に「既存 published を温存した」旨と reject 理由（qa_scores.issues・字数）を含める。

### 入出力例

- 既存 published(1500字) + 再生成 reject(700字) → DB 無変更・通知「reject/published温存」
- 既存 published + 再生成 publish → 新本文で上書き（現行どおり）
- 行なし + reject → draft insert（現行どおり）

### エッジケース（必ずテストで押さえる）

- 既存 published 行の content_md/status/generated_at/qa_scores が reject 後に一切変わらないこと（前後比較）
- 既存 draft + reject → 更新される（温存しない）
- preview+ja / recap+ja の両方
- ja recap の density ゲート起因 draft（verdict=publish だが densityBlocked）でも同じ温存規則が適用されること

### 完了の定義

- 仕様書の受け入れ条件 1〜7 を満たす
- tests/ 配下の既存 pipeline テスト構成に倣いテスト追加
- pnpm tsc --noEmit / lint / test / build が通る
```

## Owner 向け運用メモ

- **木曜 21:05 JST の次回 weekend-preview-refresh 実行までにマージ必須**。間に合わない場合は GitHub Actions で該当 workflow を一時 disable する選択肢もある
- マイグレーション不要・API 契約変更なし
