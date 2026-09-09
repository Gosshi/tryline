仕様書 `specs/fix-event-validation-snapshot-recovery.md` を実装してください。**先に全文を読んでください。**

## 何が壊れているか

`lib/ingestion/events.ts:59-64` の `??=` が **reject した Promise も保持します。**

```typescript
eventInsertionValidationSnapshot ??= Promise.all([
  loadAllFixtureMatches(),
  loadAllExistingEvents(),
]).then(...);
```

DB が一時的に落ちて初回の読み込みが失敗すると、**同じプロセスが生きている限り、DB が復旧しても再取得しません。** 以降の全ての取り込みが同じ過去のエラーを投げ続けます。

再現: `docs/audits/gpt6-spec-review-followup-2026-09-08/cache-observation.test.ts`。初回だけ失敗しその後は成功する DB を用意しても、2 回目も失敗し、全件取得は 1 回しか呼ばれませんでした。

warm な cron インスタンスや、複数試合をループするスクリプトでは、**その run の残り全部が止まります。**

## やること

読み込みが reject したらキャッシュを破棄し、次の呼び出しで再取得する。現在の呼び出しにはエラーを伝えます。

**成功時の挙動は変えないでください。** 「1 回のランで 1 回だけ読む」という #781 の性質（バックフィル 144 試合で 200MB → 1.4MB）を維持してください。`tests/ingestion/event-ingestion-validation-cache.test.ts` が green のままであることが条件です。

## やってはいけないこと

- **空のスナップショットで判定を続行すること。** 「読めなかったから素通し」はガードの無効化と同じです
- `lib/ingestion/event-integrity.ts` を触ること
- 成功キャッシュの寿命・更新に手を入れること（別の既知の限界。本 spec の対象外）
- ページング（`EVENT_INSERTION_PAGE_SIZE`）を変えること
- DB への書き込み、LLM 呼び出し

## テスト

`tests/ingestion/events.test.ts` は `vitest.config.ts:16` の `exclude` 対象です。**新規テストはそこに置かないでください。**

`cache-observation.test.ts` の期待値を正しい動作へ書き換えて回帰テストにしてください。

git worktree で分けてください（`docs/runbooks/codex-worktree.md`）。
