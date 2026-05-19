# PR #78 — プレーオフの「節未定」ラベルをステージ名（準々決勝・準決勝・決勝）に変更

## 背景

PR #77 でリーグワンのプレーオフ試合が DB に取り込まれた。
プレーオフ試合は `round = null`、`external_ids.round_name = "quarterfinals"` などを持つ。
現状、大会ページのラウンドヘッダーで `round = null` の試合はすべて「節未定」と表示される。
これをステージ名（「準々決勝」「準決勝」「決勝」）で表示する。

## データの流れ

```
external_ids.round_name (DB)
  → MatchListItem.roundName (query)
    → RoundGroupKey.roundName (match-groups)
      → RoundHeading label (component)
```

## スコープ

対象:
- `lib/db/queries/matches.ts`
- `lib/format/match-groups.ts`
- `lib/format/round-label.ts`
- `components/round-heading.tsx`

対象外:
- `lib/ingestion/` は変更しない
- テスト（`tests/` 以下）は変更内容に合わせて修正すること

## 変更内容

### 1. `lib/db/queries/matches.ts`

`MatchListItem` に `roundName` フィールドを追加:

```ts
export type MatchListItem = {
  // ...既存フィールド
  round: number | null;
  roundName: string | null; // 追加
};
```

`external_ids.round_name` を取り出すヘルパーを追加:

```ts
function getRoundNameFromExternalIds(externalIds: Json): string | null {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const roundName = externalIds.round_name;

  return typeof roundName === "string" ? roundName : null;
}
```

`mapMatchRow` に `roundName` を追加:

```ts
return {
  // ...既存フィールド
  round: getRoundFromExternalIds(row.external_ids),
  roundName: getRoundNameFromExternalIds(row.external_ids), // 追加
};
```

### 2. `lib/format/match-groups.ts`

`RoundGroupKey` に `roundName` を追加:

```ts
export type RoundGroupKey = {
  type: "round";
  round: number | null;
  roundName: string | null; // 追加
};
```

`groupMatchesByRound` のグルーピングキーを修正。
`round = null` の試合を `roundName` ごとに別グループにまとめる:

```ts
function matchGroupingKey(match: MatchListItem): string {
  if (match.round !== null) return `round:${match.round}`;
  if (match.roundName) return `name:${match.roundName}`;
  return "null";
}

export function groupMatchesByRound(
  matches: MatchListItem[],
): Array<[GroupKey, MatchListItem[]]> {
  const hasAnyRound = matches.some((match) => match.round !== null);

  if (!hasAnyRound && matches.length > 0) {
    return groupMatchesByWeek(matches);
  }

  const grouped = new Map<
    string,
    { key: RoundGroupKey; matches: MatchListItem[] }
  >();

  for (const match of matches) {
    const bucketKey = matchGroupingKey(match);
    const existing = grouped.get(bucketKey);

    if (existing) {
      existing.matches.push(match);
    } else {
      grouped.set(bucketKey, {
        key: {
          round: match.round,
          roundName: match.roundName ?? null,
          type: "round",
        },
        matches: [match],
      });
    }
  }

  return [...grouped.values()]
    .sort(({ key: left }, { key: right }) => {
      if (left.round === null && right.round === null) return 0;
      if (left.round === null) return 1;
      if (right.round === null) return -1;
      return left.round - right.round;
    })
    .map(({ key, matches: groupMatches }) => [key, groupMatches]);
}
```

### 3. `lib/format/round-label.ts`

プレーオフステージ名の日本語マップと変換関数を追加:

```ts
export const PLAYOFF_STAGE_LABELS: Record<string, string> = {
  final: "決勝",
  quarterfinals: "準々決勝",
  semifinals: "準決勝",
  "third-place": "3位決定戦",
};

export function formatPlayoffStageLabel(roundName: string): string {
  return PLAYOFF_STAGE_LABELS[roundName.toLowerCase()] ?? roundName;
}
```

既存の `formatRoundLabel` は変更しない。

### 4. `components/round-heading.tsx`

`round = null` のとき `roundName` で日本語ラベルを表示:

```ts
import { formatPlayoffStageLabel, formatRoundLabel } from "@/lib/format/round-label";

// groupKey.type === "round" のラベル決定
const label =
  groupKey.type === "week"
    ? `第${groupKey.weekIndex}節 ...`
    : groupKey.round !== null
      ? formatRoundLabel(groupKey.round, family)
      : groupKey.roundName
        ? formatPlayoffStageLabel(groupKey.roundName)
        : "節未定";
```

## 完了の定義

- [ ] リーグワン大会ページで準々決勝の試合グループが「準々決勝」と表示される
- [ ] 準決勝・決勝が登録された場合も「準決勝」「決勝」と表示される
- [ ] 通常の「第X節」ラベルに変化がない
- [ ] `roundName` のない null ラウンド試合は従来通り「節未定」のまま
- [ ] TypeScript エラーなし・`pnpm build` 通過
- [ ] 既存テスト（`match-groups`・`round-heading`）を `roundName` 対応に更新して全件パス
