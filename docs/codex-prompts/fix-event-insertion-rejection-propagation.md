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
app/api/cron/fill-event-gaps/route.ts:162                 戻り値を捨て、無条件で filled += 1 (:168)
app/api/cron/fill-league-one-playoff-events/route.ts:287  result.inserted のみ加算 (:295)
lib/ingestion/live-ingest.ts:451                          upserted.inserted のみ加算 (:457)
lib/ingestion/jrfu-match-event-fallback.ts:293            inserted.inserted のみ (:309)
```

**(a-2) 上の後ろ 2 経路を無効化している上位（2026-09-09 追記・あなたの指摘で追加）**

live-ingest と jrfu-match-event-fallback で拒否を集約して throw しても、上位が握りつぶすので運用からは何も変わりません。指摘は正しかったです。

```
lib/ingestion/live-competitions.ts:145       Promise.allSettled(...)
                              :150-157       rejected を console.error に落とすだけ
                              :159-165       fulfilled だけを返す ← 拒否が戻り値から消える
                              :171           JRFU fallback の失敗も catch して握りつぶす
app/api/cron/ingest-live-competitions/route.ts:14-20
                                             resolve しさえすれば常に status:"ok" / HTTP 200
                                             allSettled は reject しないので必ず resolve する
```

**この 2 ファイルを変更対象に加えます。**

ただし **`Promise.allSettled` は残してください。** 1 ソースのネットワーク失敗で他ソースの取り込みを巻き添えにしないための設計です。スクリプト側と同じ線引き（取り込み失敗は続行、ガードによる拒否は集約して最後に失敗）をここでも守ってください。変えるのは、**拒否を戻り値から消さずに運ぶこと**と、**run の最後に失敗として報告すること**の 2 点だけです。

`ingestAllLiveCompetitions()` の戻り値の形は既存の呼び出し元（cron route と 2 本のテスト）に合わせて決めて構いません。要件は **`status: "ok"` が拒否のある run で返らないこと**です。

**(b) assert を呼ぶが、throw をループ内 catch が握りつぶす経路**

`assertEventInsertionAccepted` は 10 本のスクリプトから呼ばれています。うち **5 本**が、投げた例外を同じループの `catch` で受けてログに変え、次の試合へ進みます（2026-09-09 実測）。

```
scripts/fill-event-gaps.ts                    assert :414 → 握りつぶす catch :450   console.warn
scripts/backfill-top14-match-events.ts        assert :328 → catch :334              console.warn
scripts/backfill-premiership-match-events.ts  assert :267 → catch :273              console.warn
scripts/backfill-urc-match-events.ts          assert :303 → catch :309              skipped += 1 / console.warn
scripts/import-world-rugby-full.ts            assert :563 → catch :620              failedMatches += 1 / console.error
```

**最外の `main().catch(... exit(1))` に届かないため、5 本とも終了コード 0 で終わります。**

後ろ 2 本は件数を数えてはいます。しかし `skipped`（`backfill-urc-match-events.ts:316`）も `failedMatches`（`import-world-rugby-full.ts:630`）も**ログに出すだけで終了コードに反映されません**。数えているから気づける、にはなっていません。

**残る 5 本は対象外です。** `backfill-match-events.ts:206` / `import-league-one-full.ts:401` / `backfill-nations-championship-match-events.ts:259` / `backfill-club-match-details.ts:346` / `backfill-rwc-match-events.ts:237` は assert の後に握りつぶす catch が無く、例外が最外まで伝播します。触らないでください。

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
scripts/backfill-urc-match-events.ts
scripts/import-world-rugby-full.ts
lib/ingestion/live-competitions.ts                        ← 2026-09-09 追加
app/api/cron/ingest-live-competitions/route.ts            ← 2026-09-09 追加
```

この 11 本で網羅しているはずです。**これ以外に握りつぶしを見つけたら、今回と同じように直す前に報告してください。止めてもらって助かりました。**

cron のレスポンス形式は既存の cron 群に合わせてください。`specs/fix-refresh-workflow-scale-and-failure-visibility.md`（PR #758）が採った「失敗を終了コードへ反映する」方針と揃えてください。**GitHub Actions が success を返してしまう問題を再生産しないでください。**

