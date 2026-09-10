# プレビュー生成を「JST キックオフ前日 15:00」に一本化する

## 背景

プレビューの生成タイミングが2系統に分かれており、どちらも Owner の意図（メンバー発表を反映した記事を試合前日に出す）と一致していない。

**系統1: 初回生成（`lib/cron/orchestrate.ts`）**

`cron-live-pipeline.yml` が6時間ごと（JST 03/09/15/21）に `orchestrate` を叩く。プレビューの対象は **キックオフの 12〜48 時間前**（`PREVIEW_WINDOW_START_HOURS = 12` / `PREVIEW_WINDOW_END_HOURS = 48`、`lib/cron/orchestrate.ts:6-7`）。`EXISTING_CONTENT_STATUSES = ["draft","published"]`（同 `:5`）で既存コンテンツのある試合を除外するため、**48時間前の窓に入った最初の回で作られ、以後この経路では作り直されない。**

**系統2: リフレッシュ（`.github/workflows/cron-weekend-preview-refresh.yml`）**

木 21:05 JST（`5 12 * * 4`、当日〜+2日＝木金土）と金 21:05 JST（`5 12 * * 5`、翌日〜+2日＝土日）の2本。`fetch-sourced-facts?force=true` → `generate-content` を試合ごとに叩いて上書きする。

**この構造には確認済みの穴がある。**

| 問題 | 内容 |
|---|---|
| 水曜キックオフ | 木・金どちらの窓にも入らず、リフレッシュが **0回**。初回生成の facts のまま出る |
| 日曜キックオフ | 金 21:05 の **1回きり**。失敗するとリカバリが無い |
| 初回生成が早すぎる | 最大48時間前。多くの協会のメンバー発表（24〜48時間前）より前に確定する |
| 木曜21:05と金曜21:05の二重生成 | 土曜キックオフは2回生成され、LLM コストが2倍かかる |

**Owner の決定（2026-09-10）**: 記事が世に出る時刻も含めて**前日 15:00 JST に一本化する**。それより前にはプレビューが存在しない状態を許容する。代償として、土曜キックオフの公開は現状の木 21:05 から金 15:00 へ約18時間後ろ倒しになる。

## スコープ

対象:

- `lib/cron/orchestrate.ts` のプレビュー対象選定を、「キックオフの N 時間前」から「**JST キックオフ日の前日 15:00 に到達済み**」に置き換える
- `.github/workflows/cron-weekend-preview-refresh.yml` から `schedule:` を削除し、`workflow_dispatch` 専用の復旧ツールとして残す
- `app/api/cron/audit-prekickoff-readiness/route.ts` の `AUDIT_WINDOW_HOURS = 36` を、上と同じ「生成期限に到達済み」の判定に置き換える
- `.github/workflows/cron-prekickoff-readiness-audit.yml` のコメント（`Thu/Fri 21:05 JST preview refresh` への言及）を実態に合わせる
- **ラインアップ遅延の救済**として、`GET /api/cron/matches-with-late-lineups`（新規）と `.github/workflows/cron-preview-lineup-catchup.yml`（新規、毎日 21:05 JST）を追加する

対象外:

- `cron-live-pipeline.yml` のスケジュール（JST 03/09/15/21 の4回はそのまま。15:00 の回が既に存在する）
- recap 側の生成・リフレッシュ（`cron-post-match-recap-refresh.yml` の月 09:05 / 火 09:05 は無変更）
- `PREVIEW_WINDOW_START_HOURS` に相当する「キックオフ直前は生成しない」下限を新たに設けること（下記「下限を置かない理由」参照）
- 大会ごとに異なる生成時刻を設定する仕組み
- ChatGPT 調査プロンプトの改訂（`docs/chatgpt-prompts/` は Owner 側で同時に更新済み。実装は不要）

## データモデル変更

なし。

## API サーフェス

**新規 GET エンドポイントを1本追加する。**

| ルート | メソッド | 用途 |
|---|---|---|
| `/api/cron/matches-with-late-lineups` | `GET` | ラインアップが記事より後に届き、まだキックオフ前の試合の `match_id` を返す |

認証は既存の cron ルートと同じ `assertCronAuthorized`（`lib/cron/auth.ts`）。**未認証は 401。**

リクエストのクエリパラメータは無し。レスポンスは `app/api/cron/matches-with-recent-manual-facts/route.ts` と同一の形にする。

```json
{ "count": 0, "match_ids": [], "truncated": false }
```

