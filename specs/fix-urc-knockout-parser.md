# URC knockout（Q/F・S/F・決勝）イベントパーサー修正

## 背景

`backfill-urc-match-events.ts --dry-run` でレギュラーシーズン試合のイベント取り込みは成功（URC 88%達成）しているが、ノックアウトラウンド（Quarter-finals / Semi-finals / Grand Final）は全9試合が `events_found=0`。

根本原因: `lib/scrapers/wikipedia-urc-match-details.ts` の `parseEventId` 関数が `Round_\d+` 形式のイベントIDしか認識しない。ノックアウト試合のイベントIDは `Quarter-finals_Glasgow_Warriors_v_Stormers`・`Semi-finals_Leinster_v_Glasgow_Warriors`・`URC_Grand_Final_Leinster_v_Bulls` 形式のため、正規表現がマッチせず `null` を返し、パースが早期リターンされる。

対象9試合（dry-run 確認済み、全試合 `wikipedia_url` 設定済み）:
- 2024-25 Q/F: 4試合
- 2024-25 S/F: 2試合
- 2024-25 Grand Final: Leinster v Bulls
- 2025-26 S/F: Glasgow Warriors v Bulls、Leinster v Stormers（進行中シーズン）

## スコープ

対象:
- `lib/scrapers/wikipedia-urc-match-details.ts`（`parseEventId` 関数）
- 必要に応じて `findRoundTables` の anchor ID マッピング

対象外:
- DB レコード変更
- 他スクレイパーへの変更

## 実装詳細

### Step 1: Wikipedia ページの h3 アンカー ID を確認

`backfill-urc-match-events.ts` が参照する wikipedia_url（URC 2024-25 シーズンページ）を実際に fetch し、ノックアウトセクションの `h3` アンカー ID を確認する（`<h3 id="Quarter-finals">` なのか `<h3 id="Knockout_stage">` 等なのかを実測する）。

```bash
pnpm tsx -e "
import { fetchWithPolicy } from './lib/scrapers/fetcher';
const res = await fetchWithPolicy('https://en.wikipedia.org/wiki/2024-25_United_Rugby_Championship');
const html = await res.text();
const matches = [...html.matchAll(/<h[23][^>]*id=\"([^\"]+)\"[^>]*>/g)];
matches.forEach(m => console.log(m[1]));
"
```

### Step 2: `parseEventId` にノックアウト形式を追加

現在の実装（L72-L95）は `Round_\d+` 形式しかマッチせず、ノックアウト形式は `null` を返す。

変更: `Round_\d+` の teamMatch の後ろに、Step 1 で確認したノックアウト roundId パターンを追加する。

```typescript
// ノックアウト形式: Quarter-finals_TeamA_v_TeamB 等
const knockoutTeamMatch = eventId.match(
  /^(Quarter-finals|Semi-finals|URC_Grand_Final|Grand_Final|Playoff_semi-finals|Playoff_quarter-finals)_(.+)_v_(.+)$/i
);
if (knockoutTeamMatch) {
  return {
    awayTeamName: knockoutTeamMatch[3]!.replace(/_/g, " "),
    homeTeamName: knockoutTeamMatch[2]!.replace(/_/g, " "),
    roundId: knockoutTeamMatch[1]!,
    type: "teams",
  };
}
```

**注意**: Step 1 で確認した実際の h3 anchor ID と event_id の roundId が一致しない場合（例: event_id は `URC_Grand_Final` だが Wikipedia h3 は `Grand_Final`）、`findRoundTables` に roundId → anchor ID のマッピングを追加すること。

### Step 3: dry-run で検証

```bash
pnpm tsx scripts/backfill-urc-match-events.ts --dry-run
```

`events_found > 0` になることを確認。9試合すべてでイベントが取れることが理想だが、Wikipedia ページに得点詳細が掲載されていない試合は skip のまま許容する。

### Step 4: 本番実行（dry-run 成功後）

```bash
pnpm tsx scripts/backfill-urc-match-events.ts --confirm-owner-approved
```

**本番実行は Owner の承認後に実施。**

## 変更ファイルまとめ

| ファイル | 変更内容 |
|----------|---------|
| `lib/scrapers/wikipedia-urc-match-details.ts` | `parseEventId` にノックアウト形式の正規表現を追加。必要に応じて `findRoundTables` に anchor ID マッピング追加 |

## 受け入れ条件

1. `pnpm tsx scripts/backfill-urc-match-events.ts --dry-run` で `events_found > 0`
2. dry-run ログに Quarter-finals・Semi-finals・Grand Final の試合が少なくとも一部 `[skip]` でなく取り込まれている
3. `pnpm tsc --noEmit` / `pnpm lint` clean
4. 変更は `lib/scrapers/wikipedia-urc-match-details.ts` のみ（スクリプト・DB は変更しない）
