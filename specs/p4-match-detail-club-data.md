# クラブ大会の試合詳細データ充実（得点経過・ラインアップ）

## 背景

試合詳細ページ（`app/matches/[id]/page.tsx`）は `getMatchEventsForMatch` と
`getMatchLineupsForMatch` を全大会に呼び出しており、UI は既に実装済み。
Six Nations ではグラフ・ラインアップが表示されるが、Premiership/URC/Top14/SRP では
`match_events` と `match_lineups` テーブルにデータが存在しないため何も表示されない。
データ投入パスを整備し、Six Nations と同水準の情報密度をクラブ大会にも提供する。

## スコープ

対象:
- `lib/scrapers/` — Premiership・URC・Top14・SRP の得点イベント・ラインアップスクレイパー追加
- `lib/cron/orchestrate.ts` または対応する ingestion スクリプト — 上記スクレイパーを組み込む

対象外:
- `app/matches/[id]/page.tsx` — UIは変更不要
- Six Nations スクレイパー — 変更不要

## データモデル

### match_events（既存テーブル）

```sql
match_id   uuid  references matches(id)
team_id    uuid  references teams(id)
type       text  -- 'try' | 'conversion' | 'penalty_goal' | 'drop_goal' | 'yellow_card' | 'red_card'
player     text  -- 得点者氏名（英語）
minute     int   -- 発生時刻（分）。不明な場合 null
```

### match_lineups（既存テーブル）

```sql
match_id    uuid  references matches(id)
team_id     uuid  references teams(id)
player_name text  -- 選手名（英語）
position    text  -- ポジション名（例: "Prop", "Fly-half"）
jersey_number int -- 背番号
is_starter  bool  -- 先発 true / リザーブ false
```

## データソース調査と実装指針

Codex はまず以下の順で調査し、利用可能なソースを選択すること:

1. **既存の Six Nations スクレイパー** (`lib/scrapers/`) のコードパターンを必ず参照して
   同じ抽象インターフェースで実装すること。Six Nations が使っているソースを確認し、
   Premiership/URC にも同ソースのデータが存在するか確認すること。

2. **ESPN Scrum** (`https://www.espn.com/rugby/`) — 試合ページに `scorecard` タブあり。
   robots.txt を確認し、`User-Agent: Trylinebot` でレート制限 1 req/s を守ること。

3. BBC Sport Rugby / Sky Sports Rugby — ページ構造が安定している場合のみ使用。

### スクレイパー関数シグネチャ（例）

```ts
// lib/scrapers/match-events.ts
export async function scrapeMatchEvents(
  matchId: string,
  externalId: string,      // ESPN / ソース側の試合ID
): Promise<MatchEventInsert[]>

// lib/scrapers/match-lineups.ts
export async function scrapeMatchLineups(
  matchId: string,
  externalId: string,
): Promise<MatchLineupInsert[]>
```

`externalId` は `matches.external_id` カラムに格納されている前提。
カラムが存在しない場合はマイグレーションを追加すること。

## 実装フロー

1. `matches` テーブルに `external_id text` カラムが未存在であれば追加するマイグレーション作成
2. Premiership 2025-26 の試合を対象に `external_id` をシードデータで埋める（最低でも直近10試合）
3. 得点イベントスクレイパー実装 → `match_events` へ upsert
4. ラインアップスクレイパー実装 → `match_lineups` へ upsert
5. cron（`orchestrate.ts`）または単独スクリプトから呼び出せるよう組み込む
6. URC/Top14/SRP にも順次適用

## 受け入れ条件

- [ ] Premiership の直近終了試合（最低1試合）で得点経過グラフが表示される
- [ ] 同試合でラインアップ（先発15名 + リザーブ）が表示される
- [ ] データが存在しない試合では従来どおりグラフ・ラインアップ非表示のまま（UI破壊なし）
- [ ] スクレイパーが robots.txt を確認し、1 req/s を守っている
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- 既存 Six Nations スクレイパーが使っているデータソースは何か（コードを確認すること）
- ESPN の `external_id` マッピングはどのように取得するか（試合URLの数値部分 or API）
