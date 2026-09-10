# fix-event-rejection-aggregation-and-ci-coverage

> GPT-6 再監査（2026-09-10、`docs/audits/gpt6-followup-2026-09-10/review.md`）の **N1（P1）/ N4（P2）/ N5（P2）** をまとめて扱う。3 件とも「拒否をどう最外の観測点まで運ぶか」という同じ問題で、別々に直すと契約が食い違う。
>
> **本 spec は `specs/fix-event-insertion-rejection-propagation.md` の AC5 を上書きする。** 同 spec は「集約して最後に非ゼロ終了する」（変更詳細 2）と「例外が最外まで伝播する」（AC5）を両方書いており、**両立しない**。PR #793 は AC5 を実装した。**Owner 判断（2026-09-10）で「集約して続行」を採る。**

## 背景

### なぜ「集約して続行」か（2026-09-10 Owner 決定）

**ガードは書き込み自体を既に拒否している。** 走り続けても汚染は入らない。止める実益が薄く、未処理の試合が残る損だけが確実に出る。

### N1（P1）: 拒否の後に取得エラーが起きると、拒否ごと消えて run が成功する

`lib/ingestion/jrfu-match-event-fallback.ts` の補完ループには **try/catch が無い**（2026-09-10 実測）。

```
:191  const rejections: EventInsertionRejection[] = []   ← ローカルに貯める
:214  for (const candidate of cappedCandidates) {
:215    await fetchJrfuMatchEvents(...)                  ← try/catch 無し。throw しうる
:313    rejections.push(...)
:329  return { counts, ...(rejections.length > 0 ? { rejections } : {}), source }
```

ループ内の `fetchJrfuMatchEvents` や DB 呼び出しが throw すると、**`:329` に到達せず関数を抜ける**。上位はこう受ける。

```
lib/ingestion/live-competitions.ts:174  } catch (error) {
                                  :177    return { rejections, results: ingested }
```

この `rejections` は **live source 由来の分だけ**で、JRFU が既に貯めていた拒否は含まれない。結果、**1 試合目で拒否 → 2 試合目の取得が失敗 → cron が HTTP 200 / `status: "ok"` を返す。**

GPT-6 の再現: 合成 fixture で実際に `POST /api/cron/ingest-live-competitions` が 200 / rejections 無しを返した（`jrfu-rejection-observation.test.ts`）。

**PR #793 の単独拒否は直っている。拒否と一時障害が同じ run に混在する場合が未解消。**

### N4（P2）: スクリプトが最初の拒否で終了し、残りを処理しない

5 本とも、拒否由来の例外を catch 内で即 rethrow する（2026-09-10 実測）。

| スクリプト | rethrow 位置 |
|---|---|
| `scripts/fill-event-gaps.ts` | `:452` |
| `scripts/backfill-top14-match-events.ts` | `:339` |
| `scripts/backfill-premiership-match-events.ts` | `:278` |
| `scripts/backfill-urc-match-events.ts` | `:314` |
| `scripts/import-world-rugby-full.ts` | `:645` |

exit 1 へ届く点は #793 で解決済み。**しかし残りの試合が一度も処理されない。** 拒否が繰り返し先頭に現れると、同じ場所で止まり続ける。

### N5（P2）: R1/R2 の回帰テストが通常 CI で走らない

`vitest.config.ts:32` の `include` は `tests/**/*.test.ts` / `tests/**/*.test.tsx` のみ。修正後の期待値へ書き換えた 2 本は `docs/audits/` にある。

```
docs/audits/gpt6-spec-review-followup-2026-09-08/cache-observation.test.ts
  it("retries a recovered database after the first snapshot load rejects")   ← R2 の回帰
docs/audits/gpt6-spec-review-followup-2026-09-08/cron-observation.test.ts
  it("reports a score_mismatch rejection without counting it as filled")     ← R1 の回帰
```

**既存テストは代替にならない。** `tests/ingestion/event-ingestion-validation-cache.test.ts` は `it` が **1 件**（`reuses paged fixture and signature reads across upsert calls`）で、成功キャッシュの再利用しか見ていない。**拒否 Promise の復旧を検証していない。**

## スコープ

対象:
- N1: JRFU 補完ループが、試合ごとの例外で貯めた拒否を失わない
- N4: 5 スクリプトが拒否を集約して残りを処理し、最後に非ゼロ終了する
- N5: 上記 2 本の回帰テストが通常 CI で走る
- テスト

