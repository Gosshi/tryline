# パンくずリスト 大会リンク URL バグ修正

## 背景

試合詳細ページ（`/matches/[id]`）のパンくずリストで、
大会名リンク（例:「Premiership 2025-26」）の href が
正しい大会ページ（`/c/premiership/2025-26`）ではなく
`/`（ホーム）を指している。

ユーザーが「大会一覧に戻る」意図でクリックするとホームへ飛んでしまい、
戻り動線が完全に機能していない。

## スコープ

対象:
- 試合詳細ページのパンくずコンポーネント（`app/matches/[id]/page.tsx` または
  `components/match-breadcrumb.tsx` 相当）

対象外:
- パンくずの表示テキスト・スタイル
- ラウンド名表示（「Round 1」など）

## 変更内容

### 現状

```tsx
// href が "/" になっている
<Link href="/">{match.season.competition.name} {match.season.name}</Link>
```

### 修正後

大会ページの URL を `competition.family` と `season.slug` から組み立てる:

```tsx
const competitionUrl = `/c/${match.season.competition.family}/${match.season.slug}`;

<Link href={competitionUrl}>
  {match.season.competition.name} {match.season.name}
</Link>
```

`competition.family` と `season.slug` が既存の型・クエリに含まれていない場合は、
`getMatchById` で JOIN して取得するよう拡張する。

### 参考: 既存の URL 構造

| 大会 | family | season.slug | 正しい URL |
|------|--------|-------------|-----------|
| Premiership 2025-26 | `premiership` | `2025-26` | `/c/premiership/2025-26` |
| URC 2025-26 | `urc` | `2025-26` | `/c/urc/2025-26` |
| Six Nations 2025 | `six-nations` | `2025` | `/c/six-nations/2025` |
| Rugby Championship 2025 | `rugby-championship` | `2025` | `/c/rugby-championship/2025` |
| League One 2025-26 | `league-one` | `2025-26` | `/c/league-one/2025-26` |

## 変更ファイル

- `app/matches/[id]/page.tsx`（またはパンくずコンポーネント）
- 必要に応じて `lib/db/matches.ts`（クエリに family / slug が不足している場合）

## 受け入れ条件

- [ ] 試合詳細ページのパンくず「大会名 シーズン名」をクリックすると正しい大会ページへ遷移する
- [ ] Premiership / URC / Six Nations / Rugby Championship / Super Rugby Pacific / Top 14 / League One の各大会で確認する
- [ ] ホームへ誤遷移しない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
