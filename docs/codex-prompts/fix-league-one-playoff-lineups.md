# Codex プロンプト: League One プレーオフ lineup 取込の修正

> 仕様: `specs/fix-league-one-playoff-lineups.md`（権威。根因・受け入れ条件・案A/案Bはそちら参照）
> 本ファイルは Owner が Codex に渡すための作業指示。spec の内容は繰り返さない。
> 関連（別件・重複しない）: `docs/codex-prompts/pr77-league-one-playoff-ingestion.md`（playoff の **試合** 取込＝完了済。本件は **lineup**）。

---

## タスク

League One プレーオフ（QF/SF/3決/決勝）の lineup が Tryline に取り込めない。`specs/fix-league-one-playoff-lineups.md` の根因に基づき、**playoff の lineup を取り込めるようにする**。

**推奨は spec の案B（cron 化・event_id 起点で URL 導出）**。ただし工数を見て案A（既存スクリプト拡張）でも可。どちらを選んだか PR 説明に明記すること。

## 参考にすべき既存パターン（再利用・新規スクレイパ禁止）

- 既存の League One 取込本体: `scripts/import-league-one-full.ts`
  - `:383` `https://league-one.jp/match/${league_one_match_id}/print` を組んで `fetchLeagueOneMatchDetail` → `upsertMatchLineups`（`:270`/`:322`）。
  - CLI: `node --env-file=.env.production.local tools/run-ts.cjs scripts/import-league-one-full.ts <YYYY-YY>`（season 引数は `2025-26` 形式・`:421`）。
- スケジュール取得: `lib/scrapers/league-one-schedule.ts`
  - `fetchLeagueOneSchedule`（`:198`）が `buildScheduleUrl`（`:77`）= **レギュラーのみ**。
  - playoff URL は `lib/ingestion/sources/league-one-live.ts:47` の `buildPlayoffsUrl`（現状 private）。`fetchLeagueOne202526`（`:213`〜）が schedule と playoffs を二段フェッチして統合する実装が手本。
- lineup パーサ: `lib/scrapers/wikipedia-lineups.ts` の `parseLineupFromTableHtml`（汎用・league-one.jp の print HTML に既に使われている）。
- cron の作り方の手本: `app/api/cron/*/route.ts`（`assertCronAuthorized` + `getSupabaseServerClient`）。orchestrate からの振り分けは `app/api/cron/orchestrate/route.ts:14-41`。

## 入力 → 出力の具体例

- 入力: 3決 match（`matches.external_ids.wikipedia_event_id = "match_29559"`, status=`scheduled`）。
  - URL 導出: `match_29559` → 数値 `29559` → `https://league-one.jp/match/29559/print`。
- 出力: `match_lineups` に home/away 各23行（先発15＋リザーブ8）。例として `流大`・`中村亮土`（サントリー・リザーブ）が `players` ＋ `match_lineups` に入る。
- 既存108試合（レギュラー）は再実行しても重複増殖しない（`onConflict: "match_id,team_id,jersey_number"`）。

## 必ず処理すべきエッジケース

1. **`wikipedia_url` 非依存**: League One 試合は `external_ids.wikipedia_url` を持たない。URL は **`wikipedia_event_id` から導出**すること。`wikipedia_url` 必須の `ingest-lineups/route.ts` 経路に乗せない。
2. **`scheduled`（試合前）も対象**: 決勝/3決は当日まで `scheduled`。公式にメンバーが出ていれば取り込む。`finished` 限定フィルタがあれば緩和。
3. **メンバー未発表**: `/print` にメンバーがまだ無い試合は **0行で正常終了**（エラーにしない・既存行を消さない）。
4. **`match_` プレフィックス**: `wikipedia_event_id` が `playoff_xxx_v_yyy`（数値 id が取れなかった playoff fallback、`league-one-live.ts:172-176`）の場合は URL を組めない → skip して warn。
5. **再同期耐性**: 取り込んだ lineup は league-one-live 再同期後も残ること（external_ids を書き換えず、match_lineups にのみ書く）。
6. robots.txt・レート制限は `fetchWithPolicy` 経由を厳守。連続フェッチには既存同様の sleep を入れる。

## 完了の定義（Done）

- [ ] spec「受け入れ条件」1〜7 をすべて満たす。
- [ ] 変更ファイル（案Bの場合の目安）: 新規 `app/api/cron/ingest-league-one-lineups/route.ts`（or 既存 cron に統合）＋ `league-one-schedule.ts` or `league-one-live.ts` の playoff URL 共有化＋必要なら `orchestrate` 振り分け。案Aの場合: `league-one-schedule.ts`（playoff 統合）＋ `import-league-one-full.ts`（scheduled 対応）。
- [ ] ユニットテスト追加（URL 導出 `match_29559`→print URL、`scheduled` 対象化、メンバー未発表時 0行）。`tests/api/ingest-lineups.test.ts` の流儀に合わせる。
- [ ] `npm run typecheck` / `lint` / 既存テストが green。
- [ ] ローカル実行ログで playoff 6試合の取込結果（件数）を PR に貼る。
- [ ] **本番取込・プレビュー再生成は Owner が実行**（Codex は実装と検証コマンドの提示まで）。

## 検証コマンド（Codex が PR に記載・Owner が実行）

```
# 取込（案A例）
node --env-file=.env.production.local tools/run-ts.cjs scripts/import-league-one-full.ts 2025-26
# 確認 SQL（playoff 6試合の lineup 件数 0→23×2 を確認）
# 流大/中村亮土 が match_29559 の match_lineups に存在するか
```

## 注意（CLAUDE.md 準拠）

- 本番 DB 書込・プレビュー再生成は Owner 承認後に Owner が実行。Codex は production キーで自動実行しない。
- スクレイプ対象は league-one.jp の既存許可ソースのみ。User-Agent 偽装・rate limit 回避は不可。
