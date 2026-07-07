# モバイルナビ展開時に背景ディムスクリムがない

## 背景

サイト全体の画像・ビジュアル監査（2026-07-07）で「モバイルナビ展開状態が半透明で視認性が低い」という指摘があったが、`tryline-site-auditor`エージェントで本番（375px幅）を実機確認した結果、**指摘内容自体は事実と異なることが判明した**。メニューパネル自体（`components/mobile-header-menu.tsx:98`、`bg-white`）は完全不透明で、DOM実測でも `backgroundColor: rgb(255, 255, 255)` ・`opacity: 1`・`backdropFilter: none` を確認済み。半透明なのはメニュー開閉と無関係に常時適用されているヘッダーバー本体（`components/site-header.tsx:19`、`bg-white/90 backdrop-blur-sm`）であり、これは意図した既存仕様で変更対象外。

一方で実機確認の過程で、**別の実在する軽微な課題**が見つかった。メニューを開いた際、背後のページコンテンツをディムする半透明スクリム（オーバーレイ）が存在しない。ラッパー要素 `<div className="fixed inset-0 z-50 md:hidden">`（`components/mobile-header-menu.tsx:96`）の背景は透明（`rgba(0,0,0,0)`）のままで、展開されたナビパネルの下端でページの暗いヒーロー画像と唐突に接続して見える。

## スコープ

対象:
- `components/mobile-header-menu.tsx:96`（メニュー展開時のラッパー `<div>`）に、パネル以外の領域を暗くするディムスクリムを追加する

対象外:
- ヘッダーバー本体（`components/site-header.tsx:19`）の `bg-white/90 backdrop-blur-sm` の変更（意図した既存仕様であり本specの対象ではない）
- メニューパネル自体（`bg-white`）の変更（既に完全不透明で問題なし）
- デスクトップナビ（`md:hidden` のためこの要素自体がモバイルのみ）

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

`components/mobile-header-menu.tsx` の展開時ラッパーに、ナビパネルの高さ分を除いた背景をディムする。ナビパネル自体は `top-14` から始まる別要素なので、ラッパー全体に半透明の黒背景を敷いてもパネルの上に重ならない（パネルは不透明な`bg-white`のため、スクリムはパネルの背後・パネルより下の可視領域にのみ効く）。

```diff
  {isOpen && (
-   <div className="fixed inset-0 z-50 md:hidden" onClick={closeMenu}>
+   <div className="fixed inset-0 z-50 bg-black/40 transition-opacity md:hidden" onClick={closeMenu}>
      <div
        className="absolute inset-x-0 top-14 border-t border-slate-200 bg-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
```

（`bg-black/40` は一例。既存の他のオーバーレイ・モーダル、例えば `components/auth-modal.tsx` があれば配色・不透明度の慣例を確認し、揃えられるなら揃えること。）

## LLM 連携

なし

## 受け入れ条件

1. モバイル幅（375px等）でハンバーガーメニューを開くと、ナビパネルの背後・下の領域に半透明の暗いスクリムが表示される
2. スクリム部分をクリック/タップするとメニューが閉じる（既存の `onClick={closeMenu}` 挙動を維持）
3. ナビパネル自体（`bg-white`）の見た目・不透明度に変化がない
4. ヘッダーバー本体の `bg-white/90 backdrop-blur-sm` は変更しない
5. デスクトップ幅（`md`以上）で挙動に変化がない
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 未解決の質問

なし。
