仕様書 `specs/fix-event-insertion-rejection-propagation.md` を実装してください。**先に全文を読んでください。**

これは PR #781（取り込み時の同一性ガード）の **AC8 未達分**を埋める作業です。ガード本体は正しく動いています。**判定ロジックには触れません。**

## 何が壊れているか

2026-09-08 の再レビューで再現されました。合成した `score_mismatch` 拒否 1 件に対し、`app/api/cron/fill-event-gaps` の route が実際にこう返します。

```
HTTP 200  { errors: [], filled: 1, gaps: 1 }
```

**書き込みは正しく拒否されているのに、拒否された試合が「補完済み 1 件」として記録されます。** 運用からは成功に見えます。

再現コードがあります: `docs/audits/gpt6-spec-review-followup-2026-09-08/cron-observation.test.ts`

## 失敗は 2 種類あります

**(a) `rejected` を一切見ない経路（4 つ）**

```
app/api/cron/fill-event-gaps/route.ts:162                 戻り値を捨て、無条件で filled += 1
app/api/cron/fill-league-one-playoff-events/route.ts:295  result.inserted のみ加算
lib/ingestion/live-ingest.ts:451                          upserted.inserted のみ加算
lib/ingestion/jrfu-match-event-fallback.ts:293            inserted のみ
```

**(b) assert を呼ぶが、throw をループ内 catch が握りつぶす経路**

`assertEventInsertionAccepted` は 10 本のスクリプトから呼ばれています。しかし少なくとも次の 3 本は、投げた例外を同じループの `catch` が `console.warn` に変えて次の試合へ進みます。

```
scripts/fill-event-gaps.ts                    assert :414 → 握りつぶす catch :449
scripts/backfill-top14-match-events.ts        assert :328 → catch :334
scripts/backfill-premiership-match-events.ts  assert :267 → catch :273
```

**最外の `main().catch(... exit(1))` に届かないため、スクリプトは終了コード 0 で終わります。**

## やること

**(a) の 4 経路**: `rejected` が非空なら、その試合を成功として数えない。試合ごとの続行は残してよいですが、**run の最後に拒否を集約し、run 自体を失敗として報告**してください。拒否した match_id と `reason` を出してください（件数だけにしない）。

**(b) のスクリプト**: 拒否由来の例外がループ内 catch に握りつぶされないようにしてください。

## 2 つの線引きを守ってください

**1. 取り込みの失敗と、ガードによる拒否は別です。**

ネットワークやパースの失敗は**従来どおり警告して次の試合へ進んで**ください。握りつぶしを単純に外すと、一時エラー 1 件で run 全体が止まります。そこは変えないでください。

**2. 警告（V3）を失敗に格上げしないでください。**

`warnings` だけが出た run は成功のままです。V3 を警告に留めたのは 2026-09-06 の Owner 判断で、これを失敗にすると意味がなくなります。

## 触るファイル

```
app/api/cron/fill-event-gaps/route.ts
app/api/cron/fill-league-one-playoff-events/route.ts
lib/ingestion/live-ingest.ts
lib/ingestion/jrfu-match-event-fallback.ts
scripts/fill-event-gaps.ts
scripts/backfill-top14-match-events.ts
scripts/backfill-premiership-match-events.ts
（他のスクリプトにも同じ握りつぶしがあれば対象）
```

cron のレスポンス形式は既存の cron 群に合わせてください。`specs/fix-refresh-workflow-scale-and-failure-visibility.md`（PR #758）が採った「失敗を終了コードへ反映する」方針と揃えてください。**GitHub Actions が success を返してしまう問題を再生産しないでください。**

## やってはいけないこと

- **`lib/ingestion/event-integrity.ts` を触ること。** V1〜V4 の判定は正しく動いています
- **`upsertMatchEvents` の戻り値の型を変えること。** 既に `{ inserted, rejected, warnings }` です
- 新しい通知系を作ること。`lib/llm/notify.ts` の既存パターンを使ってください
- DB への `UPDATE` / `INSERT` / マイグレーション
- LLM を呼ぶこと
- 既存データの修復

## テストについて

`tests/ingestion/` には `vitest.config.ts:16` の `exclude` 対象が 3 つあります（`events.test.ts` / `standings.test.ts` / `upsert.test.ts`）。**新規テストはこれらに該当しない場所に置いてください。**

`docs/audits/gpt6-spec-review-followup-2026-09-08/cron-observation.test.ts` が現在の誤った挙動を再現しています。**期待値を正しい動作へ書き換えて回帰テストにしてください。**

## 完了の定義

受け入れ条件 1〜14 を満たすこと。特に:

- 拒否 1 件で `filled` が 0、match_id と理由がレスポンスに含まれ、run が失敗と分かる（条件 1）
- スクリプトで拒否由来の例外が最外まで伝播する（条件 5・6）
- **取り込み失敗は従来どおり次へ進む**（条件 7）
- **`warnings` だけの run は成功のまま**（条件 8）
- `event-integrity.ts` に差分が無い（条件 10）

**PR 本文に `upsertMatchEvents` の呼び出し元 13 箇所を列挙し、それぞれが `rejected` をどう扱うかを書いてください。** grep の件数一致を網羅性の証拠にしないでください。前回この確認を怠って AC8 が未達のままマージされました。

## 作業の進め方

git worktree で分けてください（`docs/runbooks/codex-worktree.md`）。`origin/main` から切ってください。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
