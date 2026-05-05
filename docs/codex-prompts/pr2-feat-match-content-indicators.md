# feat: 試合カードにコンテンツ有無インジケーターを追加

## 目的

シーズンページの試合カード（`MatchCard`）に、プレビュー・レビューが公開済みかどうかを
小さなバッジで示す。ユーザーが「どの試合に読めるコンテンツがあるか」を一覧から判断できるようにする。

## 実装の流れ

### 1. バッチ取得クエリの追加

`lib/db/queries/match-content.ts` に新関数を追加する。

```ts
export type MatchContentStatus = {
  hasPreview: boolean;
  hasRecap: boolean;
};

export async function getContentStatusMap(
  matchIds: string[],
): Promise<Map<string, MatchContentStatus>> {
  if (matchIds.length === 0) {
    return new Map();
  }

  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select("match_id, content_type")
    .in("match_id", matchIds)
    .eq("status", "published")
    .in("content_type", ["preview", "recap"]);

  if (error) {
    throw error;
  }

  const map = new Map<string, MatchContentStatus>();

  for (const row of data) {
    const current = map.get(row.match_id) ?? { hasPreview: false, hasRecap: false };
    if (row.content_type === "preview") current.hasPreview = true;
    if (row.content_type === "recap") current.hasRecap = true;
    map.set(row.match_id, current);
  }

  return map;
}
```

### 2. シーズンページでバッチ取得

`app/c/[competition]/[season]/page.tsx` で `getContentStatusMap` を呼び出す。
既存の `Promise.all` の後に追加（matches が確定してから）。

```ts
import { getContentStatusMap } from "@/lib/db/queries/match-content";

const [matches, standings, seasons] = await Promise.all([...]);
const contentStatusMap = await getContentStatusMap(matches.map((m) => m.id));
```

`MatchCard` に `contentStatus` を渡す:

```tsx
<MatchCard
  key={match.id}
  match={match}
  contentStatus={contentStatusMap.get(match.id) ?? { hasPreview: false, hasRecap: false }}
/>
```

### 3. MatchCard コンポーネントの更新

`components/match-card.tsx`

`MatchContentStatus` をオプショナルな prop として受け取り、
試合ステータスが `finished` のときのみ会場テキストの下にバッジを表示する。

```tsx
import type { MatchContentStatus } from "@/lib/db/queries/match-content";

type MatchCardProps = {
  match: MatchListItem;
  contentStatus?: MatchContentStatus;
};

// 会場表示の後（カード最下部）に追加
{contentStatus && match.status === "finished" && (
  <div className="mt-3 flex gap-1.5">
    {contentStatus.hasPreview && (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
        プレビュー
      </span>
    )}
    {contentStatus.hasRecap && (
      <span className="rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">
        レビュー
      </span>
    )}
  </div>
)}
```

## 変更するファイル

- `lib/db/queries/match-content.ts` — `MatchContentStatus` 型と `getContentStatusMap` 関数を追加
- `app/c/[competition]/[season]/page.tsx` — バッチ取得 + `MatchCard` に渡す
- `components/match-card.tsx` — `contentStatus` prop 追加・バッジ描画

## 変更しないこと

- `lib/db/queries/matches.ts`（`MatchListItem` 型は変更しない）
- `components/match-content-section.tsx`

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- シーズンページでレビュー公開済みの試合カードにアクセントカラーの「レビュー」バッジが表示されること
- コンテンツなしの試合カードにバッジが表示されないこと

## ブランチ・PR

- ブランチ: `feat/match-content-indicators`
- PR タイトル: `Feat: show preview/review availability badges on match cards`
