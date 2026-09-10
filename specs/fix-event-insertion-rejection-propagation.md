# fix-event-insertion-rejection-propagation

> `specs/fix-event-ingestion-identity-guard.md` の **AC8 が未達**である。同 spec は「拒否があった run は失敗として扱う」と定めたが、PR #781 で入ったのはガード本体だけで、呼び出し元の配線が伴っていない。本 spec はその未達分だけを扱う。**ガードの判定ロジックには一切触れない。**

## 背景

2026-09-08 の再レビュー（`docs/audits/gpt6-spec-review-followup-2026-09-08/review.md` R1、P1）で、**書き込みを拒否しても呼び出し元が成功を返す**ことが再現された。

合成した `score_mismatch` 拒否 1 件に対し、`app/api/cron/fill-event-gaps` の route は実際に次を返した。

```
HTTP 200  { errors: [], filled: 1, gaps: 1 }
```

**拒否された試合が「補完済み 1 件」として記録される。** 再現は `docs/audits/gpt6-spec-review-followup-2026-09-08/cron-observation.test.ts`。

書き込みの拒否そのものは効いている。壊れているのは**運用への伝播**である。

### 失敗は 2 種類ある

**(a) `rejected` を一切見ない経路（4 つ）**

| 経路 | 現状 |
|---|---|
| `app/api/cron/fill-event-gaps/route.ts:162` | 戻り値を捨て、無条件で `filled += 1`（`:168`） |
| `app/api/cron/fill-league-one-playoff-events/route.ts:295` | `result.inserted` のみ加算 |
| `lib/ingestion/live-ingest.ts:451` | `upserted.inserted` のみ加算 |
| `lib/ingestion/jrfu-match-event-fallback.ts:293` | `inserted` のみ |

**(a-2) 上の 2 経路を無効化している上位（2026-09-09 追記）**

`live-ingest.ts` と `jrfu-match-event-fallback.ts` で拒否を集約して throw しても、**上位が握りつぶすため運用からは何も変わらない。**

| 経路 | 現状 |
|---|---|
| `lib/ingestion/live-competitions.ts:145` | `Promise.allSettled` で `ingestLiveCompetition()` を呼ぶ |
| `lib/ingestion/live-competitions.ts:150-157` | `rejected` を `console.error` に落とすだけ |
| `lib/ingestion/live-competitions.ts:159-165` | `fulfilled` だけを返す。**拒否は戻り値から消える** |
| `lib/ingestion/live-competitions.ts:171` | JRFU fallback の失敗を catch し、`ingested` だけ返す |
| `app/api/cron/ingest-live-competitions/route.ts:14-20` | resolve しさえすれば常に `status: "ok"` / HTTP 200 |

`allSettled` は reject しないので、この cron は**構造上 500 を返せない**。

**この 2 ファイルを変更対象に加える。** ただし `Promise.allSettled` 自体は残す。1 ソースのネットワーク失敗で他ソースの取り込みを巻き添えにしないための設計であり、スクリプト側と同じ線引き（**取り込み失敗は続行、ガードによる拒否は集約して最後に失敗**）をここでも守る。拒否の理由を戻り値に載せて運び、run の最後に失敗として報告する。

**(b) `assertEventInsertionAccepted` を呼ぶが、throw をループ内 catch が握りつぶす経路**

`assertEventInsertionAccepted` は 10 本のスクリプトから呼ばれている。うち **5 本**が、投げた例外を同じループの `catch` で受けてログに変え、次の試合へ進む。

| ファイル | assert | 握りつぶす catch | catch の中身 |
|---|---|---|---|
| `scripts/fill-event-gaps.ts` | :414 | :450 | `console.warn` |
| `scripts/backfill-top14-match-events.ts` | :328 | :334 | `console.warn` |
| `scripts/backfill-premiership-match-events.ts` | :267 | :273 | `console.warn` |
| `scripts/backfill-urc-match-events.ts` | :303 | :309 | `skipped += 1` / `console.warn` |
| `scripts/import-world-rugby-full.ts` | :563 | :620 | `failedMatches += 1` / `console.error` |

