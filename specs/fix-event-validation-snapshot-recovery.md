# fix-event-validation-snapshot-recovery

> 2026-09-08 再レビュー R2（P2）。`specs/fix-event-ingestion-identity-guard.md` が記録した「成功スナップショットが古くなる」という既知の限界**とは別の問題**である。こちらは**一時障害から復旧する経路が存在しない**。

## 背景

`lib/ingestion/events.ts:59-64`。

```typescript
function getEventInsertionValidationSnapshot() {
  eventInsertionValidationSnapshot ??= Promise.all([
    loadAllFixtureMatches(),
    loadAllExistingEvents(),
  ]).then(([fixtureMatches, existingEvents]) => ({ fixtureMatches, existingEvents }));

  return eventInsertionValidationSnapshot;
}
```

`??=` は **reject した Promise も保持する**。DB が一時的に落ちて初回の読み込みが失敗すると、**同じプロセスが生きている限り、DB が復旧しても再取得しない**。以降の全ての取り込みが同じ過去のエラーを投げ続ける。

再レビューがモックで再現した。初回だけ失敗しその後は成功する DB を用意しても、2 回目も失敗し、**全件取得は 1 回しか呼ばれなかった**（`docs/audits/gpt6-spec-review-followup-2026-09-08/cache-observation.test.ts`）。

影響は 1 試合に留まらない。warm な cron インスタンスや、複数試合をループするスクリプトでは、**その run の残り全部が止まる**。

## スコープ

対象:
- `lib/ingestion/events.ts` の `getEventInsertionValidationSnapshot`: 読み込みが reject したらキャッシュを破棄し、次の呼び出しで再取得する
- テスト

対象外:
- **成功したスナップショットの寿命・更新**。V3 / V4 が時間とともに古くなる問題は spec `fix-event-ingestion-identity-guard.md` に記録済みの既知の限界で、**本 spec では扱わない**
- V1〜V4 の判定ロジック。**触らない**
- ページング（`EVENT_INSERTION_PAGE_SIZE`）
- DB への書き込み

## データモデル変更 / API / UI

なし。

## LLM 連携

なし。コスト $0。

## 変更詳細

読み込みが失敗したら、**現在の呼び出しにはエラーを伝えたうえで、キャッシュを空に戻す**。次の呼び出しは DB へ取りに行く。

成功時の挙動は変えない。**1 回のランで 1 回だけ読む**という #781 の性質（バックフィル 144 試合で 200MB → 1.4MB）を維持すること。

## 受け入れ条件

**テスト実行の条件**: `tests/ingestion/events.test.ts` は `vitest.config.ts:16` の `exclude` 対象である。**新規テストはそこに置かないこと。** 結果を PR 本文に貼る。

1. **回帰テスト（必須）**: 初回だけ失敗し 2 回目以降は成功するモック DB で、**1 回目は拒否されて書き込みが起きず、2 回目は再取得して通常どおり判定される**ことを検証する。`docs/audits/gpt6-spec-review-followup-2026-09-08/cache-observation.test.ts` が現在の誤った挙動を再現しているので、期待値を書き換えて回帰テストにする
2. 成功後は再取得しないこと（`upsertMatchEvents` を 2 回呼んでも全件読み込みは 1 回）を検証するテストが**引き続き green**である。#781 で入った `tests/ingestion/event-ingestion-validation-cache.test.ts` を壊さない
3. 失敗時、呼び出し元にはエラーが伝わる（黙って空のスナップショットで判定しない）
4. **`lib/ingestion/event-integrity.ts` に差分が無い**
5. DB への `UPDATE` / `INSERT` / マイグレーションが差分に含まれない
6. LLM 呼び出しが差分に含まれない
7. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

## 未解決の質問

なし。

**本 spec で解決しないと明示するもの**:

- **成功キャッシュの鮮度は改善しない。** V3 / V4 が同一ラン内の新規重複を見逃す件と、warm インスタンスで古くなる件は別途
- **空のスナップショットで判定を続行してはならない。** 「読めなかったから素通しする」は、ガードを無効化するのと同じである
