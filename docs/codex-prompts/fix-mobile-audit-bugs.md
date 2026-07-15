# Codex プロンプト: fix-mobile-audit-bugs

**tryline-mobile リポジトリ**で貼る（仕様書コピー設置済み: `docs/specs/fix-mobile-audit-bugs.md`）。束2（`feat-mobile-editorial-polish`）より**先に**実装・マージする。

---

`docs/specs/fix-mobile-audit-bugs.md` の仕様を実装してください。デザイン監査（2026-07-15）で特定したバグ級 6 項目の修正です。

コンテキスト:
- `AGENTS.md` を読む
- 対象: `app/_layout.tsx` または `app/matches/[id]` のスタック設定・`src/matches/MatchDetailScreen.tsx`・`src/components/MatchCard.tsx`・`src/components/ScoreText.tsx`・`src/components/Screen.tsx`・`src/theme/tokens.ts`・`app/auth/sign-in.tsx`
- **見た目の方針変更（角丸・影・密度）はやらない**。束2 の仕様書に定義済みで、混ぜるとレビューできなくなる

エッジケース:
- 戻るラベル非表示の API は expo-router のバージョンで名前が違う。実装前に現バージョンのドキュメント/型定義で確認し、`(tabs)` が出る全経路（タブ→詳細、詳細→詳細）で検証
- `adjustsFontSizeToFit` は `numberOfLines` と併用しないと効かない
- muted 色変更はトークン 1 箇所のみ。個別コンポーネントに色のハードコードを足さない
- コントラスト比のテストは WCAG の相対輝度式で計算する（ライブラリ追加不可、20 行程度の純関数で足りる）

完了の定義: 受け入れ条件 1〜7 のテスト、CI green、修正後の 01 / 04 / 07 / 09 / 12 相当のスクリーンショットを PR に添付（受け入れ条件 8 の Owner 目視用）。
