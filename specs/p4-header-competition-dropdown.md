# ヘッダーナビ：大会ドロップダウン追加

## 背景

`components/site-header.tsx` のナビゲーションは「試合」「料金」のみで、
ユーザーが特定の大会ハブへ直接飛べない。
「試合」リンクを「大会 ▾」ドロップダウンに変更し、主要大会へ1クリックでアクセスできるようにする。

## スコープ

対象:
- `components/site-header.tsx` — ドロップダウン追加
- `components/competition-nav-dropdown.tsx` — 新規コンポーネント（Client Component）

対象外:
- モバイルハンバーガーメニュー（今回は対象外。sm: 以上のデスクトップのみ）
- 大会追加・削除のデータ管理（ハードコード可）

## UI 仕様

### ドロップダウンの表示順（上から）

```
Six Nations 2025      → /c/six-nations/2025
Premiership 2025-26   → /c/premiership/2025-26
URC 2025-26           → /c/urc/2025-26
Top 14 2024-25        → /c/top-14/2024-25
Super Rugby Pacific 2026 → /c/super-rugby-pacific/2026
Rugby Championship 2025  → /c/rugby-championship/2025
```

リンク先の season は「最新シーズン」に固定ではなく、
`listCompetitionFamilies()` などの既存クエリから動的に最新シーズンを取得することが望ましい。
ただしデータ取得コストが高い場合はハードコードして実装し、受け入れ条件を満たすこと。

### ドロップダウンの挙動

- 「大会 ▾」ボタンをクリックまたはキーボード Enter/Space で開閉
- フォーカスアウト（Escape / 外側クリック）で閉じる
- ARIA: `button[aria-haspopup="listbox"]` + `ul[role="listbox"]`
- 各リンクにカーソルを当てると大会カラーの左ボーダーを表示（`getCompetitionFamilyColor` 流用）

### ビジュアル

```tsx
// ボタン
<button className="-my-1.5 flex items-center gap-1 rounded px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:my-0 sm:py-1.5">
  大会 <ChevronDownIcon className="h-3.5 w-3.5 opacity-60" />
</button>

// ドロップダウンパネル
<ul className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
  {competitions.map((comp) => (
    <li key={comp.href}>
      <Link
        href={comp.href}
        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        style={{ borderLeft: `3px solid ${comp.color}` }}
      >
        {comp.label}
      </Link>
    </li>
  ))}
</ul>
```

## 変更ファイル

- `components/site-header.tsx` — 「試合」リンクの後に「大会 ▾」ドロップダウンを追加
- `components/competition-nav-dropdown.tsx` — 新規 Client Component

## 受け入れ条件

- [ ] ヘッダーに「大会 ▾」ボタンが表示される
- [ ] クリックで6大会のドロップダウンメニューが開く
- [ ] 各大会リンクをクリックすると対応する大会ハブページへ遷移する
- [ ] Escape キーまたは外側クリックでメニューが閉じる
- [ ] キーボード操作（Tab/Enter/Escape）が正しく動作する
- [ ] デスクトップ（sm: 以上）での表示が崩れない
- [ ] モバイル（375px）でドロップダウンが画面外にはみ出さない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