## テストの書き方（2026-09-09 追記・PR #793 の差し戻し理由）

スクリプトの伝播テストは、**`main()`（またはループを含む関数）を実際に走らせ、`upsertMatchEvents` をモックして `rejected` を返させ、そのうえで exit 1 に到達すること**を検証してください。5 本それぞれで、そのスクリプト自身のループを通してください。

**CLI ラッパーに throw する関数を直接渡すテストは条件を満たしません。** ループ内 catch を一度も通らないので、握りつぶしの有無を測れません。PR #793 はこの形で書いたため、`backfill-urc-match-events.ts` の未修正を CI green のまま通しました。

## やってはいけないこと

- **`lib/ingestion/event-integrity.ts` を触ること。** V1〜V4 の判定は正しく動いています
- **`upsertMatchEvents` の戻り値の型を変えること。** 既に `{ inserted, rejected, warnings }` です
  - ただし **`events.ts` に「拒否由来であることを型で判別できる Error サブクラス」を追加するのは可**（2026-09-09 緩和）。文言への文字列一致で分岐しないでください
- 新しい通知系を作ること。`lib/llm/notify.ts` の既存パターンを使ってください
- DB への `UPDATE` / `INSERT` / マイグレーション
- LLM を呼ぶこと
- 既存データの修復

## テストについて

`tests/ingestion/` には `vitest.config.ts:16` の `exclude` 対象が 3 つあります（`events.test.ts` / `standings.test.ts` / `upsert.test.ts`）。**新規テストはこれらに該当しない場所に置いてください。**

`docs/audits/gpt6-spec-review-followup-2026-09-08/cron-observation.test.ts` が現在の誤った挙動を再現しています。**期待値を正しい動作へ書き換えて回帰テストにしてください。**

live-competitions と cron route には既存テストがあり、**どちらも `vitest.config.ts` の exclude に該当しないので `pnpm test` で走ります**（確認済み）。ここに足してください。

```
tests/ingestion/live-competitions-jrfu-fallback.test.ts
tests/api/ingest-live-competitions.test.ts
```

## 完了の定義

受け入れ条件 1〜14 を満たすこと。特に:

- 拒否 1 件で `filled` が 0、match_id と理由がレスポンスに含まれ、run が失敗と分かる（条件 1）
- スクリプトで拒否由来の例外が最外まで伝播する（条件 5・6）。**`backfill-urc-match-events.ts` と `import-world-rugby-full.ts` は「件数が増えること」ではなく「終了コードが非ゼロになること」で検証する**
- **`ingestAllLiveCompetitions()` が拒否を戻り値から消さない**（条件 4-a）
- **`app/api/cron/ingest-live-competitions` が拒否のある run で `status: "ok"` を返さない**（条件 4-b）
- **1 ソースのネットワーク失敗では他ソースが続行し run は成功のまま**＝`Promise.allSettled` を外していない（条件 4-c）
- **取り込み失敗は従来どおり次へ進む**（条件 7）
- **`warnings` だけの run は成功のまま**（条件 8）
- `event-integrity.ts` に差分が無い（条件 10）

**PR 本文に `upsertMatchEvents` の呼び出し元 13 箇所を列挙し、それぞれが `rejected` をどう扱うかを書いてください。** grep の件数一致を網羅性の証拠にしないでください。前回この確認を怠って AC8 が未達のままマージされました。

13 箇所は仕様書の末尾に実測値を列挙してあります。

**14 本目に見える経路が 1 つあります。** `scripts/backfill-nations-championship-match-events.ts` は `upsertMatchEvents` を直接呼ばず、DI 経由（`:56` の `upsertEvents?: typeof upsertMatchEvents`、既定値は `:189`）で同じ関数を呼びます。**grep には出ませんが実行時は同じ経路なので、この 1 本も評価に含めてください。**

## 作業の進め方

git worktree で分けてください（`docs/runbooks/codex-worktree.md`）。`origin/main` から切ってください。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
