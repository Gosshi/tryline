# Codex プロンプト: League One 交代・カードイベントの取込

> 仕様: `specs/feat-league-one-substitutions-cards.md`（権威。根因・受け入れ条件はそちら）
> 本ファイルは Owner が Codex に渡す作業指示。spec の内容は繰り返さない。

---

## タスク

league-one の event 取込は得点のみ。`specs/feat-league-one-substitutions-cards.md` に基づき、**交代（substitution）とカード（yellow/red）を取り込む**。出典は league-one.jp の print ページ（既存パーサと同じソース）。

## 下調べ済みの事実（実見・2026-06-05）

- `https://league-one.jp/match/{id}/print` に「交替/入替」「カード/処分」セクションが存在。
- 交代フォーマット: **「後半15分」＋背番号 `2 → 16`（OUT → IN）**。**選手名は無く背番号のみ**。
- 背番号→名前は、同じ print ページの lineup（`players[]`：jersey_number + name + team_side）で解決できる。

## 参考にすべき既存コード

- パーサ: `lib/scrapers/league-one-match.ts`
  - `LeagueOneEvent`（`:12-17`）／得点パース `parseScoringEvents`（`:~163`）／時間変換 `parseTimelineMinute`／lineup パース `parseLineupPlayers`・`parseMatchPageLineupPlayers`。
  - `LeagueOneMatchDetail.players`（jersey_number/name/team_side）で背番号→名前を解決。
- 永続化（2経路とも対応）:
  - playoff: `app/api/cron/fill-league-one-playoff-events/route.ts` の `mapLeagueOneEvent` → `lib/ingestion/events.ts` の `upsertMatchEvents`（+ `ParsedMatchEvent` 型）。
  - レギュラー: `scripts/import-league-one-full.ts` の `EVENT_TYPE_TO_DB`（`:32`）+ `upsertMatchEvents`（`:332`）。
- 保存先 `match_events`: `type`(text) / `minute` / `team_id` / `player_id`(nullable) / `metadata`(jsonb)。

## 直すこと

1. **パーサ拡張**（`league-one-match.ts`）:
   - `event_type` union に `"substitution" | "yellow_card" | "red_card"` を追加。交代は2選手のため `player_name` 単一では足りない → 型拡張（`player_in`/`player_out` を持つ discriminated union 等）。
   - 交替/入替セクション: 時間（後半N分→絶対分）＋背番号 OUT/IN を抽出 → `players[]` で名前解決。team_side は Host/Visitor で決定。
   - カードセクション: 背番号＋種別＋時間 → 名前解決。
   - 得点パースは不変（回帰禁止）。
2. **永続化拡張**:
   - `lib/ingestion/events.ts` の `ParsedMatchEvent`/`upsertMatchEvents` を交代（player_in/out）・カードに対応。
   - `mapLeagueOneEvent`（fill-league-one-playoff-events）と `EVENT_TYPE_TO_DB`/`upsertMatchEvents`（import-league-one-full.ts）を新 type に対応。
   - `substitution` の `player_id` は **IN 選手**。metadata=`{player_in_name, player_out_name, jersey_in, jersey_out, source}`。
   - `yellow_card`/`red_card` の player_id=対象選手、metadata=`{player_name, card, source}`。

## 入力 → 期待出力（QF match_29555 / `2cbc8b44-…` で検証）

- 入力: print の交替表（例: 後半15分 `2 → 16`）＋ lineup（背番号2=先発フッカー, 16=リザーブ等）。
- 出力: `match_events` に `type='substitution'`・`minute=55`・`player_id=（背番号16の選手）`・`metadata.player_out_name=（背番号2の選手）`・`metadata.player_in_name=（背番号16）`。

## エッジケース

- 交代/カード セクションが無い試合 → 0件で正常（エラー禁止）。
- 背番号が lineup に無い（解決不能）→ その行はスキップ＋warn（落とさない）。
- 前半/後半の分換算（後半N分 = 40+N）。既存 `parseTimelineMinute` の規約に合わせる。
- ペナルティトライ等、既存得点ロジックを壊さない。

## 完了の定義（Done）

- [ ] spec「受け入れ条件」1〜6 を満たす。
- [ ] 変更: `league-one-match.ts`／`lib/ingestion/events.ts`／`fill-league-one-playoff-events/route.ts`／`import-league-one-full.ts`。
- [ ] パーサに**固定 HTML フィクスチャ**の単体テスト（交代の OUT→IN 名前解決、カード、セクション欠落=0件）。
- [ ] `npm run typecheck`/`lint`/既存テスト green。得点イベントの回帰なしをテストで担保。
- [ ] 本番再取込は Owner 実行（PR に検証 SQL を記載）。

## 検証コマンド（Codex が PR に記載・Owner が実行）

```
# playoff event 再取込（既存 cron 経路）後、SQL で確認:
# select type, count(*) from match_events where match_id='2cbc8b44-...' group by type;
# substitution 行の metadata.player_in_name / player_out_name が実名で lineup と一致するか
```

## 注意（CLAUDE.md 準拠）
- スクレイプ対象は league-one.jp（既存許可ソース）・`fetchWithPolicy` 経由（robots/レート制限）。
- 本番書込は Owner 承認後に Owner 実行。Codex は production キーで自動実行しない。
- LLM は不使用（取込のみ＝課金なし）。
