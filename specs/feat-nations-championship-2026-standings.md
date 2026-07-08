# Nations Championship 2026 の順位表（南北セミファイナル区分）を取り込む

## 背景

2026-07-08 の集客・データ品質分析（Fable/Codex）で、開催中の目玉大会 Nations Championship 2026 の `competition_standings` が **0行**であることが判明した（本番DB実測で確認済み）。ホームの Matchday Board・大会アーカイブでこの大会を前面に出しているにもかかわらず、順位表が一切表示できない状態が続いている。

**根本原因**: `scripts/backfill-standings.ts` の `SUPPORTED_FAMILIES`（順位表取り込み対象の大会一覧）に `nations-championship` が含まれていない。既存の週次自動更新（`lib/ingestion/weekly-standings.ts` の `WEEKLY_STANDINGS_FAMILIES`）もこの一覧から派生しているため、同様に対象外のままになっている。

Wikipedia の実ページ（`2026_Nations_Championship`）で確認したところ、順位表は存在し、以下の勝ち点方式が明記されている:
- 勝利4点・引き分け2点・敗北0点
- 4トライ以上でボーナスポイント+1
- 8点差以内の敗北でボーナスポイント+1

さらに、この大会は **Northern Hemisphere（6か国）・Southern Hemisphere（6か国）の2つの独立した順位表**に分かれている（総当たりではなく南北別グループ）。この「1大会内で複数グループの順位表を持つ」構造は、RWC のプールステージ（`competition_pools` テーブルの `pool_name` で管理）で既に実装済みのパターンと同じであり、新規のデータモデル変更は不要と判断できる。

## スコープ

対象:
- `scripts/backfill-standings.ts` の `SUPPORTED_FAMILIES` に `nations-championship` を追加
- `resolveWikipediaStandingsUrl` に `nations-championship` のケースを追加（`https://en.wikipedia.org/wiki/${season}_Nations_Championship`）
- Northern/Southern Hemisphere の2グループを、RWCプールと同じ `competition_pools`（`pool_name` = "Northern Hemisphere" / "Southern Hemisphere"）+ `competition_standings`（各グループ内での相対 `position`）のペアで取り込む
- ボーナスポイント方式（4トライ+1、8点差以内敗戦+1）が既存の `bonus_points_try` / `bonus_points_losing` カラムで正しく計算・格納されるようにする
- `lib/ingestion/weekly-standings.ts` の週次自動更新対象に `nations-championship` が含まれるようにする（`SUPPORTED_FAMILIES` 経由で自動的に反映されるはずだが、Nations Championship 固有の除外分岐が無いか確認する）

対象外:
- シーズンページ・大会ハブの表示側変更（`getPoolStandingsForCompetition` 等、既存のプール表示ロジックをそのまま使う想定。表示コンポーネント自体の変更は不要な見込みだが、実装時に `app/c/[competition]/[season]/page.tsx` がプール分け表示に対応していない場合は最小限の対応を追加してよい）
- 過去の Nations Championship シーズン（2026年新設のため過去シーズンは存在しない）
- 11月開催の Round4-6（ファイナルズウィークエンド）の特別な順位決定ロジック（現時点では7月の南北総当たりの順位表のみが対象。ファイナルズ進出条件等は別途）

## データモデル変更

なし（既存の `competition_pools` / `competition_standings` テーブルをそのまま使う）。

## API サーフェス

なし。既存のスクレイパー（`lib/scrapers/wikipedia-standings.ts` の `scrapeCompetitionStandings`）が2テーブル構成のページに対応しているか確認し、対応していなければ「複数の順位表セクションを持つページ」への対応を追加する。

## 実装詳細

### 1. `SUPPORTED_FAMILIES` / `resolveWikipediaStandingsUrl` への追加

`scripts/backfill-standings.ts`:

```ts
export const SUPPORTED_FAMILIES = new Set<SupportedFamily>([
  "autumn-nations",
  "league-one",
  "nations-championship", // 追加
  "pnc",
  "premiership",
  "rugby-championship",
  "six-nations",
  "super-rugby-pacific",
  "top-14",
  "urc",
]);
```

```ts
case "nations-championship":
  return `https://en.wikipedia.org/wiki/${season}_Nations_Championship`;
```

### 2. 南北グループの取り込み

`scrapeCompetitionStandings` がページ内の "Northern Hemisphere" / "Southern Hemisphere" という2つの見出しセクションをそれぞれ独立したテーブルとして認識できるか確認する。既存の実装が単一テーブル前提の場合、RWCプール取り込み（`competition_pools` に pool_name を書き込みながら、各プール内の相対 position で `competition_standings` に書き込む既存ロジック）と同じパターンに揃える。

### 3. ボーナスポイントの検証

「4トライ以上で+1」「8点差以内の敗北で+1」は Six Nations 等の標準的な方式と同じ計算式のため、既存の `upsertCompetitionStandings`（`lib/ingestion/standings.ts`）がそのまま使える見込みだが、実装時に既存ロジックの計算式を確認し、Nations Championship の規定と一致するか検証する。

## LLM 連携

なし。

## 受け入れ条件

1. `pnc` や `six-nations` と同様に、`node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-standings.ts --family=nations-championship --season=2026` が実行可能になる
2. 実行後、`competition_standings` に Nations Championship 2026 の12チーム分（Northern 6・Southern 6）の行が作成される
3. 各チームの `position` が、自分の所属グループ（Northern または Southern）内での相対順位になっている（グループを跨いで1〜12ではなく、各グループ内で1〜6）
4. `bonus_points_try` / `bonus_points_losing` が正しく計算されている（実データ: 7/4終了時点で南北とも1試合終了、勝利4点+ボーナス条件次第で5点、引き分け2点等）
5. `lib/ingestion/weekly-standings.ts` の週次自動更新（`WEEKLY_STANDINGS_FAMILIES`）に `nations-championship` が含まれ、次回以降のRoundも自動更新される
6. シーズンページ（`/c/nations-championship/2026`）で順位表が正しく南北別に表示される（既存の `StandingsTable`/`getPoolStandingsForCompetition` 相当のコンポーネントで対応可能な場合はそのまま使う）
7. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 未解決の質問

- `scrapeCompetitionStandings` が複数テーブルページに対応していない場合、RWCプール取り込みの既存実装が別の専用スクリプトになっているか、共通化されているかを実装時に確認し、共通化されていなければ最小限の抽象化を検討してほしい（大規模なリファクタは不要、今回のケースに対応できる範囲でよい）
- 11月のファイナルズウィークエンドでの南北王者決定後の特別な順位表統合ロジックは、Round4-6が近づいてから別 spec で検討する
