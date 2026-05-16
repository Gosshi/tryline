# feat: RWC 2027 プール順位表・ノックアウトブラケット + タイトルバグ修正

## 目的

1. `/c/rwc/2027` の "Coming Soon" プレースホルダーを、データが投入されたら自動で
   プール別順位表 + 試合一覧に切り替わる実装に置き換える
2. `/c/rwc/2027/bracket` にノックアウトブラケットページを追加する
3. チームページのメタタイトルが `South Africa | Tryline | Tryline` と二重になるバグを直す

**必ず `design.md` を最初に読んでから実装すること。**

---

## バグ修正: チームページタイトル二重

**ファイル**: `app/teams/[slug]/page.tsx`

`generateMetadata` の `title` に `| Tryline` を手動で付けているため、
ルートレイアウトの `template: "%s | Tryline"` と二重になっている。

```ts
// 修正前
title: `${data.team.name} | Tryline`,

// 修正後
title: data.team.name,
```

---

## 実装: RWC 2027

### 前提・既存のもの（変更不要）

- `supabase/migrations/20260507110003_rwc_2027_prep.sql` で
  `competition_pools` テーブルと主要チームが投入済み
- `lib/db/queries/standings.ts` に `getStandingsForCompetition` が存在する
- `components/standings-table.tsx` が存在する
- `lib/db/queries/competitions.ts` に `getCompetitionBySlug` が存在する
- `lib/db/queries/matches.ts` に `listMatchesForCompetition` が存在し、
  返り値の `MatchListItem` に `round: number | null` フィールドがある

### 1. `lib/db/queries/standings.ts` に関数を追加

```ts
export type PoolStanding = {
  poolName: string;
  standings: StandingRow[];
};

export async function getPoolStandingsForCompetition(
  competitionSlug: string,
): Promise<PoolStanding[]>
```

**実装ロジック**:
- `competitions` から `slug = competitionSlug` で `id` を取得
- 見つからなければ `[]` を返す
- `competition_standings` と `competition_pools` を
  `team_id` でジョインして pool_name を取得する
- Supabase クライアントで直接 SQL が書けない場合は、
  `competition_standings` を取得してから `competition_pools` で
  pool_name をマップする 2 クエリ構成で実装すること
- `pool_name` でグルーピングし、`PoolStanding[]` を返す
- pool_name がひとつもなければ `[]` を返す（空プールはスキップ）
- 返り値は pool_name の昇順 (Pool A, Pool B ...) に並べ、
  各プール内は position 昇順

### 2. `app/c/rwc/2027/page.tsx` を置き換え

以下のロジックで動作させる:

```
getCompetitionBySlug('rwc-2027') が null
  → 現在の "Coming Soon" プレースホルダーをそのまま表示

getCompetitionBySlug('rwc-2027') が存在 && getPoolStandingsForCompetition が空
  → 試合一覧のみ表示（StandingsTable は非表示）

getPoolStandingsForCompetition が 1 件以上
  → Pool A / Pool B / ... ごとに StandingsTable を並べて表示
  → 各 StandingsTable の見出しは "Pool A 順位表" などプール名を含める
```

ページ上部にノックアウトブラケットへのリンクを追加（競技が存在する場合のみ）:

```tsx
<Link href="/c/rwc/2027/bracket">ノックアウトブラケット →</Link>
```

競技が存在する場合は `SeasonMatchGroups` で試合一覧も表示する。
参照: `app/c/[competition]/[season]/page.tsx`

メタデータ:

```ts
title: "Rugby World Cup 2027"  // template で "Rugby World Cup 2027 | Tryline" になる
description: "RWC 2027 プール順位表・ノックアウトブラケット・AI日本語レビュー。"
```

### 3. `app/c/rwc/2027/bracket/page.tsx` を新規作成

```ts
import { getCompetitionBySlug } from "@/lib/db/queries/competitions";
import { listMatchesForCompetition } from "@/lib/db/queries/matches";
import { KnockoutBracket } from "@/components/knockout-bracket";
```

- `getCompetitionBySlug('rwc-2027')` が null → 「準備中」プレースホルダー
- `listMatchesForCompetition('rwc-2027')` で全試合取得後、
  `round >= 5` のものだけフィルタしてブラケットに渡す
- ブラケット試合が 0 件 → 「準備中」プレースホルダー

**round とフェーズの対応**:

| round | フェーズ表示 |
|-------|-------------|
| 5 | 準々決勝 |
| 6 | 準決勝 |
| 7 | 3位決定戦 |
| 8 | 決勝 |

メタデータ:
```ts
title: "Rugby World Cup 2027 ブラケット"
description: "RWC 2027 ノックアウトステージの対戦表。"
```

### 4. `components/knockout-bracket.tsx` を新規作成

```ts
type Props = {
  matches: MatchListItem[];
};

export function KnockoutBracket({ matches }: Props)
```

- `matches` を round でグルーピング (5=QF/6=SF/7=Bronze/8=Final)
- 左から QF → SF → Bronze/Final の順にカラム配置
- 各試合は `/matches/[id]` へのリンクカード（`MatchCard` または同等のシンプルなカード）
- 試合が `status === 'scheduled'` なら日時表示、`status === 'finished'` ならスコア表示
- 試合が存在しないラウンドは「TBD」ボックスを表示して枠を埋める
  - QF: 4 枠、SF: 2 枠、Bronze: 1 枠、Final: 1 枠
- レスポンシブ: モバイルは縦スクロール（各ラウンドを縦積み）、
  デスクトップは横並びブラケット表示

---

## 変更・作成するファイル

| ファイル | 操作 |
|---------|------|
| `app/teams/[slug]/page.tsx` | title バグ修正（1行のみ） |
| `lib/db/queries/standings.ts` | `getPoolStandingsForCompetition` を追加 |
| `app/c/rwc/2027/page.tsx` | プール順位表 + 試合一覧に置き換え |
| `app/c/rwc/2027/bracket/page.tsx` | 新規作成 |
| `components/knockout-bracket.tsx` | 新規作成 |

---

## 変更しないこと

- `competition_pools` マイグレーション（すでに適用済み）
- `StandingsTable` コンポーネントのインターフェース
- `MatchListItem` 型
- `lib/db/queries/standings.ts` の既存 `getStandingsForCompetition` 関数

---

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- `/teams/south-africa` のブラウザタブタイトルが `South Africa | Tryline`（二重なし）
- `/c/rwc/2027` が 200 を返す（競技未登録でもプレースホルダー表示）
- `/c/rwc/2027/bracket` が 200 を返す（試合未登録でも準備中表示）
- `competition_pools` にデータが存在する場合、Pool A / Pool B 等ごとに順位表が表示される
- ノックアウト試合 (round >= 5) が存在する場合、ブラケットに表示される
- モバイル 375px / デスクトップ 1280px でレイアウトが崩れない

## ブランチ・PR

- ブランチ: `feat/rwc2027-bracket`
- PR タイトル: `Feat: RWC 2027 pool standings, knockout bracket, fix team page title`
