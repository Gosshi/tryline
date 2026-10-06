# 日程の取り込み（RWC 2027）を、壊さずに取り込み直せるようにする

## 背景

2026-10-06、`specs/fix-rwc2027-kickoff-timezones.md`（PR #924・#925）の修正後に、Owner の承認を得て Claude Code が本番で RWC 2027 を取り込み直したところ、データが壊れた。

- **14 試合が二重に登録された**（36 → 50 試合）。
- 新しい行も、更新された行も、多くが**別の試合の時刻**になった（例: 南アフリカ 対 イタリアにフランス 対 日本の時刻）。前は正しかった行（イタリア 対 ジョージア、アルゼンチン 対 スペイン）まで書き換わった。
- 復旧: Owner が重複の 14 行を DELETE、Claude Code が Owner の承認で 23 行の `kickoff_at` を公式の値に UPDATE。36 試合すべてが公式と一致することを確認済み（`project_rwc2027_kickoff_times_wrong`）。
- その後、`Cron — Ingest Fixtures`（`.github/workflows/cron-ingest-fixtures.yml`）は **`gh workflow disable` で止めている**。シックスネーションズ 2027 の毎週の取り込みも一緒に止まっている。

原因（Claude Code が DB と本番のログで確認）:
1. **試合の識別子が変わった**: 5/20 に入れた行の `external_ids.wikipedia_event_id` は `France_v_Japan` のような名前。今の Wikipedia の RWC 2027 のプールのページから読むと、`mwlg`・`mwASA` のような**ページを生成するたびに付く記号**になる。既存の行と照合できず、時刻がずれていた行は新しい行として挿入された（`lib/ingestion/upsert.ts` の `findExistingMatch` は、`wikipedia_event_id` があるのに見つからないと、チームの組み合わせでは探さずに新規とみなす）。
2. **日付と時刻を隣の試合から拾っている**: `parseWikipediaRwc2027Html`（`lib/ingestion/sources/wikipedia-rwc.ts`、PR #924 で追加）は、共通の読み取り処理が返した各試合の `rawHtml` の最初の `<table>` から日付を読む。今のページの作りでは、この `rawHtml` が別の試合の表を含むか、ずれていると見られる。**テストは手で作った古い作りの HTML で通っていた。**
3. **書き込む前に確かめる手段が無かった**: 正しい 36 試合の時刻は spec に持っていたのに、本番に書き込む前に「今のページを読んだ結果」と照合する方法が無かった。「`matches_inserted` が 1 以上なら止まる」は、書き込んだ後にしか分からない条件だった（`feedback_dry_run_before_prod_reingest`）。

シックスネーションズ 2027 は同じ日の取り込みで 15 試合を更新したが、時刻・識別子とも正常だった（識別子は `Ireland_v_England` の形、英国時間 14:10・16:40・20:10・15:10）。壊れたのは RWC のプールのページの読み取りだけ。

## スコープ

対象:
1. RWC 2027 の試合の照合を、Wikipedia の識別子ではなく**チームの組み合わせ**で行う。
2. RWC 2027 の日付と時刻の読み取りを、**今の実際のページ**で正しく動くように直す。
3. 取り込みに**書き込まずに結果だけを返すモード（dry-run）**を足す。
4. RWC 2027 で、想定と違う結果（試合数が 36 でない、新しい行ができる）になるときは**書き込まずに失敗する**。
5. 確認できたら、毎週の取り込みを再開する（実行範囲で別に行う）。

対象外: シックスネーションズ 2027 の読み取り（正常に動いている）、決勝トーナメント（対戦相手が決まってから別に扱う）、ほかの大会の取り込み。

## データモデル変更

なし。

## 変更内容

### 1. RWC 2027 の照合をチームの組み合わせで行う

- RWC 2027 のプール戦では、同じ組み合わせ（ホーム・アウェー）の試合は 1 回しかない。`ingestRwc2027Fixtures` の書き込みでは、`(competition_id, home_team_id, away_team_id)` で既存の行を探す。
- 実装の形は Codex に任せる（`upsertMatches` に照合方法の選択肢を足す、RWC 専用の書き込み関数にする、など）。条件:
  - 同じ組み合わせの行が **2 行以上あったら、書き込まずにエラー**にする（重複を前提に進めない）。
  - 見つかった行は、`kickoff_at`・`venue`・`status` などを更新する。`external_ids.wikipedia_event_id` は上書きしない（記号の識別子を保存しない）。
- **他の大会の照合（`findExistingMatch` の既存の挙動）は変えない。**

### 2. 日付と時刻の読み取りを直す

