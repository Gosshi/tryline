# League One プレーオフの lineup が取り込めない問題の修正

> 作成: 2026-06-05 / 起票: Track B（グロース）調査 → Track A 受け渡し
> 関連: `docs/x-drafts-weekend-2026-06.md`（決勝スタメンX③ がこの修正に依存）／`specs/fix-cron-timing-league-one-playoff.md`（同じ playoff の cron タイミング問題・別件）／`specs/fix-league-one-playoff-stage-labeling.md`（同じ live 再同期が external_ids を上書きする系譜）

## 背景

リーグワン2025-26 のプレーオフ全6試合（QF×2・SF×2・3位決定戦・決勝）で、Tryline DB の `match_lineups` が **0行**。一方レギュラーシーズンは108試合すべて lineup を保持している。

実害：
- 決勝（神戸×クボタ）・3決（サントリー×ワイルドナイツ）のプレビューに **実名スタメンが載らない**。
- グロース施策「スタメン発表X第2弾（プレビューに実名反映）」が成立しない。
- 終了済みの QF/SF recap も lineup 文脈を欠く。

公式ソース（league-one.jp）には**メンバーは出ている**（例: `https://league-one.jp/match/29559?t1=1`）。データが無いのではなく、**取り込めていない**。

## 根因（コード追跡で確定）

1. **League One の lineup 書込元は手動スクリプト `scripts/import-league-one-full.ts` のみ**。
   - `:422` `fetchLeagueOneSchedule(season)` で対象試合を取得 → `:383` `https://league-one.jp/match/${league_one_match_id}/print` を組む → `fetchLeagueOneMatchDetail` で取得 → `:401/:322` `upsertMatchLineups` で `match_lineups` に書込。
   - リポジトリ全体で `match_lineups` に insert/upsert する本番経路はこのスクリプトと cron の `app/api/cron/ingest-lineups/route.ts` のみ（他は Six Nations 専用 `backfill-match-lineups.ts`、World Rugby、テスト）。

2. **`fetchLeagueOneSchedule` がレギュラーシーズンしか取得しない**（真因）。
   - `lib/scrapers/league-one-schedule.ts:198-201` は `buildScheduleUrl(season)` のみ叩く。playoff 用の `buildPlayoffsUrl`（`lib/ingestion/sources/league-one-live.ts` 側に存在）を使っていない。
   - → 手動インポータのループに **playoff 試合が一度も入らない** → playoff lineup は永久に未取込。

3. **cron 経路はこの大会を救えない**。
   - `app/api/cron/orchestrate/route.ts:14-41` → `ingest-lineups` を呼ぶが、`ingest-lineups/route.ts:50-60` は **`external_ids.wikipedia_url` 必須**。無ければ 400 `"matches.external_ids.wikipedia_url is not set"`。
   - orchestrator は `:32-37` でそれを `no_url` として**黙ってスキップ**（カウントのみ）。
   - League One の `toExternalIds`（`lib/ingestion/fixtures.ts:30-42`）は `wikipedia_round` と `wikipedia_event_id` しか set せず、**`wikipedia_url` を持たない**。→ League One 全試合が常に `no_url` で素通り。

4. **データを手SQLで埋めても消える**。
   - league-one-live 再同期（直近の round_name 修正含む）が `external_ids` を `toExternalIds` の出力で**上書き**し、`wikipedia_url` を落とす。実際レギュラー108試合も現在 `wikipedia_url` を持たない（lineup は取込済みのため残存）。
   - 教訓（既存）: **external_ids への手動 SQL は同期で上書きされ無効**。修正は parser/取込コード側に置くこと。

### 確定事実（DB 実測・根拠）
- League One 2025-26: `HAS_lineup`=108 / `NO_lineup`=6。両バケットとも `wikipedia_url` 保有=0、`wikipedia_event_id` 保有=全件。
- 既存 lineup の `source_url` ドメイン=`league-one.jp`（4968行）、取込期間 5/7〜**5/17 で停止**。
- playoff 6試合の `external_ids` 例: `{"source":"league-one.jp","round_name":"3rd place match","wikipedia_event_id":"match_29559"}`。
- playoff match_id / event_id: QF `match_29555`/`match_29556`、SF `match_29557`/`match_29558`、3決 `match_29559`（match_id `96863688-cf14-40f8-b3d7-8d485ae5504b`）、決勝 `match_29560`（match_id `0fd7d8e6-37f9-4b58-82dd-9c2d5592fd64`）。

## スコープ

対象:
- League One プレーオフ（QF/SF/3決/決勝）の lineup を取り込めるようにする。
- **upcoming（`scheduled`）試合**でも、公式にメンバーが出ていれば取り込める（決勝・3決の試合前反映のため）。
- 再同期で消えない、堅牢なソース指定（`wikipedia_event_id` 起点で URL を導出）。

対象外:
- 他大会（Wikipedia 系）の lineup 経路の変更。
- AI チャット／コンテンツ生成パイプライン本体。
- broadcast_jp_url 等の別タスク。

## データモデル変更

原則なし（`match_lineups` スキーマ・`onConflict: "match_id,team_id,jersey_number"` は現状維持）。