| フィールド | 型 | 内容 |
|---|---|---|
| `count` | `number` | `match_ids` の件数（切り詰め後） |
| `match_ids` | `string[]` | 対象試合の UUID。`kickoff_at` の**昇順** |
| `truncated` | `boolean` | `MAX_LATE_LINEUP_MATCHES = 30` を超えて切り詰めたか |

失敗時は `{ "error": string }` と 500。**対象条件と実装方法は「ラインアップ遅延の救済」節を参照すること。**

**既存ルートの変更**: `POST /api/cron/orchestrate` と `POST /api/cron/audit-prekickoff-readiness` は、**対象試合の選び方だけ**が変わる。リクエスト・レスポンス形式は変えない。

## 判定ロジック（この定義に従って実装すること）

**JST は夏時間を持たないため、固定オフセット +9 時間で計算してよい。** `Intl` を使う必要はない。

新規ファイル `lib/cron/preview-window.ts` に次の関数を置く。

```ts
const PREVIEW_RELEASE_HOUR_JST = 15;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * 「JST キックオフ日の前日 15:00」に到達している試合の kickoff_at 上限を ISO 文字列で返す。
 * この値以下の kickoff_at を持つ試合が、その時点で生成期限に達している。
 */
export function previewDueUpperBound(now: Date): string {
  // now を JST の壁時計に移す（UTC の getter で JST の年月日時が読める状態にする）
  const jst = new Date(now.getTime() + JST_OFFSET_MS);

  // 直近に過ぎた JST 15:00
  const todayReleaseJst = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate(),
    PREVIEW_RELEASE_HOUR_JST,
    0,
    0,
    0,
  );
  const lastReleaseJst =
    jst.getUTCHours() < PREVIEW_RELEASE_HOUR_JST
      ? todayReleaseJst - 24 * HOUR_MS
      : todayReleaseJst;

  // その 15:00 が担当する JST キックオフ日は「翌日」。その日の終わり = +33 時間
  return new Date(lastReleaseJst + 33 * HOUR_MS - JST_OFFSET_MS).toISOString();
}
```

`orchestrate` のプレビュー候補取得は次の2条件になる。

```ts
kickoffGte: now.toISOString(),
kickoffLte: previewDueUpperBound(now),
```

**検算（この4件をユニットテストにすること）**

| `now`（UTC） | `now`（JST） | `previewDueUpperBound` の戻り値（UTC） | 意味（対象になる JST キックオフ日） |
|---|---|---|---|
| `2026-09-11T06:00:00.000Z` | 09-11 15:00 | `2026-09-12T15:00:00.000Z` | 今日 09-11 と明日 09-12 |
| `2026-09-11T05:00:00.000Z` | 09-11 14:00 | `2026-09-11T15:00:00.000Z` | 今日 09-11 まで（明日はまだ期限前） |
| `2026-09-11T12:00:00.000Z` | 09-11 21:00 | `2026-09-12T15:00:00.000Z` | 15:00 の回と同じ（＝21:00 の回はリトライ枠） |
| `2026-09-11T18:00:00.000Z` | 09-12 03:00 | `2026-09-12T15:00:00.000Z` | 09-12 まで（15:00 前なので上限は動かない） |

**この表の「意味」列は、`kickoff_at <= 戻り値` かつ `kickoff_at >= now` を満たす範囲を JST の暦日で言い換えたものである。** テストは戻り値の ISO 文字列を直接アサートすること。

**なぜ「N 時間前」では書けないか。** 前日 15:00 はキックオフ時刻によって「何時間前」かが変わる。JST 20:00 キックオフなら 29 時間前、JST 03:00 キックオフなら 12 時間前になる。単一の固定時間窓では両立しない。**JST の暦日で判定する以外に方法が無い。**

## 下限を置かない理由

`PREVIEW_WINDOW_START_HOURS = 12` は削除し、下限は `kickoff_at >= now` のみにする。

- GitHub Actions の cron は実測で1〜10時間遅れる。前日 15:00 を狙った回が翌日未明にずれ込むことがあり、12時間の下限があると **深夜キックオフの試合が恒久的に生成対象から外れる**
- 生成済みの試合は `EXISTING_CONTENT_STATUSES` で除外されるため、下限を外しても二重生成は起きない
- 下限を外すことで、前日 15:00 の回が失敗した試合を **当日 21:00 / 03:00 / 09:00 / 15:00 の回が自動で拾う**（自己修復）

**対象試合数は増えない。** 旧窓は最大48時間先まで拾っていたが、新しい上限は最大でも33時間先（前日15:00 の回から見た翌日23:59）である。近い側が 12h→0h に広がる分を、遠い側が 48h→33h に狭まる分が上回る。

## リフレッシュ workflow の扱い