**最外の `main().catch(... exit(1))` に届かないため、スクリプトは終了コード 0 で終わる。**

後ろ 2 本は件数を数えてはいるが、`skipped`（`backfill-urc-match-events.ts:316`）も `failedMatches`（`import-world-rugby-full.ts:630`）も**ログに出すだけで終了コードに反映されない**。「数えているから気づける」ことにはなっていない。

残る 5 本（`backfill-match-events.ts:206` / `import-league-one-full.ts:401` / `backfill-nations-championship-match-events.ts:259` / `backfill-club-match-details.ts:346` / `backfill-rwc-match-events.ts:237`）は assert の後に握りつぶす catch が無く、例外が最外まで伝播する。**これらは変更対象ではない。**

### なぜ見逃したか

PR #781 のレビューで、私は `upsertMatchEvents` の単体テストと判定ロジックを確認した。**呼び出し元 13 箇所が戻り値をどう扱うかは見ていない。** 関数の単体テストだけでは全経路の対応を判定できない。

**2026-09-09 追記（同じ誤りの 2 回目）**: 本 spec の初版は呼び出し元 13 箇所を列挙したが、**その呼び出し元の呼び出し元を見ていなかった**。(a) の 4 経路のうち 2 つが `live-competitions.ts` の `allSettled` で行き止まりになることに気づかず、Codex が実装を止めて指摘した。**「拒否を throw する」だけでは足りず、throw が最外の観測点（cron のレスポンス / 終了コード）に届くまで経路を追い切ること。** 1 段上で握りつぶされていれば、修正は何も変えない。

## スコープ

対象:
- 上記 (a) の 4 経路が `rejected` を評価する
- 上記 (a-2) の `lib/ingestion/live-competitions.ts` と `app/api/cron/ingest-live-competitions/route.ts` が、拒否を運んで run の失敗として報告する
- 上記 (b) のスクリプトで、拒否由来の失敗が最外まで伝播する
- 成功カウンタが拒否された試合を数えない
- 拒否の内容（match_id と理由）が運用に見える形で出る
- テスト

対象外:
- **V1〜V4 の判定ロジック**（`lib/ingestion/event-integrity.ts`）。**触らない**
- **`upsertMatchEvents` の戻り値の型**。既に `{ inserted, rejected, warnings }` で、変更しない
- **`warnings`（V3）の扱い**。警告は run を失敗にしない。**警告と拒否を同じ扱いにしないこと**
- スナップショットキャッシュの再取得（再レビュー R2。別 spec）
- 既存データの修復
- DB への `UPDATE` / `INSERT` / マイグレーション

## データモデル変更

なし。

## API サーフェス

`app/api/cron/fill-event-gaps` と `app/api/cron/fill-league-one-playoff-events` のレスポンス。**拒否があった run が成功に見えないこと**が要件で、具体的な形（HTTP ステータスか本文のフィールドか）は既存の cron 群に合わせる。

`specs/fix-refresh-workflow-scale-and-failure-visibility.md`（PR #758）が採った「失敗を終了コードへ反映する」方針と揃えること。**GitHub Actions が success を返してしまう問題を再生産しない。**

## UI サーフェス

なし。

## LLM 連携

なし。コスト $0。

## 変更詳細

### 1. `rejected` を見ていない 4 経路

戻り値の `rejected` が非空なら、その試合を**成功として数えない**。

- 試合ごとの続行は残してよい（1 件の拒否で run 全体を止めない）
- ただし **run の最後に拒否を集約し、run 自体を失敗として報告する**
- 拒否した match_id と `reason` を出す。**件数だけにしない**（週次監査の通知が件数のみで 2026-08-17 から埋もれた前例がある）

### 2. スクリプトの catch