注意:
- **`external_ids.wikipedia_url` に依存しない**こと。League One は `wikipedia_event_id`（`match_29559`）が常在し再同期でも残る。lineup URL はこれから導出（`https://league-one.jp/match/29559/print`）。
- 任意改善: `toExternalIds`（fixtures.ts:30-42）が League One でも `wikipedia_url = https://league-one.jp/match/{id}` を併記すれば cron 経路とも整合するが、**本筋ではない**（再同期で消える前提のため、URL は event_id から都度導出が安全）。

## API / 取込サーフェス

次のいずれかで playoff を取り込めるようにする（実装者判断、後者推奨）:

- **案A（最小）**: `fetchLeagueOneSchedule` を playoff 対応にする。`buildPlayoffsUrl(season)` も取得して entries に統合（`league-one-live.ts` の `fetchLeagueOne202526` と同じ二段フェッチの考え方）。`import-league-one-full.ts` はそのまま全試合を回せるようになる。
  - 併せて、`import-league-one-full.ts` の対象が `status: "finished"` 限定なら、**`scheduled` も対象**に含める（upcoming 決勝/3決の試合前反映のため）。

- **案B（恒久・推奨）**: League One 専用の lineup 取込を **cron 化** する。DB の League One 試合（playoff 含む・`scheduled`/`finished` 両方、`match_lineups` 0件）を列挙し、`external_ids.wikipedia_event_id`（`match_29559`）から `https://league-one.jp/match/{id}/print` を組んで取込。`orchestrate` から League One はこの経路に振り分ける（Wikipedia 用 `ingest-lineups` の `wikipedia_url` 必須分岐に乗せない）。
  - robots.txt 順守・レート制限・キャッシュは既存 `fetchWithPolicy` 準拠。

いずれも `parseLineupFromTableHtml` / `fetchLeagueOneMatchDetail` の既存パーサを再利用すること（新規スクレイパは不要）。

## UI サーフェス

- 直接の UI 変更なし。lineup が入れば既存のプレビュー生成で実名が反映される。
- 取込後、対象試合の**プレビュー再生成**が必要（実名を本文に乗せるため）。3決/決勝/QF/SF を対象に再生成をトリガ。

## LLM 連携

- パイプライン段階の変更なし。lineup は事実抽出（stage 2）以降の入力として使われる前提。
- 取込→プレビュー/レビュー再生成の順序を守る（lineup 不在のまま生成済みのものは regen 必要）。

## 受け入れ条件（Codex が検証可能）

1. League One プレーオフ取込を実行後、`match_lineups` に以下が入る:
   - 終了済み: QF `match_29555`/`29556`、SF `match_29557`/`29558` の home/away 双方。
   - upcoming（公式発表後）: 3決 `match_29559`、決勝 `match_29560`。各チーム 23名（先発15＋リザーブ8）程度。
2. 取込は **`external_ids.wikipedia_url` に依存しない**（League One 試合が `wikipedia_url` を持たない現状でも成功する）。
3. league-one-live の再同期を1回流しても、**取込済み lineup が消えない**こと（external_ids 上書きの影響を受けない）。
4. `scheduled` 状態の決勝・3決でも、公式にメンバーが出ていれば lineup を取り込める。
5. 既存レギュラーシーズン108試合の lineup を壊さない（冪等・`onConflict` 維持）。
6. robots.txt / レート制限を順守（`fetchWithPolicy` 経由）。
7. ビルド・型・既存テスト（`tests/api/ingest-lineups.test.ts` 等）が通る。新経路には最低限のユニットテストを追加。

## 検証手順（Owner/Codex 用）
1. 取込実行（案Bならローカルで cron ハンドラを叩く、案Aなら `import-league-one-full.ts --year=2026` 等）。
2. SQL で playoff 6試合の `match_lineups` 件数を確認（0→23×2 想定）。
3. 流大（match_29559・サントリー・リザーブ）・中村亮土 が players/lineup に入っているか確認。
4. 対象試合のプレビュー再生成 → 本文に実名が出るか確認。

## 未解決の質問（着手前に Owner 判断）

1. **恒久化の形**: 案A（既存手動スクリプトを playoff 対応に拡張）か、案B（cron 化）か。RWC2027 まで運用が続く前提なら案B推奨。
2. **upcoming 取込の頻度**: 決勝/3決の試合前反映をどこまで自動化するか（毎日 cron か、試合の前日に手動トリガか）。
3. **league_one_match_id の取得元**: 案Bで DB から回す場合、`wikipedia_event_id` の `match_` プレフィックスを剥がして数値 id を使う想定でよいか（`match_29559` → `29559`）。
4. **`/print` ページの可用性**: upcoming 試合でも `/match/{id}/print` にメンバーが出るか（`?t1=1` タブとの差異）。出ない場合のフォールバック。

## 週末の暫定対応（この修正と並行・Track B 用メモ）
- 修正完了まで、決勝Xは「スタメン反映済プレビュー」と謳わず**プレビューへの送客のみ**に弱める（`docs/x-drafts-weekend-2026-06.md` ③ の注記参照）。
- 3決X①は lineup 非依存のため影響なし（投下可）。
