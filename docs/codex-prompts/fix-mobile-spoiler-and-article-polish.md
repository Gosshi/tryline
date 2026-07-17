# Codex プロンプト: fix-mobile-spoiler-and-article-polish

**tryline-mobile リポジトリ**で貼る（仕様書コピー設置済み: `docs/specs/fix-mobile-spoiler-and-article-polish.md`）。`feat-team-flag-identity` とは独立、並行実装可。

---

`docs/specs/fix-mobile-spoiler-and-article-polish.md` の仕様を実装してください。

コンテキスト:
- `AGENTS.md` を読む
- 対象: `src/components/ScoreText.tsx`・`src/matches/ContentSection.tsx`
- アイコンライブラリの追加が必要な場合（eye-off 相当）、`expo` エコシステムで標準的なもの（`@expo/vector-icons` 等）を使ってよい。新規依存追加は最小限に

エッジケース:
- マスク時のタップで `revealMatch` が呼ばれる既存の挙動（`feat-mobile-editorial-polish` で実装済み）を壊さない
- 固定領域のサイズはマスク時・開示時で完全に同一（padding/margin の差異にも注意）

完了の定義: 受け入れ条件 1〜7 のテスト、CI green、修正後のカレンダー・試合詳細・記事表示のスクリーンショットを PR に添付（受け入れ条件 8 の Owner 目視用）。
