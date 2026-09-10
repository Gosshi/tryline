仕様書 `specs/fix-event-rejection-aggregation-and-ci-coverage.md` を実装してください。**先に全文を読んでください。**

GPT-6 再監査（2026-09-10）の **N1 / N4 / N5** をまとめた 1 本です。3 件とも「拒否をどう最外の観測点まで運ぶか」という同じ問題で、別々に直すと契約が食い違います。

**判定ロジック（`lib/ingestion/event-integrity.ts`）には触れません。**

## 先に: 契約が変わりました

`specs/fix-event-insertion-rejection-propagation.md` の **AC5 は無効です。** 同 spec は次を両方書いており、両立していませんでした。

```
変更詳細 2:  拒否は集約して最後に非ゼロ終了する
AC5:         例外がループ内 catch に握りつぶされず、最外まで伝播する
```

PR #793 は AC5 を実装しました。**指示どおりです。** 結果として最初の拒否で残りの試合が処理されなくなりました（N4）。

**Owner 判断（2026-09-10）で「集約して続行」を採ります。** ガードは書き込み自体を既に拒否しているので、走り続けても汚染は入りません。止める実益が薄く、未処理が残る損だけが確実に出ます。

## N1（P1）— 拒否の後に取得エラーが起きると拒否ごと消える

`lib/ingestion/jrfu-match-event-fallback.ts` の補完ループに **try/catch がありません**（実測）。

```
:191  const rejections = []              ← ローカルに貯める
:214  for (const candidate of ...) {
:215    await fetchJrfuMatchEvents(...)  ← try/catch 無し。throw しうる
:313    rejections.push(...)
:329  return { ..., rejections }         ← ここに到達しないと全部消える
```

上位はこう受けます。

```
lib/ingestion/live-competitions.ts:174  } catch (error) {
                                  :177    return { rejections, results: ingested }
```

この `rejections` は **live source 由来の分だけ**です。**1 試合目で拒否 → 2 試合目の取得が失敗 → cron が HTTP 200 / status:"ok"。**

GPT-6 が合成 fixture で実際に再現しています（`docs/audits/gpt6-followup-2026-09-10/jrfu-rejection-observation.test.ts`）。

**ループ全体を try で囲んで途中 return する形にしないでください。** 同じ穴が残ります。試合ごとに捕まえて、貯めた拒否を保持したまま次へ進んでください。

## N4（P2）— 5 スクリプトが最初の拒否で終了する

```
scripts/fill-event-gaps.ts                    :452
scripts/backfill-top14-match-events.ts        :339
scripts/backfill-premiership-match-events.ts  :278
scripts/backfill-urc-match-events.ts          :314
scripts/import-world-rugby-full.ts            :645
```

拒否を `match_id` と `reason` とともに集約し、**残りの試合を処理してから**非ゼロ終了してください。取り込み失敗（ネットワーク・パース）は従来どおり警告して次へ進み、**拒否と混同しない**でください。

## N5（P2）— R1/R2 の回帰テストが CI で走らない

`vitest.config.ts:32` の `include` は `tests/**` だけです。修正後の期待値へ書き換えた 2 本は `docs/audits/` にあります。

```
gpt6-spec-review-followup-2026-09-08/cache-observation.test.ts
  it("retries a recovered database after the first snapshot load rejects")   ← R2
gpt6-spec-review-followup-2026-09-08/cron-observation.test.ts
  it("reports a score_mismatch rejection without counting it as filled")     ← R1
```

**既存テストは代替になりません。** `tests/ingestion/event-ingestion-validation-cache.test.ts` は `it` が 1 件（成功キャッシュの再利用のみ）で、拒否 Promise の復旧を見ていません。

`tests/` 配下の非除外ファイルへ移すか、対応する既存ファイルへ統合してください。

## やってはいけないこと

- **`docs/audits/**` を `vitest.config.ts` の `include` に追加すること。** 過去監査の**不正な挙動を期待する**観測テストが含まれます（`audit-observation.test.ts` 等）
- `vitest.config.ts` の `exclude` に該当する場所へテストを置くこと
- **`lib/ingestion/event-integrity.ts` を触ること**
- `upsertMatchEvents` の戻り値の型を変えること
- **`warnings`（V3）を失敗に格上げすること**
- 「拒否が 1 件でもあれば 500、ネットワーク失敗だけの run は成功」という現行仕様を変えること
- DB への `UPDATE` / `INSERT` / マイグレーション
- LLM を呼ぶこと

## 完了の定義

受け入れ条件 1〜15 を満たすこと。特に:

- **拒否 → 次の取得失敗 → 最終 500**（条件 1）
- **取得失敗が run を止めていない**（条件 2）
- **`[拒否する試合, 正常な試合]` で正常な試合の upsert に到達し、かつ exit 1**（条件 5・5 本すべて）
- 拒否が 2 件以上なら**すべての match_id と reason が出る**（条件 6）
- **`docs/audits/**` が include に入っていない**（条件 10）

条件 5 は `main()`（またはループを含む関数）を実際に走らせ、`upsertMatchEvents` をモックして拒否を返させてください。**CLI ラッパーに throw する関数を直接渡すテストは条件を満たしません。**

git worktree で `origin/main` から切ってください（`docs/runbooks/codex-worktree.md`）。

**これは #793 の未達分です。「ガードを強化した」と報告しないでください。**

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