`cron-weekend-preview-refresh.yml` の `schedule:` ブロックを**削除**し、`workflow_dispatch:`（`from` / `to` 入力）だけを残す。ジョブの中身（`resolve-targets` / `refresh` / `summarize`、`force=true` の付与、失敗の終了コード反映）は**一切変更しない**。

**削除する理由**: 生成が前日 15:00 の1回になり、その時点の facts が最新なので、定期的な上書き生成の根拠が消える。木 21:05 と金 21:05 の両方に入る土曜キックオフの二重生成も同時に無くなる。

**残す理由**: 締切（前日 14:30）を過ぎて**事実**を入れた場合の復旧手段。`schedule` を消しても `workflow_dispatch` から `from` / `to` を指定して再生成できる。

**ラインアップが前日 15:00 に間に合わなかった場合は、次節の自動救済が拾う。** 手動起動は事実の入力漏れ用である。

**`name:` を `Cron — Weekend Preview Refresh` から `Manual — Preview Regeneration` に変更すること。** 定期実行しないものが `Cron —` を名乗っていると、次に読む人が誤解する。**ファイル名は変えない**（既存 spec・codex-prompt からの参照が10箇所以上あり、リンク切れのコストのほうが高い）。

## ラインアップ遅延の救済（毎日 21:05 JST）

**前日 15:00 の生成に先発が間に合わなかった試合を、その日の 21:05 に一度だけ拾い直す。**

### なぜ要るか

生成が1回きりになると、**前日 15:00 より後に発表・取り込みされたラインアップは永久に記事へ入らない。** 旧設計には金 21:05 のリフレッシュという第2の機会があったが、本 spec の変更でそれが消える。

**2026-09-10 の本番実測では、この救済が発火するケースは0件だった。** キックオフ前にラインアップを取り込めた試合6件はすべて前日 15:00 に間に合っており（最小マージン4.8時間）、「ラインアップが記事より後に届き、かつキックオフ前」に該当する試合は `created_at` 基準でも `updated_at` 基準でも0件。

**それでも入れるのは、実績のある大会が League One とテストマッチの2系統しかないためである。** 9/25 に URC・プレミアシップ・Top 14 が開幕し、週230試合が加わる。**この3大会の発表習慣と Wikipedia 側の更新速度には実績がまったく無い。** 対象0件なら LLM を1回も呼ばない構造なので、外れたときのコストはゼロに近い。

### `created_at` は使えない

**ラインアップの書き込みは2経路とも `onConflict: "match_id,team_id,jersey_number"` の upsert である**（`lib/ingestion/league-one-lineups.ts:249-251`、`app/api/cron/ingest-lineups/route.ts:277-281`）。**背番号が同じまま選手が入れ替わると既存行が UPDATE され、`created_at` は動かない。** 判定には `updated_at` を含めること。

`updated_at` は実際に維持されている（本番実測: 19,362行中13,593行が `updated_at > created_at`、296試合）。

**空打ちで `updated_at` が増える経路は無い。** `cron-ingest-league-one-lineups.yml` は `workflow_dispatch` 専用でスケジュールを持たず、既にラインアップがある試合は `skipped_existing` で飛ばす（`lib/ingestion/league-one-lineups.ts:288-291`）。`orchestrate` のプレビュー分岐は既存コンテンツのある試合を除外するので、生成後に再取り込みされない。

### 新規エンドポイント `GET /api/cron/matches-with-late-lineups`

**`app/api/cron/matches-with-recent-manual-facts/route.ts` を参照実装とすること。** 認証（`assertCronAuthorized`）・エラー処理・レスポンス形式を揃える。

レスポンスは同じ形にする。

```json
{ "count": 0, "match_ids": [], "truncated": false }
```

対象条件は次の4つすべてを満たす試合。

1. `matches.status = 'scheduled'` かつ `kickoff_at > now()`
2. `kickoff_at <= previewDueUpperBound(now)` — **既に生成期限を過ぎた試合に限る。** この条件が対象集合の上限を与える
3. `match_content` に `content_type = 'preview'` / `language = 'ja'` / `status in ('draft','published')` の行が存在する
4. その試合の `match_lineups` について `max(greatest(created_at, updated_at)) > match_content.generated_at`

**supabase-js では条件4を1クエリで書けない。** 参照実装と同じく2クエリ＋JS 側の突き合わせにすること。

1. `match_content` を `matches!inner` と結合し、条件1〜3で絞って `(match_id, generated_at)` を得る
2. その `match_id` 群で `match_lineups` から `(match_id, created_at, updated_at)` を取り、`Map` で試合ごとの最大値を作って条件4を判定する

