# Nations Championship 2026 の取り込みが World Rugby API のプレースホルダー行で全滅する不具合を修正

## 背景

`nations-championship-2026` の Round 2(2026-07-11 開催、日本 vs アイルランド含む6試合)が、試合終了から丸1日以上経っても `matches.status = 'scheduled'`・スコア null・`match_events` 0件・recap 未生成のまま放置されていることが本番調査で判明した(2026-07-12〜13、Supabase 直接照会・GitHub Actions 実行ログ照会・現物の Wikipedia / World Rugby API を直接 fetch して再現、いずれも確認済み)。

**根本原因**: `lib/ingestion/sources/world-rugby-nations-championship-times.ts` の `fetchNationsChampionship2026KickoffTimes()` が呼ぶ World Rugby スケジュール API(`GET https://api.wr-rims-prod.pulselive.com/rugby/v3/event/{eventId}/schedule`)のレスポンスに、クロスカンファレンス順位待ちのプレースホルダー行(例: `"NTH 6th" vs "STH 6th"`, `"NTH 3rd" vs "STH 3rd"` 等、決勝トーナメント枠が未確定な試合のダミーチーム名)が含まれるようになった。

`parseWorldRugbyNationsChampionshipSchedulePayload()`(同ファイル 128-157行目)は `payload.matches` を `.map()` で処理し、内部の `resolveTeamSlug()`(74-82行目)が `TEAM_SLUG_BY_WORLD_RUGBY_NAME` に存在しないチーム名に対して `throw new Error(...)` する。`.map()` 中の1件の例外は配列全体の変換を失敗させるため、42件中6件のプレースホルダー行が原因で **`fetchNationsChampionship2026KickoffTimes()` 自体が丸ごと reject する**。

このリクエストは `fetchNationsChampionship2026()`(`lib/ingestion/sources/wikipedia-nations-championship.ts` 172-195行目)内で `Promise.all([fetchWithPolicy(sourceUrl), fetchNationsChampionship2026KickoffTimes()])` として Wikipedia 側の fetch と束ねられているため、**Wikipedia 側のスコア取得(これ自体は正常)まで巻き込んで丸ごと失敗**する。

さらに `ingestAllLiveCompetitions()`(`lib/ingestion/live-competitions.ts` 102-122行目)は `Promise.allSettled()` で各大会を独立実行し、rejected な結果を `console.error` でログするだけでレスポンスからは黙って除外する(fulfilled のみを filter して返す)。このため:
- cron 自体(`.github/workflows/cron-live-pipeline.yml`、6時間おき実行)は毎回 HTTP 200 で "success" 扱いになり、GitHub Actions 上は異常が見えない
- レスポンス JSON の `results` 配列から `nations-championship-2026` のエントリがまるごと消えるだけで、エラーとして表面化しない
- Vercel 関数ログにしか `console.error` が残らず、誰も見ていない

**発生タイムライン**(GitHub Actions 実行ログの実データで確認済み):
- 2026-07-06 13:22 UTC: 最後の正常実行。Round 1(7/4開催)の最終スコア確定・`matches_updated: 36`
- 2026-07-06 18:43 〜 2026-07-08 06:56 UTC: 正常実行が継続(`nations-championship-2026` は結果に含まれるが `matches_updated: 0` — Round 2 がまだ未来の試合だったため0件更新は正常な状態)
- **2026-07-08 12:40 UTC**: 初めて異常発生。ジョブ全体が 504 Gateway Timeout(`maxDuration = 300` を使い切って失敗)。World Rugby API のレスポンスにプレースホルダー行が混入し始めたタイミングと推定
- 2026-07-08 18:34 UTC 以降〜現在: 毎回 `nations-championship-2026` だけが `results` 配列から消える形で失敗し続けている(Round 2 の7/11開催より3日も前から壊れていたため、Round 2 は一度も正常に取り込まれるチャンスがなかった)
- 2026-07-12 14:57 UTC: 手動で `workflow_dispatch` トリガーし再現確認。現在も同じ失敗が継続していることを確認済み

**検証済み事実**:
- Wikipedia 側(`https://en.wikipedia.org/wiki/2026_Nations_Championship`)は Round 2 の結果を正常に含んでおり、既存パーサ(`parseRoundTableMatches`)でそのまま正しくパースできる(日本 20–36 アイルランド 含む6試合すべて確認済み)
- World Rugby API(`https://api.wr-rims-prod.pulselive.com/rugby/v3/event/46294cf5-dee3-4234-957a-dbe1f08049f2/schedule`)は HTTP 200 で42件の `matches` を返すが、末尾6件(index 36-41)が `"NTH Nth"` / `"STH Nth"` 形式のプレースホルダーチーム名を持つ

## スコープ

