# Codex 指示書: 得点イベント汚染の残りを見つけて片付ける仕組みと、定期実行の入口の修正

仕様書: `specs/fix-event-contamination-residue.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## 直したいこと

別の試合の得点イベントがコピーされたまま、6 試合に残っている。原因と対策は次の 3 つ。

1. **検知の穴:** 重複の検知が選手 ID を含む並びで比べているので、選手 ID のある持ち主と、ID が空のコピーを同じ組として拾えない。分と種別だけの並びで比べ、「組の中でスコアと合わない試合」を汚染とする判定を足す。
2. **片付け:** 片付けのスクリプトをこの判定で動くようにする。削除は `--confirm-owner-approved` のときだけにし、削除の前にバックアップを取る。
3. **原因の経路:** 定期実行の入口（`app/api/cron/fill-event-gaps/route.ts`）が、試合のブロックが見つからないときにページ全体を解析に渡している。手動スクリプトと同じ動きに揃え、関数を共通化する。

## 触るファイル

- `lib/data-integrity/contaminated-events.ts`（`buildStructuralEventSignature`、`findStructuralContamination` の追加）
- `lib/data-integrity/audit.ts`（週次監査の報告に追加）
- `scripts/cleanup-contaminated-events.ts`
- 新規 `lib/ingestion/wikipedia-event-block.ts`（`extractEventHtml` と `findEventBlockByTeams` を `scripts/fill-event-gaps.ts` から移す）
- `scripts/fill-event-gaps.ts`（移した関数を import する。動きは変えない）
- `app/api/cron/fill-event-gaps/route.ts`
- 関係するテスト

## 守ること

- **持ち主の試合（イベント合計が自分のスコアと一致する試合）のイベントは、どの判定でも削除しない。**
- 削除は `--confirm-owner-approved` のときだけ行い、削除の前に、対象の試合のイベントを JSON で `tmp/contaminated-events-backup/<ISO 時刻>/` に書き出す。
- 既存の `findContaminatedEventGroups` と `buildEventSignature` は残す。
- 書き込み時の照合（`lib/ingestion/event-integrity.ts`）と、画面の表示（`components/match-events-section.tsx`）は変えない。
- 定期実行の入口に、ページ全体を解析に渡す経路を残さない。

## 処理すべきエッジケース

1. `minute` が null のイベントを含む試合は、構造の並びの比較に入れない。
2. イベントが 8 件未満の試合は、構造の並びの組にしない。
3. 組の全員がスコアと合わない場合は、全員を汚染として返す（持ち主なし）。片付けのスクリプトは、その組を一覧に「持ち主なし」と明記する。
4. スコアが null の試合は、持ち主にも汚染にもしない（判定できないので組から外す）。
5. ペナルティトライは 7 点で数える（既存の数え方に合わせる）。
6. 定期実行の入口で `wikipedia_event_id` が `"mw-content-text"` の場合: 無効な目印として扱い、チーム名と日付で探す（手動スクリプトと同じ）。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）。それぞれの内容と結果を PR 本文に書く。
  - 構造の並びに選手 ID を含めると、受け入れ条件 1 のテストが落ちる。
  - 定期実行の入口で、見つからないときにページ全体を返すと、受け入れ条件 6 のテストが落ちる。
  - 片付けのスクリプトで `owners` も削除の対象にすると、受け入れ条件 5 のテストが落ちる。

## やってはいけないこと

- 片付けのスクリプトを本番で実行すること（dry-run も含めて、実行は Claude Code と Owner が行う）。
- `match_events` への書き込み・削除を伴うコードを、テスト以外で実行すること。
- 部分的に数点ずれている試合（コンバージョンの欠けなど）を汚染として扱うこと。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜8 のそれぞれについて、確認の方法と結果
  - 「壊して落ちた」確認の内容
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