ループ内の `catch` が拒否由来の例外を握りつぶさないようにする。

**取り込みの失敗（ネットワーク・パース）と、ガードによる拒否を区別すること。** 前者は従来どおり警告して次へ進んでよい。後者は集約して最後に非ゼロ終了する。

握りつぶしを単純に外すと、1 件の一時エラーで run 全体が止まる。**そこは変えない。**

### 2-a. `live-competitions.ts` と cron route

`Promise.allSettled` は**残す**。1 ソースの失敗で他ソースを巻き添えにしないための設計である。

変えるのは、拒否を戻り値から消さずに運ぶ点と、run の最後に失敗として報告する点の 2 つ。`ingestAllLiveCompetitions()` の戻り値の形は既存の呼び出し元（cron route と 2 本のテスト）に合わせて決めてよいが、**`status: "ok"` が拒否のある run で返らないこと**が要件。

**取り込み失敗（ネットワーク・パース）は従来どおり `console.error` で続行し、run を失敗にしない。** 失敗にするのはガードによる拒否だけ。

### 3. 通知

`lib/llm/notify.ts` の既存パターンで、拒否があったことを match_id と `https://www.trylinerugby.com/matches/<id>` 付きで出す。**新しい通知系を作らない。**

## 受け入れ条件

**テスト実行の条件**: `tests/ingestion/` は `vitest.config.ts:16` の `exclude` に一部該当する（`events.test.ts` / `standings.test.ts` / `upsert.test.ts`）。**新規テストはこれらに該当しない場所に置くこと。** 結果を PR 本文に貼る。

1. **回帰テスト（必須）**: `score_mismatch` 拒否 1 件を返すモックで `app/api/cron/fill-event-gaps` を呼び、**`filled` が 0 であること、拒否された match_id と理由がレスポンスに含まれること、run が失敗と分かること**を検証する。`docs/audits/gpt6-spec-review-followup-2026-09-08/cron-observation.test.ts` が現在の誤った挙動を再現しているので、**期待値を正しい動作へ書き換えて回帰テストにする**
2. `app/api/cron/fill-league-one-playoff-events` で同じことを検証するテストがある
3. `lib/ingestion/live-ingest.ts` が拒否を集約し、`inserted` だけを見ていないことを検証するテストがある
4. `lib/ingestion/jrfu-match-event-fallback.ts` で同じことを検証するテストがある
4-a. **`ingestAllLiveCompetitions()` が、1 ソースの拒否を戻り値から消さずに運ぶ**ことを検証するテストがある（`tests/ingestion/live-competitions-jrfu-fallback.test.ts`。exclude 非該当）
4-b. **`app/api/cron/ingest-live-competitions` が、拒否のあった run で `status: "ok"` を返さない**ことを検証するテストがある（`tests/api/ingest-live-competitions.test.ts`。exclude 非該当）
4-c. **1 ソースのネットワーク失敗では他ソースの取り込みが続行し、run は成功のまま**であることを検証するテストがある。`Promise.allSettled` を外していないことの証拠
5. ~~**`scripts/fill-event-gaps.ts` で、拒否由来の例外がループ内 catch に握りつぶされず、最外まで伝播する**ことを検証するテストがある~~

    **2026-09-10 に上書きされた。`specs/fix-event-rejection-aggregation-and-ci-coverage.md` を参照すること。**

    本 spec は変更詳細 2 で「拒否は**集約して最後に非ゼロ終了する**」と書きながら、この AC5 で「例外が**最外まで伝播する**」と書いていた。**両立しない。** 例外を伝播させればループは止まり、集約は成らない。PR #793 は AC5 を実装し、結果として**最初の拒否で残りの試合が処理されなくなった**（GPT-6 再監査 N4）。Owner 判断で「集約して続行」を採る。**この AC5 をそのまま実装しないこと。**

    **検証方法を指定する（2026-09-09 追記）**: `main()`（またはループを含む関数）を実際に走らせ、`upsertMatchEvents` をモックして `rejected` を返させたうえで、exit 1 に到達することを検証する。**CLI ラッパーに throw する関数を直接渡すテストは、この条件を満たさない。** ループ内 catch を一度も通らないため、握りつぶしの有無を測れない。PR #793 はこの形のテストを書いたことで、`backfill-urc-match-events.ts` の未修正を CI green のまま通した。
