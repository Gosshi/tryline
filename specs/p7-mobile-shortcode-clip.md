# モバイルでのチーム略称（shortCode）クリップ修正

## 背景

試合詳細ページのスコアヘッダーで、モバイル（375px）表示時に
アウェイチームの略称が「W…」のように途中で切れる。

再現条件: France vs Wales の試合詳細 → スコアヘッダーが「FRA 43 − 0 W…」

原因: `components/match-header.tsx` の `TeamBlock` コンポーネントで
`shortCode` スパンに `truncate` クラスが付いており、
中央のスコア列が大きい場合に略称（3文字固定）が収まる前に切れる。

## スコープ

対象:
- `components/match-header.tsx` — `TeamBlock` の shortCode レンダリング

対象外:
- チーム正式名（`name`）の表示（別行で表示されており問題なし）

## 変更内容

`components/match-header.tsx` の `TeamBlock` 内（L173-179付近）:

変更前:
```tsx
<span
  className={cn(
    "inline-flex min-w-0 items-center gap-1.5",
    align === "right" ? "flex-row-reverse" : "flex-row",
  )}
>
  <TeamBadge shortCode={shortCode} size={28} slug={slug} />
  <span className="min-w-0 truncate">{shortCode}</span>
</span>
```

変更後:
```tsx
<span
  className={cn(
    "inline-flex shrink-0 items-center gap-1.5",
    align === "right" ? "flex-row-reverse" : "flex-row",
  )}
>
  <TeamBadge shortCode={shortCode} size={28} slug={slug} />
  <span className="shrink-0">{shortCode}</span>
</span>
```

変更点:
- 外側 `span`: `min-w-0` → `shrink-0`
- 内側 `span`: `min-w-0 truncate` → `shrink-0`

## 受け入れ条件

- [ ] 375px ビューポートで France vs Wales の試合詳細を開いたとき、
  スコアヘッダーが「FRA 43 − 0 WAL」と完全に表示される
- [ ] デスクトップ（1280px）での表示が崩れない
- [ ] 他の試合でも両チームの略称が切れない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
