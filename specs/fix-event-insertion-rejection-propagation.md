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
| `app/api/cron/fill-event-gaps/route.ts:162` | 戻り値を捨て、無条件で `filled += 1` |
| `app/api/cron/fill-league-one-playoff-events/route.ts:295` | `result.inserted` のみ加算 |
| `lib/ingestion/live-ingest.ts:451` | `upserted.inserted` のみ加算 |
| `lib/ingestion/jrfu-match-event-fallback.ts:293` | `inserted` のみ |

**(b) `assertEventInsertionAccepted` を呼ぶが、throw をループ内 catch が握りつぶす経路**

`assertEventInsertionAccepted` は 10 本のスクリプトから呼ばれている。しかし少なくとも次の 3 本は、投げた例外を同じループの `catch` が `console.warn` に変えて次の試合へ進む。

| ファイル | assert | 握りつぶす catch |
|---|---|---|
| `scripts/fill-event-gaps.ts` | :414 | :449 |
| `scripts/backfill-top14-match-events.ts` | :328 | :334 |
| `scripts/backfill-premiership-match-events.ts` | :267 | :273 |

**最外の `main().catch(... exit(1))` に届かないため、スクリプトは終了コード 0 で終わる。**

### なぜ見逃したか

PR #781 のレビューで、私は `upsertMatchEvents` の単体テストと判定ロジックを確認した。**呼び出し元 13 箇所が戻り値をどう扱うかは見ていない。** 関数の単体テストだけでは全経路の対応を判定できない。

## スコープ

対象:
- 上記 (a) の 4 経路が `rejected` を評価する
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

### 3. 通知

`lib/llm/notify.ts` の既存パターンで、拒否があったことを match_id と `https://www.trylinerugby.com/matches/<id>` 付きで出す。**新しい通知系を作らない。**

## 受け入れ条件

**テスト実行の条件**: `tests/ingestion/` は `vitest.config.ts:16` の `exclude` に一部該当する（`events.test.ts` / `standings.test.ts` / `upsert.test.ts`）。**新規テストはこれらに該当しない場所に置くこと。** 結果を PR 本文に貼る。

1. **回帰テスト（必須）**: `score_mismatch` 拒否 1 件を返すモックで `app/api/cron/fill-event-gaps` を呼び、**`filled` が 0 であること、拒否された match_id と理由がレスポンスに含まれること、run が失敗と分かること**を検証する。`docs/audits/gpt6-spec-review-followup-2026-09-08/cron-observation.test.ts` が現在の誤った挙動を再現しているので、**期待値を正しい動作へ書き換えて回帰テストにする**
2. `app/api/cron/fill-league-one-playoff-events` で同じことを検証するテストがある
3. `lib/ingestion/live-ingest.ts` が拒否を集約し、`inserted` だけを見ていないことを検証するテストがある
4. `lib/ingestion/jrfu-match-event-fallback.ts` で同じことを検証するテストがある
5. **`scripts/fill-event-gaps.ts` で、拒否由来の例外がループ内 catch に握りつぶされず、最外まで伝播する**ことを検証するテストがある
6. `backfill-top14-match-events.ts` と `backfill-premiership-match-events.ts` で同じことを検証するテストがある
7. **取り込みの失敗（ネットワーク・パース）は従来どおり警告して次の試合へ進む**ことを検証するテストがある。**拒否と混同していないことの証拠**
8. **`warnings`（V3）だけが出た run は成功のままである**ことを検証するテストがある。警告を失敗に格上げしていない
9. 拒否の通知に match_id と試合 URL が含まれる
10. **`lib/ingestion/event-integrity.ts` に差分が無い**
11. `lib/ingestion/events.ts` の判定と戻り値の型に差分が無い
12. **DB への `UPDATE` / `INSERT` / マイグレーションが差分に含まれない**
13. LLM 呼び出しが差分に含まれない
14. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**PR 本文に `upsertMatchEvents` の呼び出し元 13 箇所を列挙し、それぞれが `rejected` をどう扱うかを書くこと。** grep の件数一致を網羅性の証拠にしない。

## 未解決の質問

なし。

**本 spec で解決しないと明示するもの**:

- **スナップショットキャッシュが一時的な DB 障害をプロセス寿命まで保持する問題は直らない**（再レビュー R2）。別 spec
- **拒否が出た試合のデータは修復されない。** 本 spec は「気づけるようにする」ところまでで、正しいイベントの再取得は Owner の判断
- **これは AC8 の未達を埋める作業であって、新しい防御ではない。** 「ガードを強化した」と報告しないこと
