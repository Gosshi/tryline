`/specs/fix-lipovitan-challenge-cup-header-nav.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- リポビタンDチャレンジカップ2026（PR #626, #627）は本番DBに投入済みだが、ヘッダーの大会ドロップダウン（`components/competition-nav-dropdown.tsx`の`HEADER_COMPETITIONS`）に含まれておらず、サイト内から発見する主要な導線がない

やること:
- `components/competition-nav-dropdown.tsx`の`HEADER_COMPETITIONS`配列に以下を追加する:
  ```ts
  {
    family: "lipovitan-challenge-cup",
    href: "/c/lipovitan-challenge-cup",
    label: "リポビタンDチャレンジカップ",
  },
  ```
- 追加位置は既存の並び順（大会の格・地域でゆるく分類されている）に合わせて`autumn-nations`・`pnc`の近くが妥当。厳密でなくてよい

処理すべきエッジケース:
- `components/mobile-header-menu.tsx`が同じ`HEADER_COMPETITIONS`を参照しているか確認し、参照していれば追加実装不要。別の配列を持っている場合はそちらにも同様に追加する

完了の定義:
- specの受け入れ条件1〜4を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- `HEADER_COMPETITIONS`をDB連動に変更するような大きな設計変更はしない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- デスクトップ・モバイル両方のヘッダーメニューにリンクが表示されることを確認したスクリーンショットまたは確認方法を報告する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