上限は `MAX_LATE_LINEUP_MATCHES = 30`。超えたら `kickoff_at` の昇順（キックオフが近い順）で30件に切り、`truncated: true` を返す。**参照実装は降順だが、こちらは締切が迫っている試合を優先するため昇順にする。**

### 新規ワークフロー `.github/workflows/cron-preview-lineup-catchup.yml`

- `schedule: "5 12 * * *"`（**毎日 21:05 JST**）＋ `workflow_dispatch`
- `GET /api/cron/matches-with-late-lineups` を叩き、`count` が 0 なら**後続ジョブを起動しない**
- 対象があれば試合ごとに `POST /api/cron/fetch-sourced-facts?match_id=<id>&content_type=preview&force=true` → `POST /api/cron/generate-content`（body: `{"contentType":"preview","matchIds":["<id>"],"language":"ja"}`）
- 失敗件数を終了コードに反映する（PR #758 と同じ方針）

**`cron-post-match-recap-refresh.yml` の火曜分岐が、まさに「エンドポイントで対象を取り、0件なら何もしない」形になっている。その構造をそのまま踏襲すること。** 新しい形を発明しないこと。

**21:05 にする理由**: 21:00 JST の `orchestrate` 回（前日 15:00 に失敗した試合を拾うリトライ枠）の直後に置き、その回で生成されたものを二重に処理しないため。`orchestrate` は `ingestLineups` → `generateContent` の順で走るので `generated_at > updated_at` になり、条件4を満たさない。

## pre-kickoff 監査の追随

`app/api/cron/audit-prekickoff-readiness/route.ts:17` の `AUDIT_WINDOW_HOURS = 36` を削除し、上限に `previewDueUpperBound(now)` を使う。下限は現行どおり `now`。

**理由**: 36時間の固定窓のままだと、**まだ生成期限に達していない試合を「プレビュー欠落」として Discord に通知してしまう。** 新しい設計では最大リードタイムが33時間になるため、36時間窓は必ず期限前の試合を含む。

監査の実行時刻（毎日 22:05 JST）は**変更しない**。前日 15:00 の回と 21:00 のリトライ回の両方が済んだ後に走るため、時刻としては引き続き妥当。`.github/workflows/cron-prekickoff-readiness-audit.yml` のコメント `# 22:05 JST: one hour after the Thu/Fri 21:05 JST preview refresh.` は実態と合わなくなるので、`# 22:05 JST: after the 15:00 JST generation and the 21:00 JST retry run.` に書き換えること。

## 受け入れ条件

1. `lib/cron/preview-window.ts` に `previewDueUpperBound(now: Date): string` が存在し、上の「検算」表の4件すべてで期待値どおりの ISO 文字列を返すユニットテストがある
2. `lib/cron/orchestrate.ts` から `PREVIEW_WINDOW_START_HOURS` と `PREVIEW_WINDOW_END_HOURS` が削除されている（`grep -n "PREVIEW_WINDOW" lib/cron/orchestrate.ts` が0件）
3. `runOrchestrate` のプレビュー候補取得が `kickoffGte: now.toISOString()` / `kickoffLte: previewDueUpperBound(now)` になっている
4. `tests/cron/orchestrate.test.ts` に次の3ケースが追加され、パスする。**いずれも `now` を明示的に渡して判定すること**
   - `now` = JST 前日 14:00 のとき、翌日キックオフの試合が `previews.triggered` に**含まれない**（`generateContent` がその match_id で呼ばれていないことをモックの呼び出し引数で確認する）
   - `now` = JST 前日 15:00 のとき、翌日キックオフの試合が `previews.triggered` に**含まれる**
   - `now` = キックオフの6時間前（下限撤廃の確認）のとき、その試合が**含まれる**
