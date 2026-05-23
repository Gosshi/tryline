# League One プレーオフ イベント自動取得

## 背景

League One のプレーオフ試合（準々決勝・準決勝・3位決定戦・決勝）は、試合後に recap が自動生成されない。

根本原因は `match_events` が空のままであること。パイプラインは `match_events.length === 0` のとき recap をスキップする（`lib/llm/pipeline.ts:80`）。

他大会は English Wikipedia の vEvent マークアップから events を取得しているが、League One には対応する English Wikipedia ページが存在しない。

**解決アプローチ**: 日本語 Wikipedia のプレーオフセクションには `{{rugbybox}}` テンプレートが含まれており、そこに league-one.jp の match ID が埋め込まれている。これを橋渡しとして使い、league-one.jp の `/match/{id}/print` ページから実際のイベントデータを取得する。

```
日本語 Wikipedia プレーオフページ（rugbybox テンプレート）
  → league-one.jp match ID を抽出
  → DB の matches レコードを特定（external_ids.wikipedia_event_id = "match_{id}"）
  → league-one.jp/match/{id}/print からイベントを取得
  → match_events に挿入
  → orchestrate cron が recap を生成
```

## スコープ

**対象**:
- League One Division 1 プレーオフ（準々決勝×2・準決勝×2・3位決定戦・決勝）
- `match_events` が空かつ `status = finished` の試合のみ処理

**対象外**:
- リーグ戦レギュラーシーズン（既存の `import-league-one-full.ts` スクリプトで対応済み）
- Division 1/2 入替戦
- ラインアップデータの取得（`/match/{id}/print` には含まれているが、events のみを対象とする）

## データモデル変更

スキーマ変更なし。既存の `match_events` テーブルに挿入するのみ。

## 新規ファイル

### `lib/scrapers/wikipedia-league-one-playoffs.ts`

日本語 Wikipedia のリーグワン シーズンページから、プレーオフ試合の league-one.jp match ID を抽出するスクレイパー。

**入力**: シーズン文字列（例: `"2025-26"`）

**処理**:
1. `https://ja.wikipedia.org/wiki/ジャパンラグビーリーグワン{YYYY-YY}` をフェッチ（URL エンコード済み）
2. `#プレーオフトーナメント` 以下の `{{rugbybox}}` テンプレートを解析
3. `data-mw` 属性の JSON から `params.report.wt` を取り出し、`league-one.jp/match/(\d+)/print` の正規表現で match ID を抽出

**出力**:
```typescript
type PlayoffMatchRef = {
  leagueOneMatchId: number;   // league-one.jp の内部 match ID
  homeScore: number | null;   // rugbybox の score フィールドから取得（未確定なら null）
  awayScore: number | null;
};
```

### `app/api/cron/fill-league-one-playoff-events/route.ts`

新規 cron エンドポイント。

**処理フロー**:
1. リクエストボディの `season`（例: `"2025-26"`）を受け取る
2. `fetchLeagueOnePlayoffMatchRefs(season)` で Wikipedia から match ref 一覧を取得
3. 各 match ref について `external_ids->>'wikipedia_event_id' = 'match_{leagueOneMatchId}'` で DB の match レコードを検索
4. `status = finished` かつ `match_events` が空のものだけ処理
5. 既存の `fetchLeagueOneMatchDetail(leagueOneMatchId)` を呼び出してイベントを取得
6. 既存の `upsertMatchEvents()` で `match_events` に挿入
7. リクエスト間に 1500ms の待機（`fetchWithPolicy` のレート制限に準拠）

**認証**: 既存の `assertCronAuthorized` を使用

**レスポンス例**:
```json
{
  "season": "2025-26",
  "processed": 2,
  "eventsInserted": 18,
  "skipped": 0,
  "errors": []
}
```

### `.github/workflows/cron-fill-league-one-playoff-events.yml`

```yaml
name: Cron — Fill League One Playoff Events

on:
  schedule:
    - cron: '0 8 * * 0'   # 日曜 8:00 UTC（17:00 JST）
  workflow_dispatch:

jobs:
  fill-league-one-playoff-events:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger fill-league-one-playoff-events
        run: |
          curl -f -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            -d '{"season":"2025-26"}' \
            https://tryline-six.vercel.app/api/cron/fill-league-one-playoff-events
```

スケジュールは `fill-event-gaps`（日曜 6:00 UTC）の **2時間後** に設定し、既存 cron との競合を避ける。プレーオフ期間外は空振りして終わるだけなので、通年スケジュールで問題ない。

## 既存コードの再利用

| 既存モジュール | 用途 |
|---|---|
| `lib/scrapers/league-one-match.ts` `fetchLeagueOneMatchDetail` | `/match/{id}/print` からイベントを取得 |
| `lib/scrapers/league-one-match.ts` `parseLeagueOneMatchPrintHtml` | HTML をパース |
| `lib/ingestion/events.ts` `upsertMatchEvents` | `match_events` に挿入 |
| `lib/scrapers/fetcher.ts` `fetchWithPolicy` | robots.txt 対応・レート制限付きフェッチ |
| `lib/cron/auth.ts` `assertCronAuthorized` | 認証 |

## 受け入れ条件

1. `fill-league-one-playoff-events` cron が実行されると、Wikipedia ページに掲載済みの全プレーオフ試合の league-one.jp match ID が取得できる
2. DB に該当 match レコードが存在し `status = finished` であれば、イベントが `match_events` に挿入される
3. 既にイベントが存在する試合はスキップされる
4. イベント挿入後、次回の `orchestrate` cron（毎日 12:00 UTC）で recap が生成され、Discord 通知が届く
5. Wikipedia ページが未更新（スコアなし）の試合は `processed` に含まれず、次回実行時に再試行される
6. エラーが発生した試合は `errors` に記録され、処理は継続される

## 設計決定

1. **シーズン指定の自動化**: ハードコードしない。`competitions` テーブルから動的に特定する。クエリ条件: `family = 'league-one' AND end_date >= NOW() - INTERVAL '30 days'` で最新シーズンを1件取得し、slug（例: `league-one-2025-26`）からシーズン文字列（`"2025-26"`）を抽出する。30日のバッファにより、決勝直後の cron 実行でも正しいシーズンが取得できる。現在のシーズンデータ: `league-one-2025-26`（start: 2025-12-13, end: 2026-05-24）。
2. **スコアの不一致**: Wikipedia のスコアで DB を**上書きしない**。league-one.jp から取得したスコアが正データ。Wikipedia は match ID の特定にのみ使用する。

## 参考

- `lib/scrapers/league-one-match.ts` — league-one.jp `/match/{id}/print` パーサー（実装済み）
- `app/api/cron/fill-event-gaps/route.ts` — 設計パターンの参考
- `lib/llm/pipeline.ts:80` — recap スキップ条件
- 日本語 Wikipedia 2025-26: `https://ja.wikipedia.org/wiki/ジャパンラグビーリーグワン2025-26`