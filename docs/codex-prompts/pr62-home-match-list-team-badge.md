# PR #62 — ホームの試合リストにチームバッジを追加

## 背景

`app/page.tsx` の「今後の試合」「最近のレビュー」セクションは
チームを略称テキスト（`shortCode`）と名前のみで表示しており、
視覚的なチームアイデンティティが伝わらない。
一方、`MatchCard` コンポーネントや `MatchHeader` では `TeamBadge` が
既に使用されており、ホームリストだけ未適用になっている。

## スコープ

対象:
- `app/page.tsx` — 「今後の試合」「最近のレビュー」の2箇所

対象外:
- `components/match-card.tsx`（既に TeamBadge 使用中）
- `components/match-header.tsx`（既に TeamBadge 使用中）
- TeamBadge コンポーネント自体

## 実装仕様

### 今後の試合リスト（upcomingMatches）

現在: `{match.homeTeam.shortCode} vs {match.awayTeam.shortCode}` のテキストのみ

変更後:
```tsx
import { TeamBadge } from "@/components/team-badge";

// 試合行の team 表示部分
<p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
  <TeamBadge shortCode={match.homeTeam.shortCode} size={18} slug={match.homeTeam.slug} />
  <span>{match.homeTeam.shortCode}</span>
  <span className="text-slate-400 font-normal">vs</span>
  <TeamBadge shortCode={match.awayTeam.shortCode} size={18} slug={match.awayTeam.slug} />
  <span>{match.awayTeam.shortCode}</span>
</p>
```

- バッジサイズ: `size={18}`（コンパクトリスト行に合わせる）
- 既存の `truncate` クラスは p タグから外し、内側の span に移す

### 最近のレビューリスト（recentReviews）

現在: テキストのみで `{competition.name}` + `{homeTeam.name} vs {awayTeam.name}` を表示

変更後: チーム名行に TeamBadge を追加
```tsx
<p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)] truncate">
  <span className="inline-flex items-center gap-1.5 shrink-0">
    <TeamBadge shortCode={match.homeTeam.shortCode} size={20} slug={match.homeTeam.slug} />
    {match.homeTeam.name}
  </span>
  <span className="text-slate-400 font-normal shrink-0">vs</span>
  <span className="inline-flex items-center gap-1.5 shrink-0">
    <TeamBadge shortCode={match.awayTeam.shortCode} size={20} slug={match.awayTeam.slug} />
    {match.awayTeam.name}
  </span>
</p>
```

- バッジサイズ: `size={20}`
- `min-w-0` と `truncate` は既存通りに維持し、レイアウト崩れを防ぐ

## データ確認

`upcomingMatches` と `recentReviews` は両方とも `MatchListItem` 型で、
`homeTeam.slug`・`homeTeam.shortCode`・`awayTeam.slug`・`awayTeam.shortCode`
がすでに含まれている（`lib/db/queries/matches.ts` で select 済み）。
追加の DB クエリ変更は不要。

## 完了の定義

- [ ] ホームページ（`/`）の「今後の試合」各行にホーム・アウェイの TeamBadge が表示される
- [ ] ホームページの「最近のレビュー」各行にホーム・アウェイの TeamBadge が表示される
- [ ] モバイル（375px）でレイアウトが崩れない
- [ ] TypeScript エラーなし・`pnpm build` 通過