6. `backfill-top14-match-events.ts` / `backfill-premiership-match-events.ts` / `backfill-urc-match-events.ts` / `import-world-rugby-full.ts` で同じことを検証するテストがある。**後ろ 2 本は `skipped` / `failedMatches` を数えるだけで終了コードに反映していないので、「件数が増えること」ではなく「終了コードが非ゼロになること」を検証する**
7. **取り込みの失敗（ネットワーク・パース）は従来どおり警告して次の試合へ進む**ことを検証するテストがある。**拒否と混同していないことの証拠**
8. **`warnings`（V3）だけが出た run は成功のままである**ことを検証するテストがある。警告を失敗に格上げしていない
9. 拒否の通知に match_id と試合 URL が含まれる
10. **`lib/ingestion/event-integrity.ts` に差分が無い**
11. `lib/ingestion/events.ts` の**判定ロジックと `upsertMatchEvents` の戻り値の型**に差分が無い

    **2026-09-09 緩和**: 初版は「`events.ts` に差分が無い」と読める書き方だった。その制約下で PR #793 は `error.message.startsWith("Event insertion rejected:")` という**文言への文字列一致**で拒否由来かを判別せざるを得なくなった。文言を変えた瞬間に静かに exit 0 へ戻る構造で、本 spec が防ごうとしている失敗そのものである。**拒否由来であることを型で判別できる Error サブクラスを `events.ts` に追加してよい。** 変えてはいけないのは判定ロジックと戻り値の型の 2 つだけ。
12. **DB への `UPDATE` / `INSERT` / マイグレーションが差分に含まれない**
13. LLM 呼び出しが差分に含まれない
14. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**PR 本文に `upsertMatchEvents` の呼び出し元 13 箇所を列挙し、それぞれが `rejected` をどう扱うかを書くこと。** grep の件数一致を網羅性の証拠にしない。

13 箇所は `app/api/cron/fill-league-one-playoff-events/route.ts:287` / `app/api/cron/fill-event-gaps/route.ts:162` / `lib/ingestion/jrfu-match-event-fallback.ts:293` / `lib/ingestion/live-ingest.ts:451` / `scripts/backfill-match-events.ts:200` / `scripts/backfill-top14-match-events.ts:322` / `scripts/backfill-urc-match-events.ts:297` / `scripts/backfill-club-match-details.ts:340` / `scripts/fill-event-gaps.ts:408` / `scripts/import-league-one-full.ts:395` / `scripts/import-world-rugby-full.ts:557` / `scripts/backfill-premiership-match-events.ts:261` / `scripts/backfill-rwc-match-events.ts:231`（2026-09-09 実測）。

**14 本目に見える経路が 1 つある。** `scripts/backfill-nations-championship-match-events.ts` は `upsertMatchEvents` を直接呼ばず、DI 経由（`:56` の `upsertEvents?: typeof upsertMatchEvents`、既定値は `:189`）で同じ関数を呼ぶ。grep には出ないが実行時は同じ経路なので、**この 1 本も評価対象に含めること。**

## 未解決の質問

なし。

**本 spec で解決しないと明示するもの**:

- **スナップショットキャッシュが一時的な DB 障害をプロセス寿命まで保持する問題は直らない**（再レビュー R2）。別 spec
- **拒否が出た試合のデータは修復されない。** 本 spec は「気づけるようにする」ところまでで、正しいイベントの再取得は Owner の判断
- **これは AC8 の未達を埋める作業であって、新しい防御ではない。** 「ガードを強化した」と報告しないこと
