# fix-contaminated-match-events

## 背景

2026-06-11 の DB 精査で、**複数の試合が全く同一のイベントセットを共有する汚染**が発見された。

| グループ | 試合数 | published recap | イベント作成日 |
|---|---:|---:|---|
| Autumn Nations 2025（3グループ） | 31 | 29 | 2026-05-17 |
| Super Rugby Pacific 2025（R17-19） | 6 | 6 | 2026-06-02 |

例: Japan vs Australia（15-19）・England vs Australia（25-7）・Ireland vs NZ（13-26）が全部同じ20イベント（ev合計 7-69）を持つ。**本番に「別の試合のトライスコアラーで書かれた recap」が35本公開されている**。X 投稿の Elliott 誤帰属（2026-06-08）もこの汚染が根本原因の可能性が高い。

### 根因チェーン（特定済み）

1. **無効アンカーの保存**: 汚染31試合の `external_ids.wikipedia_event_id` がすべて `"mw-content-text"`（Wikipedia ページ全体の div ID。試合アンカーではない）。SRP 6試合はアンカー文字列（`17_Crusaders_v_Reds` 等）があるが、参照先の `2025_Super_Rugby_Pacific_season` ページにそのアンカーが存在しない
2. **ページ全体フォールバック**: `scripts/fill-event-gaps.ts` の `extractEventHtml`（L152-163）がアンカー未発見時に**ページ全体の HTML を返す**: `return eventBlock.length ? $.html(eventBlock) : html;`
3. パーサ `parseMatchEventsFromVeventHtml` がページ先頭の試合の vevent を返す
4. **位置ベースの team 割り当て**: `lib/ingestion/events.ts`（L82-83）が `event.teamSide === "home" ? params.homeTeamId : params.awayTeamId` と、**チーム名の検証なしに**割り当てるため、他試合のイベントがそのまま入る
5. 挿入前のスコア整合チェックが存在しない

## スコープ

対象:
- **Part A（クリーンアップ）**: `scripts/cleanup-contaminated-events.ts`（新規）— 汚染イベント削除 + 該当 recap の draft 降格
- **Part B（再発防止）**: `scripts/fill-event-gaps.ts` のフォールバック除去 + 挿入前スコア整合ガード

対象外:
- 削除後のイベント再取得（正しいアンカーの特定は `feat-urc-srp-match-events` 系の別タスク）
- recap の再生成（バッチ再生成・要コスト承認で後日）
- `lib/ingestion/events.ts` のチーム名検証（パーサが teamSide しか返さない現構造では実装不可。Part B のスコアガードで実効的に防げる）

## データモデル変更

なし（既存行の DELETE / UPDATE のみ）。

## LLM 連携

なし（コストゼロ）。

## 変更詳細

### Part A: `scripts/cleanup-contaminated-events.ts`（新規）

`scripts/fill-event-gaps.ts` と同じ構成（Supabase server client・CLI フラグ）で実装する。

**汚染の同定ロジック**（ハードコードした match_id リストではなく署名ベースで検出する）:

1. `status = 'finished'` かつ events を持つ全試合の match_events を取得
2. 試合ごとにイベント署名を計算: `type|minute|player_id` を `minute, type, player_id` でソートして連結し md5
3. **同一署名を共有する試合が2件以上**のグループを汚染と判定
4. ただしイベント数3件以下のグループは除外（偶然一致しうる小さなセットの誤検知防止。今回の汚染は12〜20イベント）

**処理**:
- `--dry-run`（デフォルト）: グループごとに試合一覧（チーム名・日付・イベント数・published recap 有無）を表示するのみ
- `--confirm-owner-approved` 指定時のみ実行:
  1. 汚染グループ内の**全試合**の `match_events` を DELETE（どの試合が正しい持ち主か判別不能のため全削除。後で正しいアンカーから再取得）
  2. 該当試合の `match_content`（`content_type = 'recap'` かつ `status = 'published'`）を `status = 'draft'` に UPDATE（捏造対応 #344 と同じ draft 降格方式）
  3. 件数サマリーを表示（deleted events / demoted recaps）

### Part B-1: `scripts/fill-event-gaps.ts` — フォールバック除去

```typescript
// Before（L152-163）
function extractEventHtml(html: string, eventId: string | null): string {
  if (!eventId) {
    return html;
  }
  // ...
  return eventBlock.length ? $.html(eventBlock) : html;
}

// After
function extractEventHtml(html: string, eventId: string | null): string | null {
  if (!eventId || eventId === "mw-content-text") {
    return null;
  }

  const $ = load(html);
  const eventBlock = $("[id]")
    .filter((_, element) => $(element).attr("id") === eventId)
    .first();

  return eventBlock.length ? $.html(eventBlock) : null;
}
```

`fillMatch` 側: `extractEventHtml` が `null` を返したら `console.log("  -> event anchor not found, skipping")` して 0 を返す（ページ全体パースに進まない）。

### Part B-2: `scripts/fill-event-gaps.ts` — 挿入前スコア整合ガード

`loadGapMatches` の select に `home_score, away_score` を追加し、`fillMatch` で `upsertMatchEvents` を呼ぶ**前に**検証する:

```typescript
const EVENT_POINTS: Record<string, number> = {
  conversion: 2,
  drop_goal: 3,
  penalty_goal: 3,
  try: 5,
};

// fillMatch 内、upsertMatchEvents の前
const homeTotal = events
  .filter((event) => event.teamSide === "home")
  .reduce((sum, event) => sum + (EVENT_POINTS[event.type] ?? 0), 0);
const awayTotal = events
  .filter((event) => event.teamSide === "away")
  .reduce((sum, event) => sum + (EVENT_POINTS[event.type] ?? 0), 0);

// イベント合計が最終スコアを超えることは物理的にありえない（許容: penalty try 等での不足のみ）
if (
  (match.home_score !== null && homeTotal > match.home_score) ||
  (match.away_score !== null && awayTotal > match.away_score)
) {
  console.warn(
    `  -> event totals exceed final score (${homeTotal}-${awayTotal} vs ${match.home_score}-${match.away_score}), skipping`,
  );
  return 0;
}
```

注: parse 結果の型が `teamSide` を持つことは `lib/ingestion/events.ts` L82-83 で確認済み。型が異なる場合はパーサの戻り値型に合わせること。

## 受け入れ条件

1. `cleanup-contaminated-events.ts --dry-run` が Autumn Nations 31試合（3グループ）と SRP 6試合（1グループ）を検出して表示する
2. `--confirm-owner-approved` なしでは DELETE / UPDATE が一切実行されない
3. 実行後: 汚染グループの match_events が 0 件になり、該当の published recap 35本が draft になる
4. `extractEventHtml` はアンカー未発見・`eventId` なし・`mw-content-text` のとき `null` を返す（単体テスト）
5. イベント合計が最終スコアを超えるデータは挿入されず warn ログが出る（単体テスト: 合成イベントで確認）
6. `pnpm test` 全体が通る・TypeScript strict エラーなし

## 未解決の質問

- 削除後の Autumn Nations 2025 のイベント再取得: `2025_end-of-year_rugby_union_internationals` ページに試合別アンカーが存在するか要確認。存在すれば `wikipedia_event_id` を正しいアンカーに修正して `fill-event-gaps` 再実行で回収できる（別タスク）
- draft 降格された35試合の recap は、イベント再取得＋バッチ再生成まで非公開のままで問題ないか（Autumn Nations 2025 はシーズン終了済みのためトラフィック影響は小さい想定）