対象:
- `parseWorldRugbyNationsChampionshipSchedulePayload()`(`lib/ingestion/sources/world-rugby-nations-championship-times.ts`)が、`TEAM_SLUG_BY_WORLD_RUGBY_NAME` に存在しないチーム名の行に遭遇した場合、例外を投げて全体を失敗させるのではなく、**その1行だけを読み飛ばして残りを正常に返す**ようにする
- 上記修正により、次回 cron 実行時に Round 2(7/11、6試合)以降のスコア・イベントが正しく取り込まれることを確認する
- 修正マージ後、Round 2 の再取り込みを実行する(本番 DB への書き込みを伴うため、実行タイミングは Owner 承認後)
- 同様のプレースホルダー行が今後の11月シリーズ・Finals Weekend 分でも発生しうるため、汎用的な対処にする(Round 2 固有のハードコードにしない)

対象外:
- `Promise.allSettled` の失敗を可視化するアラート機構の追加(Slack通知・Discord通知等)は別 spec とする。本 spec は目の前の障害修正のみ
- World Rugby API のプレースホルダー行から実際の順位(例: 北半球6位 vs 南半球6位)を解決してクロスオーバーラウンドの対戦カードを埋める機能。プレースホルダー行はスキップするだけでよく、将来の実チーム確定時に別途正しいデータで上書きされる想定
- Wikipedia 側パーサの変更(既存のまま問題なく動作している)
- `competition_standings`(順位表)の NC 対応。本 spec のバグとは無関係の別課題

## データモデル変更

なし。

## API サーフェス

なし(既存の `/api/cron/ingest-live-competitions` の内部動作を修正するのみ)。

## LLM 連携

なし。ただし本修正により Round 2 のスコア・イベントが取り込まれた後、既存の recap 生成パイプライン(preview → 事実抽出 → ナラティブ生成 → 品質チェック)が通常通り走る想定。追加の LLM 呼び出しは発生しない。

## 実装方針(提案。詳細実装は Codex 判断)

1. `resolveTeamSlug()` の呼び出し元を、例外を投げて即失敗するのではなく `null` を返す/例外を握りつぶして該当行をスキップする形に変更する(`resolveTeamSlug` 自体を変えるか、`parseWorldRugbyNationsChampionshipSchedulePayload` 側で try/catch するかは実装しやすい方でよい)
2. `payload.matches.map(...)` を `flatMap(...)` に変更し、解決できない行は `[]` を返して除外する
3. スキップした場合は `console.warn` でチーム名を残す(サイレントな2度目の見落としを防ぐため。ログのみで十分、アラートは対象外)
4. 既存の他の `throw new Error(...)` 箇所(`parseTeams`, `parseKickoffAt`, `getMatchId` 等)も同じ理由で1行の異常が全体を巻き込む設計になっている。同様に「その試合だけスキップ」に倒すか、Codex の判断で一貫した方針にする
5. 修正後、ローカルまたはステージングで実際の World Rugby API レスポンス(現物、プレースホルダー行を含む)に対してテストし、36件が正常にパースされ6件がスキップされることを確認する

## 受け入れ条件

1. 現物の World Rugby API レスポンス(プレースホルダーチーム名を含む42件、うち6件が `"NTH Nth"` / `"STH Nth"` 系)を入力とした単体テストで、`parseWorldRugbyNationsChampionshipSchedulePayload()` が例外を投げずに36件を返すことを確認するテストがある
2. プレースホルダー行のみ・正常行が0件のケースでも例外を投げず空配列を返すテストがある
3. `fetchNationsChampionship2026()` が、World Rugby 側にプレースホルダー行が混ざっていても Wikipedia 側のスコアを正常に返すことを確認する統合テストがある(またはそれに準ずるテスト)
4. `pnpm test` 全体が通る
5. TypeScript strict エラーなし
6. 修正マージ後、Owner 承認を得た上で本番 `/api/cron/ingest-live-competitions` を実行し、以下を確認する:
   - `nations-championship-2026` の Round 2 全6試合が `status = 'finished'` になり、正しいスコアが入っている(日本 20–36 アイルランド 等)
   - 各試合に `match_events` が挿入されている
   - `match_content` に Round 2 6試合分の `recap:published` が生成される(既存の preview → recap パイプライン経由、追加実装不要)

## 未解決の質問

- World Rugby API のプレースホルダー行の命名規則(`"NTH Nth"` / `"STH Nth"`)が今回確認した1パターンのみか、他の表記揺れがあるかは未確認。Codex が実装時に現物レスポンスを再確認すること
- Round 2 の再取り込み(受け入れ条件6)を誰が・いつ実行するか。cron は6時間おきに自動実行されるため、マージ後は放置しても次回実行で自然に回復する見込みだが、日本戦レビューを急ぐ場合は Owner 承認の上で手動 `workflow_dispatch` トリガーも選択肢
- 同様の「1件の異常が全体を巻き込む」設計が他の大会ソース(`lib/ingestion/sources/` 配下の他ファイル)にも存在しないか。本 spec のスコアでは NC のみ対応するが、横展開の要否は別途 Owner 判断
