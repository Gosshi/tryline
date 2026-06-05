# League One：交代・カードイベントの取込

> 作成: 2026-06-05 / 起票: Track B 調査 → Track A 受け渡し
> 関連: `specs/feat-lineup-aware-previews.md`（recap で実名活用＝この交代データが入れば出場/投入を書ける）／`specs/fix-league-one-playoff-lineups.md`（取込基盤）／`specs/feat-league-one-playoff-events.md`（得点 events＝別・既存）

## 背景

現状 league-one の event 取込は**得点イベントのみ**（`league-one-match.ts` の `EVENT_TYPE_BY_PRINT_LABEL` ＝ try/conversion/penalty/drop_goal）。**交代・カードは未取込**。

そのため:
- レビュー（recap）で「誰が後半に投入されたか」「ベンチから流れを変えた」を書けない。
- **出場確認ができない**（例: 引退選手がリザーブ#21 で、実際にピッチに立ったかをデータで裏取りできない＝「現役ラストゲーム」を自動確定できない）。

下調べ（2026-06-05・`league-one.jp/match/29555/print` 実見）で **交代・カードは print ページに存在**を確認：
- 交替/入替: 「後半15分／背番号 `2 → 16`（OUT→IN）」形式。**選手名は無く背番号のみ**。
- カード/処分: イエロー等。TMO は特記事項に時系列。
- 背番号は `match_lineups`（背番号→選手）で**名前に解決可能**。

## スコープ

対象:
- パーサ: `lib/scrapers/league-one-match.ts`（交替/入替・カード セクションの解析を追加）。
- 永続化: league-one の event 書込経路。
  - playoff: `app/api/cron/fill-league-one-playoff-events`（`mapLeagueOneEvent` → `lib/ingestion/events.ts:upsertMatchEvents`）。
  - レギュラー: `scripts/import-league-one-full.ts`（`EVENT_TYPE_TO_DB` + `upsertMatchEvents`）。

対象外:
- recap プロンプトでの活用は**フェーズ2**（本 spec はデータ取込が主。プロンプト側は `feat-lineup-aware-previews.md` の延長で別途）。
- 他大会（Wikipedia 系）の event 経路。

## データモデル

`match_events`（既存・変更最小）: `type`(text) / `minute` / `team_id` / `player_id`(nullable) / `metadata`(jsonb)。

新 `type` 値（既存の try/conversion/penalty_goal/drop_goal に追加）:
- `substitution`: player_id = **IN（投入された選手）**。metadata に `{ player_in_name, player_out_name, jersey_in, jersey_out, source }`。
- `yellow_card` / `red_card`: player_id = 対象選手。metadata に `{ player_name, card, source }`。

> 設計判断: 交代は2選手絡むが、`player_id` は「ピッチに立った IN 選手」にする（**出場確認に直結**）。OUT は metadata で保持。

## パーサ設計（`league-one-match.ts`）

- `LeagueOneEvent.event_type` の union に `"substitution" | "yellow_card" | "red_card"` を追加。交代は単一 `player_name` では表現できないため、型を拡張（例: `player_in`/`player_out`、または discriminated union）。
- 交替/入替セクション: 「後半N分」→ `parseTimelineMinute` 同様に絶対分へ。背番号 OUT/IN を抽出。
- **背番号→名前の解決**は detail 内の `players[]`（jersey_number + name + team_side）で行う（同一ページ内で完結）。team_side は当該セクションが Host/Visitor のどちらかで決定。
- カードセクション: 背番号＋種別（イエロー/レッド）＋時間 → `players[]` で名前解決。
- 既存の得点パースは変更しない（回帰なし）。

## 永続化設計

- `lib/ingestion/events.ts` の `ParsedMatchEvent`/`upsertMatchEvents` を、交代（player_in/out）・カードの metadata を持てるよう拡張。
- `fill-league-one-playoff-events` の `mapLeagueOneEvent` と `import-league-one-full.ts` の `EVENT_TYPE_TO_DB`/`upsertMatchEvents` を新 type に対応。
- 既存同様、match 単位で delete→insert（冪等）。

## 受け入れ条件（検証可能）

1. 終了済み QF サントリー×リコー（match_29555 / `2cbc8b44-…`）の取込後、`match_events` に:
   - `type='substitution'` 行が複数、各行 `metadata.player_in_name`/`player_out_name` が実名（lineup と一致）、`minute` が後半=40+分。
   - イエローがあれば `type='yellow_card'` 行（対象選手名）。
2. 交代の `player_id` が **IN 選手**を指す（出場確認に使える）。
3. 背番号→名前解決が `match_lineups` と整合（外部名ゼロ・取り違えなし）。
4. 得点イベント（try/PG 等）は**回帰しない**（件数・内容不変）。
5. 交代/カードが無い試合・該当セクション欠落でも**エラーにせず0件**で正常終了。
6. `npm run typecheck`/`lint`/既存テスト green。パーサに固定 HTML フィクスチャの単体テスト追加。

## 検証手順
1. 既存 league-one event 経路で QF を再取込（playoff は `fill-league-one-playoff-events`、または import スクリプト）。
2. SQL で `match_events` の type 別件数＋substitution の metadata 実名を確認。
3. 流大/中村亮土が「IN」として現れるか（出場した試合があれば）で出場確認の実用性を確認。

## 未解決の質問（着手前に Owner 判断）
1. **TMO・特記事項**まで取り込むか（今回はスコープ外推奨／交代・カードに集中）。
2. 一時的退出（シンビン復帰）等、複雑ケースをどこまで厳密にやるか（初版は yellow/red と通常交代で十分か）。
3. **出場確認の活用**（recap で「現役ラストゲーム」自動確定・X②）は本データ前提でフェーズ2に回す方針でよいか。
