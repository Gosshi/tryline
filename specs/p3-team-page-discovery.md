# p3-team-page-discovery: チームページへの導線追加

## 背景

`/t/{team}` のチームページは実装済みで機能的だが、
ヘッダー・ホームページ・UserMenu のどこからもリンクがない。
URL を直接知っているか偶然辿り着く以外に発見できない状態。
お気に入りチームを登録したユーザーが自然にチームページへ遷移できるよう、
最小コストで導線を追加する。

## スコープ

対象:
- `app/page.tsx`「応援チームの試合」セクション: チームページへのリンクを追加
- `components/user-menu.tsx`: ドロップダウン内にお気に入りチームへのリンクを追加

対象外:
- グローバルナビへのチームリスト追加（チーム数が多く UX を損ねるため）
- 試合カードのチームロゴ・チーム名をクリック可能にする変更
- チームページ自体の機能追加
- `components/favorite-teams-banner.tsx` の変更（未設定ユーザー向けのため対象外）

## UI サーフェス

### 1. ホームページ「応援チームの試合」セクション（`app/page.tsx`）

現状: `<h2>応援チームの試合</h2>` テキストのみ

変更後: セクション見出し右に「チームページ →」リンクを追加。

```tsx
<div className="mb-4 flex items-center justify-between" id="favorite-heading">
  <h2
    className="text-sm font-semibold uppercase tracking-widest text-[var(--color-accent)]"
  >
    応援チームの試合
  </h2>
  {favoriteTeamSlugs.length === 1 && (
    <Link
      className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      href={`/t/${favoriteTeamSlugs[0]}`}
    >
      チームページ →
    </Link>
  )}
</div>
```

お気に入りが 2〜3 チームの場合はリンクを表示しない（どのチームに飛ぶか不明なため）。

### 2. UserMenu ドロップダウン（`components/user-menu.tsx`）

`TeamPicker` の `<div>` ブロックの直前に、お気に入りチームへのリンクリストを追加する。

```tsx
{favoriteTeamSlugs.length > 0 && (
  <div className="border-t border-slate-100 px-4 py-2 space-y-0.5">
    {favoriteTeamSlugs.map((slug) => {
      const team = allTeams.find((t) => t.slug === slug)
      if (!team) return null
      return (
        <a
          key={slug}
          className="block py-1 text-xs font-medium text-[var(--color-accent)] hover:underline"
          href={`/t/${slug}`}
          onClick={() => setOpen(false)}
        >
          {team.name} のページ →
        </a>
      )
    })}
  </div>
)}
```

`setOpen(false)` でリンクをクリックした際にドロップダウンを閉じる。  
`allTeams` はすでに `UserMenu` の props として渡されているため追加のデータフェッチは不要。

## 受け入れ条件

- [ ] お気に入りが 1 チームのユーザーのホームで「チームページ →」リンクが表示される
- [ ] お気に入りが 2〜3 チームのホームではリンクが表示されない
- [ ] UserMenu ドロップダウンにお気に入り各チームへのリンクが表示される
- [ ] チームページリンクをクリックすると `/t/{slug}` に遷移する
- [ ] お気に入り未設定ユーザーには追加リンクが表示されない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- お気に入りが 2〜3 チームの場合のホームのリンク: 表示しない（現仕様）でよいか、
  それともすべてのチームを並べるか
