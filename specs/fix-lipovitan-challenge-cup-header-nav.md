# fix-lipovitan-challenge-cup-header-nav: ヘッダー大会メニューに追加

## 背景

2026-07-21、`feat-lipovitan-challenge-cup-2026.md`（PR #626, #627）でリポビタンDチャレンジカップ2026（対オーストラリア・カナダ・フィジー、計4試合）を取り込み、本番DBにも投入済み。しかし`components/competition-nav-dropdown.tsx`の`HEADER_COMPETITIONS`（ヘッダーの大会ドロップダウンメニュー）はDB連動ではなくハードコードされた配列で、`lipovitan-challenge-cup`が含まれていない。

現状の導線を確認したところ:
- ヘッダーメニューからは一切到達できない
- 試合詳細ページ（`/matches/[id]`）には大会ハブへ戻るリンクがあるため、試合が`/calendar`やホームの注目試合ボードに表示されるようになれば（8/8以降）そこ経由では辿り着ける
- `sitemap.xml`は`listFamilies()`でDBから動的生成しているため既に含まれている

主要な発見導線であるヘッダーメニューに入っていないのは片手落ちのため、追加する。

## スコープ

対象:
- `components/competition-nav-dropdown.tsx`の`HEADER_COMPETITIONS`配列に以下を追加する:
  ```ts
  {
    family: "lipovitan-challenge-cup",
    href: "/c/lipovitan-challenge-cup",
    label: "リポビタンDチャレンジカップ",
  },
  ```
- 配列内の並び順はCodexの判断でよい（既存の並びは大会の格・地域でゆるく分類されている様子。`autumn-nations`・`pnc`の近く、末尾付近が妥当と思われる）

対象外:
- `HEADER_COMPETITIONS`をDB連動（動的生成）に変更すること — 既存の設計（ハードコード配列）を踏襲するのみで、アーキテクチャ変更は本specの対象外
- モバイル版メニュー（`components/mobile-header-menu.tsx`）が同じ`HEADER_COMPETITIONS`を参照していれば自動的に反映されるため、モバイル側の追加実装は不要（Codexが実装時に確認する）

## データモデル変更

なし。

## API サーフェス

なし。

## LLM連携

なし。

## 受け入れ条件

1. `HEADER_COMPETITIONS`配列に`family: "lipovitan-challenge-cup"`のエントリが追加されている
2. デスクトップ・モバイル両方のヘッダーメニューに「リポビタンDチャレンジカップ」のリンクが表示され、クリックすると`/c/lipovitan-challenge-cup`（大会ハブ、最新シーズンが自動選択される）に遷移する
3. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
4. 本番デプロイはOwner承認後に別途行う

## 未解決の質問

なし。
