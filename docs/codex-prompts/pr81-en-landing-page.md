# PR #81 — /en ランディングページ（英語版 League One トップ）

## 背景

英語アカウント @tryline_en の固定ポストリンク先として `/en` を用意する。
英語コンテンツが存在するリーグワン試合の一覧を英語で表示するシンプルなページ。

## スコープ

対象:

- `app/en/page.tsx` — 新規作成
- `lib/db/queries/matches.ts` — クエリ追加

対象外:

- 既存ページの変更
- 認証・課金ガード（`/en` は全ユーザー閲覧可）
- ナビゲーションへの `/en` リンク追加（別 PR）

## データ

### 新規クエリ: `getRecentLeagueOneEnglishRecaps`

`lib/db/queries/matches.ts` に追加。
`getRecentlyReviewedMatchesForFamily` を参考に、`language = 'en'` で絞る:

```ts
export async function getRecentLeagueOneEnglishRecaps(
  limit = 5,
): Promise<MatchListItem[]>;
```

Supabase クエリは `getRecentlyReviewedMatchesForFamily` と同じ select 構造で、
`.eq("language", "en")` に変えるだけ。family フィルタは `.filter()` で `"league-one"` に絞る。

### 既存クエリ流用: upcoming League One matches

`getUpcomingMatches(10)` の結果を `competition.family === "league-one"` でフィルタする。
新規クエリは不要。

## ページ構成 `app/en/page.tsx`

```ts
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Japan Rugby League One — Tryline",
  description:
    "AI-generated match previews & recaps for Japan Rugby League One, in English.",
};
```

レイアウト:

```
<main>
  <h1>Japan Rugby League One</h1>

  {/* Upcoming */}
  {upcomingMatches.length > 0 && (
    <section>
      <h2>Upcoming</h2>
      {upcomingMatches.map(match =>
        <Link href={`/matches/${match.id}/en`}>
          <MatchCard match={match} />
        </Link>
      )}
    </section>
  )}

  {/* Recent Results */}
  {recentRecaps.length > 0 && (
    <section>
      <h2>Recent Results</h2>
      {recentRecaps.map(match =>
        <Link href={`/matches/${match.id}/en`}>
          <MatchCard match={match} />
        </Link>
      )}
    </section>
  )}

  {/* Empty state */}
  {upcomingMatches.length === 0 && recentRecaps.length === 0 && (
    <p>No content yet. Check back soon.</p>
  )}
</main>
```

`MatchCard` は既存コンポーネントをそのまま使う。
`MatchCard` が内部で `href` を生成している場合は、その動作を上書きしないよう注意すること
（`pointer-events-none` でネストしたリンクを無効化するか、`MatchCard` が `href` prop を受け取れるなら渡す）。

## 完了の定義

- [ ] `https://www.trylinerugby.com/en` が 200 を返す
- [ ] 英語コンテンツが存在するリーグワン試合が表示される
- [ ] 各試合カードをクリックすると `/matches/[id]/en` に遷移する
- [ ] 英語コンテンツが 0 件のときは empty state が表示される
- [ ] TypeScript エラーなし・`pnpm build` 通過