- 着手前に、`RWC_2027_POOL_PAGE_URLS` の 6 ページを今の状態で取得し、`tests/fixtures/` に保存する（取得日を PR 本文に書く）。**テストはこの保存したページで行う。** 手で作った HTML の fixture は、今のページの作りと合うものだけを残す。
- 今の `parseWikipediaRwc2027Html` で、どの試合にどの日付が付いているかを、保存したページで出して PR 本文に貼る（ずれていることの確認）。原因を特定して直す。
- 会場の時間帯から UTC を計算する処理（PR #924）はそのまま使う。

### 3. dry-run（書き込まずに結果を返す）

- `POST /api/cron/ingest-fixtures` の本文に `"dryRun": true` を受け付ける。dry-run のときは DB に一切書き込まず（`matches`・`match_raw_data`・順位表・大会のチーム・プールすべて）、次を返す:
  - 読み取った試合ごとに: ホーム・アウェーの slug、`kickoff_at`、会場、**予定する操作**（`insert` / `update` / `unchanged`）、更新する場合は既存の行の `id` と変わる項目の前後の値。
  - 合計: 読み取った数、`insert` / `update` / `unchanged` の件数。
- dry-run は RWC 2027 とシックスネーションズ 2027 の両方で使えること。
- 本番での実行方法: `cron-ingest-fixtures.yml` に `workflow_dispatch` の入力 `dry_run`（既定 false）を足し、true のときは両方の呼び出しに `"dryRun": true` を付ける。結果の JSON をジョブのログに出す。

### 4. RWC 2027 の書き込みの安全装置

dry-run でないときも、書き込む前に同じ計算をして、次のどれかに当たったら**何も書き込まずに失敗**する（HTTP 500 と理由。GitHub Actions のジョブも失敗する）。

- 読み取った試合数が 36 でない。
- `insert` が 1 件以上ある（プール戦の 36 試合はすでにすべて DB にある）。
- 同じ組み合わせの行が DB に 2 行以上ある。

### 5. テスト

- 保存した 6 ページから読んだ 36 試合の UTC が、`specs/fix-rwc2027-kickoff-timezones.md` の「正しい日程」の表と**すべて一致**する（既存の fixture `tests/fixtures/rwc2027-kickoffs.json` を正解として使ってよい）。
- 照合: DB に 36 試合がある状態（モック）で、保存したページから取り込むと、`insert` 0・`update` か `unchanged` が 36。
- 安全装置: 試合数が 35 のとき、`insert` が出るとき、同じ組み合わせが 2 行あるとき、それぞれ書き込みの関数が 1 回も呼ばれずにエラーになる。
- dry-run: `dryRun: true` で、書き込みの関数が 1 回も呼ばれず、予定する操作の一覧が返る。

## API サーフェス

`POST /api/cron/ingest-fixtures` の本文に `dryRun?: boolean`（既定 false）を足す。応答に dry-run の結果を足す。既存の項目は変えない。

## UI サーフェス

なし。

## LLM 連携

なし。

## 受け入れ条件

1. 上の「5. テスト」がすべて通る。
2. 「壊して落ちる」確認（コミットしない）: 照合をチームの組み合わせから `wikipedia_event_id` に戻すと、照合のテストで `insert` が出て落ちる。安全装置の `insert` の判定を外すと、安全装置のテストが落ちる。日付の読み取りを PR #924 の時点に戻すと、36 試合の一致のテストが落ちる。出力を PR 本文に貼る。
3. PR 本文に、保存したページで今の（直す前の）読み取りを動かした結果（どの試合にどの日付が付いていたか）と、直した後の結果を貼る。
4. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る（CI の `validate`）。

## 実行範囲（本番操作）

コードの PR とは分ける。マージ・デプロイ後に、Claude Code が次の順で行う。**各段階で結果を Owner に報告し、次に進む承認を得る。**

1. ワークフローを一時的に有効にして（`gh workflow enable`）、**dry-run で実行**する（`gh workflow run cron-ingest-fixtures.yml -f dry_run=true`）。実行後すぐに無効に戻す（毎週の自動実行が先に走らないように）。
2. dry-run の結果を確認する: RWC 2027 は `insert` 0、36 試合の `kickoff_at` が公式の値と一致（変わる項目が無いか、あれば理由が分かるもの）。シックスネーションズ 2027 は `insert` 0。
3. 問題が無ければ、本番の取り込みを 1 回実行し、DB の 36 試合が公式と一致し、行が増えていないことを確かめる。
4. 毎週の取り込みを再開する（`gh workflow enable`）。

## 未解決の質問

- なし。
