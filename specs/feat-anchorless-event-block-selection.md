# feat-anchorless-event-block-selection

## 背景

汚染クリーンアップ（`fix-contaminated-match-events`）でイベントを削除した Autumn Nations 2025 の31試合を再取得したいが、ソースページ `2025_end-of-year_rugby_union_internationals` には**試合別の id アンカーが存在しない**ことを確認済み（2026-06-11 実測: vevent ブロック49個、id は日付見出しのみ）。現行の `extractEventHtml` は id でブロックを切り出すため、このページからは取得できない。

一方、各 vevent ブロックには両チーム名（`X national rugby union team` へのリンク）と試合日付が含まれるため、**チーム名＋日付でブロックを特定**できる。#406 で入れた挿入前スコア整合ガードが最終安全網として機能する。

### 対象試合の現状

- Autumn Nations 2025: 31試合がイベント0件・recap draft 降格済み。`external_ids.wikipedia_url` は正しいページを指し、`wikipedia_event_id` は無効値 `"mw-content-text"` のまま
- 残存汚染1件: Japan vs Australia 2025-10-25（イベントセットが一意で署名検出を逃れた）。下記運用手順で先に除去する

## スコープ

対象:
- `scripts/fill-event-gaps.ts`: アンカー無効時のフォールバックとして「チーム名＋日付による vevent ブロック選択」を追加

対象外:
- SRP 6試合の回収（アンカーが存在するため external_ids 修正のみ。下記運用手順）
- RC 2025 の12試合・SRP 約48試合の小幅スコア超過（ミスキック計上疑い。別調査・別 spec）
- recap 再生成（イベント回収後にバッチ再生成で対応）

## データモデル変更

なし。

## LLM 連携

なし（コストゼロ）。

## 変更詳細

### `scripts/fill-event-gaps.ts` — チーム名ベースのブロック選択

#### 1. `findEventBlockByTeams`（新規関数・export してテスト可能に）

```typescript
export function findEventBlockByTeams(
  html: string,
  homeTeamName: string,
  awayTeamName: string,
  kickoffDate: string, // "YYYY-MM-DD"
): string | null {
  const $ = load(html);
  const candidates: string[] = [];

  $(".vevent").each((_, element) => {
    const block = $.html(element);
    if (block.includes(homeTeamName) && block.includes(awayTeamName)) {
      candidates.push(block);
    }
  });

  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }

  // 複数候補（リターンマッチ等）は日付で絞る
  const dateMatches = candidates.filter((block) =>
    blockContainsDate(block, kickoffDate),
  );

  return dateMatches.length === 1 ? (dateMatches[0] ?? null) : null;
}
```

- `blockContainsDate`: vevent 内の日付表記（例: `1 November 2025`）を `kickoffDate` の前後1日（タイムゾーンずれ対策）と照合するヘルパー。`Date` でパースして比較する
- チーム名照合は `match.home_team.name` / `away_team.name`（DB の英語名）。`english_name` カラムがあればそちらを優先
- **0件 or 絞り込み後も複数**なら `null`（推測で選ばない）

#### 2. `fillMatch` の処理フロー変更

```
1. extractEventHtml(html, eventId)  ← 既存（アンカー有効時）
2. null の場合 → findEventBlockByTeams(html, home, away, kickoffDate) を試す
3. それも null → skip（ログ: "-> no unique event block found, skipping"）
4. パース → 既存のスコア整合ガード（イベント合計>スコアで skip）→ upsert
```

`loadGapMatches` の select に `kickoff_at` を追加（チーム名は取得済み）。

#### 3. ログ

チーム名選択で取得した場合は `console.log("  -> resolved by team-name block selection")` を出し、アンカー由来と区別できるようにする。

## 運用手順（Owner 実行・コード変更とは独立）

### 手順0: 残存汚染1件の除去（最初に実行）

```sql
-- Japan vs Australia 2025-10-25（ev 7-69 vs スコア 15-19 の取り逃し汚染）
DELETE FROM match_events WHERE match_id = '2b5992a7-9a8d-4ad8-86e4-26d9ca45dcc6';
UPDATE match_content SET status = 'draft'
WHERE match_id = '2b5992a7-9a8d-4ad8-86e4-26d9ca45dcc6'
  AND content_type = 'recap' AND status = 'published';
```

### 手順1: SRP 6試合の external_ids 修正

List ページ（`List_of_2025_Super_Rugby_Pacific_matches`）にはラウンド接頭辞なしのアンカー（`Crusaders_v_Reds` 等）が存在し、対象6カードすべて一意であることを確認済み:

```sql
UPDATE matches m SET external_ids =
  jsonb_set(
    jsonb_set(m.external_ids,
      '{wikipedia_url}',
      '"https://en.wikipedia.org/wiki/List_of_2025_Super_Rugby_Pacific_matches"'),
    '{wikipedia_event_id}',
    to_jsonb(regexp_replace(m.external_ids->>'wikipedia_event_id', '^\d+_', '')))
FROM competitions c
WHERE c.id = m.competition_id
  AND c.family = 'super-rugby-pacific'
  AND m.external_ids->>'wikipedia_event_id' ~ '^\d+_'
  AND NOT EXISTS (SELECT 1 FROM match_events e WHERE e.match_id = m.id);
```

### 手順2: 本機能マージ後に backfill 再実行

```
pnpm tsx scripts/fill-event-gaps.ts --dry-run --limit=100   # 対象確認
pnpm tsx scripts/fill-event-gaps.ts --limit=100             # 実行
```

### 手順3: 回収確認後、draft recap のバッチ再生成（別途コスト承認）

## 受け入れ条件

1. `findEventBlockByTeams`: 両チーム名を含む vevent が1個 → そのブロックを返す（単体テスト・固定 HTML フィクスチャ）
2. 候補0件 → null。複数候補で日付一致が1件 → それを返す。日付でも絞れない → null（単体テスト）
3. アンカー有効な既存ケースの動作が変わらない（`extractEventHtml` 優先）
4. チーム名選択経由でもスコア整合ガードが適用される
5. `pnpm test` 全体が通る・TypeScript strict エラーなし

## 未解決の質問

- Autumn 2025 の一部試合は Tier 2 国同士（Spain vs Fiji 等）でページ上の表記が DB のチーム名と完全一致しない可能性がある。dry-run の skip ログで実際の取得率を見てから、必要なら別名対応を追加で判断（全31件の回収は必須としない。回収できた分だけ recap 再生成）