5. `RECAP_BATCH_SIZE`・recap 側の候補取得・`EXISTING_CONTENT_STATUSES` に差分が無い（`git diff` で確認できること）
6. `.github/workflows/cron-weekend-preview-refresh.yml` に `schedule:` ブロックが存在しない（`grep -n "schedule:" .github/workflows/cron-weekend-preview-refresh.yml` が0件）。`workflow_dispatch` の `from` / `to` 入力と、`resolve-targets` / `refresh` / `summarize` の3ジョブは残っている
7. 同ファイルの `name:` が `Manual — Preview Regeneration` になっている。**ファイル名は `cron-weekend-preview-refresh.yml` のまま**
8. 同ファイルの `resolve-targets` から、`github.event.schedule` による分岐（`5 12 * * 4` / `5 12 * * 5` の判定）が削除され、`workflow_dispatch` 以外のイベントで起動した場合は `exit 1` する。**`from` / `to` が未指定のまま全試合を対象にする経路が残っていないこと**
9. `app/api/cron/audit-prekickoff-readiness/route.ts` から `AUDIT_WINDOW_HOURS` が削除され、上限が `previewDueUpperBound(now)` になっている
10. `.github/workflows/cron-prekickoff-readiness-audit.yml` のコメントが上記の文言に書き換わっている。**`schedule:` の cron 式（`5 13 * * *`）は変更しない**
11. `.github/workflows/cron-live-pipeline.yml` と `.github/workflows/cron-post-match-recap-refresh.yml` に差分が無い
12. `GET /api/cron/matches-with-late-lineups` が存在し、`{ count, match_ids, truncated }` を返す。`assertCronAuthorized` を通らないリクエストに 401 を返す
13. 同エンドポイントに次の4ケースのユニットテストがあり、パスする
    - ラインアップの `updated_at` が `generated_at` より**後**の試合が `match_ids` に**含まれる**
    - ラインアップの `created_at` は古いが `updated_at` が `generated_at` より後の試合が**含まれる**（**`created_at` だけを見ていないことの確認。upsert で選手が入れ替わるケース**）
    - `generated_at` のほうが後の試合が**含まれない**
    - preview コンテンツがまだ無い試合が**含まれない**
14. 同エンドポイントが `kickoff_at <= previewDueUpperBound(now)` で上限を絞っている（`orchestrate` と同じ関数を使うこと。**別途 33 などの数値をハードコードしないこと**）
15. `MAX_LATE_LINEUP_MATCHES = 30` を超えたとき、`kickoff_at` **昇順**で30件に切り `truncated: true` を返すテストがある
16. `.github/workflows/cron-preview-lineup-catchup.yml` が存在し、`schedule` が `5 12 * * *` の1本だけで、`workflow_dispatch` を持つ
17. 同ワークフローが `count == 0` のとき **`fetch-sourced-facts` も `generate-content` も1回も呼ばない**（`if:` 条件でジョブ自体をスキップすること。ループ内で握りつぶす形にしないこと）
18. 同ワークフローが失敗件数を終了コードに反映する
19. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 検証（PR 本文に書くこと）

- 受け入れ条件4の3ケースについて、**テストが落ちることを一度確認してから**実装を入れたか（RED → GREEN）
- 受け入れ条件2・6の `grep` の実行結果をそのまま貼ること
- `previewDueUpperBound` の検算表4件について、**実際にテストを走らせた出力**を貼ること。期待値を手で書き写すだけにしないこと
- 受け入れ条件13の2件目（`created_at` は古いが `updated_at` が新しい）について、**そのテストが `created_at` だけを見る実装では落ちること**を確認した記録。**この1件が本節で一番壊れやすい**
- 受け入れ条件17について、`count: 0` を返すモックでワークフローのジョブがスキップされることをどう確認したか

## デプロイ後に Owner が確認すること（実装者の作業ではない）

- 最初の 15:00 JST の回で、翌日キックオフの試合のプレビューが実際に生成されること
- 22:05 JST の pre-kickoff 監査が、**まだ期限前の試合を欠落として通知していない**こと
- 木曜 21:05 / 金曜 21:05 に `cron-weekend-preview-refresh` が起動しなくなっていること（GitHub Actions の実行履歴で確認）
- `cron-preview-lineup-catchup` が毎日 21:05 に起動し、**`count: 0` で後続ジョブをスキップしている**こと。**発火した場合は、その試合のラインアップが実際に前日 15:00 より後に届いていたかを DB で確認する**（誤発火なら判定条件が緩すぎる）

## 未解決の質問

- **プレビュー候補に件数上限が無い**（recap には `RECAP_BATCH_SIZE = 10` がある）。9/25 に URC 144試合とプレミアシップ90試合が開幕すると、1回の `orchestrate` が数十試合を並列に処理しうる。本 spec は対象範囲を広げないため新たな問題は作らないが、**開幕後に1回あたりの `previews.triggered` を実測し、上限が要るかを別途判断すること**
- **ラインアップ救済の発火実績が0件のまま数ヶ月続いたら、このワークフローは削除してよい。** 2026-09-10 時点で入れるのは、URC・プレミアシップ・Top 14 の発表習慣に実績が無いためであり、実績が出たら判断し直す
- **JST 火曜・水曜キックオフの ChatGPT 調査枠が無い**（実測で 9/5〜12/31 に火1件・水0件）。生成自体は毎日走るので自動では出るが、手動の事実は入らない。件数が増えたら調査枠の追加を検討する