対象外:
- **V1〜V4 の判定ロジック**（`lib/ingestion/event-integrity.ts`）。触らない
- **`upsertMatchEvents` の戻り値の型**
- **`warnings`（V3）の扱い**。警告は run を失敗にしない
- **`docs/audits/**` 全体を CI の `include` に追加すること。** 過去監査の**不正な挙動を期待する**観測テストが含まれる（`audit-observation.test.ts` 等）
- 既存データの修復
- DB への `UPDATE` / `INSERT` / マイグレーション

## データモデル変更

なし。

## API サーフェス

`app/api/cron/ingest-live-competitions` のレスポンス。**拒否が 1 件でもあれば 500、ネットワーク失敗だけの run は成功**という現行仕様を維持する。

## UI サーフェス

なし。

## LLM 連携

なし。コスト $0。

## 変更詳細

### 1. N1 — JRFU ループの例外

**試合ごとの例外を捕まえ、貯めた拒否を保持したまま次へ進む。** 取り込み失敗（ネットワーク・パース・DB）は従来どおり警告して継続する。

`applyJrfuMatchEventFallback` が**必ず `rejections` を含む戻り値で返る**ようにするか、上位が拒否を取り出せる形にする。**ループ全体を try で囲んで途中 return する形にしないこと**（同じ穴が残る）。

`live-competitions.ts:174` の catch も、**JRFU が途中で throw した場合に既に確定した拒否を落とさない**こと。

### 2. N4 — スクリプトの集約

拒否を `match_id` と `reason` とともに集約し、**残りの試合を処理してから**非ゼロ終了する。

- 拒否 1 件で run を止めない
- 取り込み失敗（ネットワーク・パース）は**従来どおり警告して次へ**進む。**拒否と混同しない**
- 最後に拒否した `match_id` と `reason` を出す。**件数だけにしない**

### 3. N5 — CI 登録

2 本を `tests/` 配下の非除外ファイルへ移すか、対応する既存ファイルへ統合する。

- `cron-observation.test.ts` → `tests/api/` 相当
- `cache-observation.test.ts` → `tests/ingestion/` 相当（**`event-ingestion-validation-cache.test.ts` は `exclude` 非該当**なので統合可）

**`vitest.config.ts` の `exclude` に該当する場所へ置かないこと**（`tests/ingestion/events.test.ts` / `standings.test.ts` / `upsert.test.ts` 等）。

## 受け入れ条件

1. **N1 の回帰テスト（必須）**: 1 試合目の upsert が拒否を返し、2 試合目の取得が throw する fixture で、`POST /api/cron/ingest-live-competitions` が **500 を返し、レスポンスに 1 試合目の `match_id` と `reason` が含まれる**
2. 同じ fixture で、**2 試合目の取得失敗が run を止めていない**（3 試合目があれば処理される）ことを検証するテストがある
3. **ネットワーク失敗だけの run は成功のまま**であることを検証するテストがある
4. **`warnings`（V3）だけの run は成功のまま**であることを検証するテストがある
5. **N4: `[拒否する試合, 正常な試合]` を渡すと、正常な試合の upsert に到達し、かつ最後に exit 1 になる**ことを検証するテストが 5 本すべてにある
6. 拒否が 2 件以上あるとき、**すべての `match_id` と `reason` が出力される**
7. スクリプトで取り込み失敗（ネットワーク・パース）は従来どおり次へ進む
8. **N5: `cache-observation.test.ts` の `retries a recovered database after the first snapshot load rejects` 相当が `tests/` 配下で実行される**
9. **N5: `cron-observation.test.ts` の `reports a score_mismatch rejection without counting it as filled` 相当が `tests/` 配下で実行される**
10. **`docs/audits/**` が `vitest.config.ts` の `include` に追加されていない**
11. **`lib/ingestion/event-integrity.ts` に差分が無い**
12. `upsertMatchEvents` の戻り値の型に差分が無い
13. DB への `UPDATE` / `INSERT` / マイグレーションが差分に含まれない
14. LLM 呼び出しが差分に含まれない
15. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**検証方法の指定（`fix-event-insertion-rejection-propagation` の AC5 と同じ理由）**: 条件 5 は `main()`（またはループを含む関数）を実際に走らせ、`upsertMatchEvents` をモックして拒否を返させること。**CLI ラッパーに throw する関数を直接渡すテストは条件を満たさない。**

## 未解決の質問

なし。**「集約して続行」は 2026-09-10 に Owner が決定済み。**

**本 spec で解決しないと明示するもの**:

- **これは #793 の未達分を埋める作業であって、新しい防御ではない。** 「ガードを強化した」と報告しないこと
- **拒否が出た試合のデータは修復されない**
- N2 / N3 / N6 は別 spec
