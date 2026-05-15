# モバイルナビゲーション ハンバーガーメニュー化

## 背景

375px 幅のモバイルビューポートでは、ヘッダーの「試合 / 大会 / 料金 / ログイン」が
フラット展開されており「大会」が2行に折り返してレイアウトが崩れている。
ハンバーガーメニューがなく、全ナビアイテムが狭い領域に詰め込まれているため
タップ精度が低下し誤タップのリスクがある。

既存の `p3-mobile-header-tap-targets.md` はタップ領域の padding 拡大のみ対象としており、
ハンバーガーメニュー化は対象外のため本仕様書で別途定義する。

## スコープ

対象:
- `components/site-header.tsx`

対象外:
- デスクトップレイアウト（`md:` 以上は変更なし）
- ナビの内容・リンク先

## UI サーフェス

### モバイル（md: 未満）

ヘッダーはロゴとハンバーガーアイコンのみ表示:

```
┌─────────────────────────────────┐
│  ● Tryline          ☰           │
└─────────────────────────────────┘
```

ハンバーガーアイコンタップでドロワーが展開:

```
┌─────────────────────────────────┐
│  ● Tryline          ✕           │
├─────────────────────────────────┤
│  試合                            │
│  大会 ▾                          │
│  料金                            │
│  ─────────────────────────────   │
│  ログイン                         │
└─────────────────────────────────┘
```

- ドロワーはヘッダー直下・全幅のシートとして表示する
- 各リンクタップでドロワーを閉じてページ遷移する
- ドロワー外タップまたは `✕` ボタンで閉じる

### デスクトップ（md: 以上）

現状のフラットナビを維持する（変更なし）。

## 実装方針

- `useState` で `isOpen: boolean` を管理する Client Component として実装する
  （現在 Server Component の場合は最小限の `"use client"` 境界を設ける）
- アイコンは lucide-react の `Menu` / `X` を使用する
- `aria-expanded`・`aria-controls`・`aria-label` を付与してアクセシビリティを確保する

```tsx
// ハンバーガーボタン（モバイルのみ）
<button
  className="md:hidden"
  aria-label={isOpen ? "メニューを閉じる" : "メニューを開く"}
  aria-expanded={isOpen}
  onClick={() => setIsOpen(!isOpen)}
>
  {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
</button>

// ドロワー
{isOpen && (
  <div
    className="fixed inset-0 z-50 md:hidden"
    onClick={() => setIsOpen(false)}
  >
    <nav
      className="absolute inset-x-0 top-14 bg-white shadow-lg border-t"
      onClick={e => e.stopPropagation()}
    >
      <ul className="flex flex-col py-2">
        <li><Link href="/" onClick={() => setIsOpen(false)} className="block px-6 py-3">試合</Link></li>
        <li>{/* 大会ドロップダウン（既存ロジック流用）*/}</li>
        <li><Link href="/pricing" onClick={() => setIsOpen(false)} className="block px-6 py-3">料金</Link></li>
        <li className="border-t mt-2 pt-2"><LoginButton onClick={() => setIsOpen(false)} /></li>
      </ul>
    </nav>
  </div>
)}

// デスクトップナビ（既存、md: 以上のみ）
<nav className="hidden md:flex ...">
  {/* 既存の内容 */}
</nav>
```

## 変更ファイル

- `components/site-header.tsx`

## 受け入れ条件

- [ ] 375px 幅でヘッダーにロゴ＋ハンバーガーアイコンのみ表示され、テキストナビは非表示
- [ ] ハンバーガーアイコンタップでドロワーが開く
- [ ] ドロワー内の各リンクのタップ領域が高さ 44px 以上
- [ ] リンクタップでドロワーが閉じてページ遷移する
- [ ] ドロワー外タップまたは `✕` ボタンで閉じる
- [ ] md: 以上（768px〜）では既存のフラットナビが表示され、ハンバーガーは非表示
- [ ] `aria-expanded`・`aria-label` が適切に設定されている
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- 大会ドロップダウンのドロワー内動作: タップで展開するアコーディオンにするか、
  サブリンクを最初から展開して表示するか
