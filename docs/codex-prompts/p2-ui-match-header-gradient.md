# Codex Prompt: MatchHeader スコアエリアにチームカラーグラデーション背景を追加

## 前提

`p2-ui-match-header-colors.md` が完了していること（`getTeamColor` のインポートと上部 4px カラー帯が実装済み）。

---

## 背景

現在の `components/match-header.tsx` は上部に 4px のチームカラー帯を持つが、スコア表示エリア全体の背景は白のまま。スポーツアプリ（ESPN・BBC Sport）のスコアカードは、ホームチームカラーを背景の薄いグラデーションとして使い、試合のアイデンティティをエリア全体で表現している。

スコアエリアの `<div>` にホームチームカラーの薄いグラデーション背景を追加し、「スポーツアプリらしさ」を強化する。

---

## 変更対象ファイル

`components/match-header.tsx` のみ

---

## Task — スコアエリアにグラデーション背景を適用

スコアと試合情報を含む `<div className="px-5 py-7 sm:px-6 sm:py-8">` に `background` の inline style を追加する。

### 変更前

```tsx
<div className="px-5 py-7 sm:px-6 sm:py-8">
  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
```

### 変更後

```tsx
<div
  className="px-5 py-7 sm:px-6 sm:py-8"
  style={{
    background: `linear-gradient(135deg, ${homeColor}18 0%, transparent 60%)`,
  }}
>
  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
```

**変更のポイント:**
- `homeColor` は既存の `const homeColor = getTeamColor(match.homeTeam.slug)` をそのまま使用
- `${homeColor}18` は hex カラーに透明度 `18`（約 9%）を付加した値。薄すぎず主張しすぎない強度
- グラデーション方向 `135deg`（左上→右下）でホーム側（左）から淡くフェードアウト
- `transparent 60%` でスコア中央・アウェイ側は完全に白に戻り、テキスト可読性を維持

---

## 透明度の調整目安

`homeColor` が `#009A44`（アイルランドの緑）の場合：
- `${homeColor}18` → 透明度 9.4%（推奨）
- `${homeColor}20` → 透明度 12.5%
- `${homeColor}24` → 透明度 14%（上限目安）

`30` 以上は主張が強くなりすぎるため避ける。

---

## 完了条件

- [ ] スコアエリア左側にホームチームカラーの薄いグラデーション背景が表示される
  - 例: Ireland（緑）ホームの試合 → 左上から薄い緑のグラデーション
  - 例: France（青）ホームの試合 → 左上から薄い青のグラデーション
- [ ] スコアの数字・チーム名のテキストが背景に埋もれず読める（コントラスト維持）
- [ ] カードの角丸・上部カラー帯は引き続き正常に表示される
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- `MatchHeader` のレイアウト構造（grid、items-center 等）
- 上部 4px カラー帯（`borderTopColor`・`borderTopWidth`）
- `TeamBlock` コンポーネント
- スコア・チーム名のフォント・サイズ
