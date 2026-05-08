# feat-team-badge: チームバッジ SVG コンポーネント

## 背景

チームロゴは商標権の問題で使用できないため、チームカラー＋ショートコードで生成する SVG バッジを実装する。ライセンスフリーで全チームに対応できる。

既存の `lib/format/team-identity.ts` に `getTeamColor`・`getTeamStripe`・`getTeamFlagSvg` が定義済みであり、これを活用する。

---

## Task 1 — `getTeamStripeColors` を `lib/format/team-identity.ts` に追加

`getTeamStripe` が返す CSS 文字列からは色配列を取り出せないため、色配列を直接返す関数を追加する:

```ts
export function getTeamStripeColors(slug: string): string[] {
  return TEAM_STRIPES[slug] ?? [TEAM_IDENTITY[slug]?.color ?? "#94a3b8"];
}
```

既存の関数・定数は一切変更しない。

---

## Task 2 — `TeamBadge` コンポーネント新規作成

### ファイル: `components/team-badge.tsx`

Props:

```ts
type TeamBadgeProps = {
  slug: string;
  shortCode: string;
  size?: number; // px、デフォルト 32
};
```

### 表示ロジック

**国代表チーム（`getTeamFlagSvg(slug)` が空文字でない場合）:**

```tsx
<span
  style={{ width: size, height: size, display: "inline-flex", flexShrink: 0 }}
  dangerouslySetInnerHTML={{ __html: flagSvg }}
/>
```

**クラブチーム（flag SVG が空の場合）:**

チームカラーを背景とした丸型 SVG バッジを生成する。`getTeamStripeColors(slug)` で色配列を取得し、縦グラデーション stops を組み立てる。

```tsx
<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 32 32"
  aria-label={shortCode}
  role="img"
  style={{ flexShrink: 0 }}
>
  <defs>
    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
      {/* colors.map で stops を生成 */}
    </linearGradient>
  </defs>
  <circle cx="16" cy="16" r="15" fill={`url(#${gradientId})`} />
  <text
    x="16"
    y="16"
    dominantBaseline="central"
    textAnchor="middle"
    fontSize={shortCode.length <= 2 ? "11" : "9"}
    fontWeight="bold"
    fontFamily="system-ui, sans-serif"
    fill={isLightColor(primaryColor) ? "#111111" : "#FFFFFF"}
    letterSpacing="-0.5"
  >
    {shortCode}
  </text>
</svg>
```

`gradientId` は `badge-${slug}` とする（同一ページに複数レンダリングされる場合の id 衝突を避けるため、SVG 内の `defs` は各インスタンスが持つ）。

**`isLightColor` ヘルパー（同ファイル内、export しない）:**

```ts
function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
```

---

## Task 3 — 既存コンポーネントへの組み込み

### `components/match-card.tsx`

クラブチームで `🏉` 絵文字を表示している箇所を `<TeamBadge>` に置き換える。`FlagIcon` コンポーネントが存在する場合はその内部で対応してもよい。

サイズは `size={20}`。

### `components/match-header.tsx`

スコア表示のチームコード横にバッジを追加する。現在チームコード（`shortCode`）のみ表示している箇所に `<TeamBadge>` を並べる。

```tsx
// 変更後イメージ
<span className="inline-flex items-center gap-1.5">
  <TeamBadge slug={slug} shortCode={shortCode} size={28} />
  <span className="min-w-0 truncate">{shortCode}</span>
</span>
```

モバイルで圧迫する場合は `size={22}` に調整する。既存の `min-w-0 truncate` は維持する。

---

## 変更しないこと

- `lib/format/team-identity.ts` の既存関数・定数
- 国代表チームの既存フラグ表示の挙動
- `match-card.tsx` のレイアウト・スコア表示・W/L バッジ
- `match-header.tsx` のグリッドレイアウト・カラーグラデーション

---

## 完了条件

- [ ] クラブチームのカード（SRP・Premiership 等）に丸型カラーバッジが表示される
- [ ] 国代表チームは従来の国旗表示のまま
- [ ] テキスト色がチームカラーの明暗に応じて白／黒に切り替わる
- [ ] モバイル 375px でスコア表示が崩れない
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
