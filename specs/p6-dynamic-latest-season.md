# ホーム 最新シーズン動的表示

## 背景

ホームページ（`/`）に各大会の「最新シーズン」へのリンクが掲載されているが、
URL が `/c/premiership/2024-25` のようにハードコードされている。
新シーズン（2025-26）が始まってもリンクが更新されず、古いシーズンを指し続ける。

また大会カードの並び順が静的に固定されており、現在進行中の大会が上位に来ない。
ユーザーが「今どの大会を観ればいいか」を一目で把握できない。

## スコープ

対象:
- ホームページの大会リンクの動的生成
- 進行中大会の優先表示

対象外:
- 大会カードのデザイン変更
- 試合一覧の表示ロジック

## 変更内容

### 現状

```tsx
// ハードコードされた大会リンク
<Link href="/c/premiership/2024-25">Premiership 2024-25</Link>
```

### 修正後

DB から「現在最もアクティブなシーズン」を取得して動的にリンクを生成する。

```ts
// lib/db/competitions.ts
export async function getCompetitionsWithLatestSeason() {
  const { data } = await supabase
    .from('competitions')
    .select(`
      id, name, family,
      seasons (id, slug, name, match_count:matches(count))
    `)
    .order('name');

  return data?.map(comp => ({
    ...comp,
    latestSeason: selectLatestActiveSeason(comp.seasons ?? []),
  }));
}

function selectLatestActiveSeason(seasons: Season[]) {
  const withMatches = seasons.filter(s => s.match_count > 0);
  return (
    withMatches.sort((a, b) => b.slug.localeCompare(a.slug))[0] ??
    seasons.sort((a, b) => b.slug.localeCompare(a.slug))[0]
  );
}
```

### 大会カードの並び順

進行中の大会（最終試合から 14 日以内）を上位に表示する。

```ts
function isActiveNow(season: Season): boolean {
  if (!season.last_match_at) return false;
  const diffMs = Date.now() - new Date(season.last_match_at).getTime();
  return diffMs <= 14 * 24 * 60 * 60 * 1000;
}
```

## 変更ファイル

- `app/page.tsx`（ホームページ、大会リンクを動的生成に変更）
- `lib/db/competitions.ts`（`getCompetitionsWithLatestSeason` を追加）

## 受け入れ条件

- [ ] ホームページの大会リンクが DB の最新シーズンを自動的に指している
- [ ] 新シーズンのデータが追加されると次回リクエストで自動更新される
- [ ] 進行中の大会がリストの上位に表示される
- [ ] データが 0 件の大会は非表示またはグレーアウトになる
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

1. ISR を使う場合の `revalidate` 値（秒数）
2. 「進行中」の定義: 最終試合から 14 日以内でよいか
3. データが 0 件の大会（Nations Cup 2026 等）をホームに表示するか非表示にするか
