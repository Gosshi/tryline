# fix-generation-event-integrity-gate

> 本 spec は `specs/fix-score-event-integrity-check.md`（2026-06、警告記録のみ）と `specs/fix-derived-stats-event-integrity-gate.md`（2026-06、`derived_stats` のみ対象）の防御範囲を拡張する。両 spec の実装は残し、判定の結果として**生成を止める**ところまで進める。

## 背景

2026-09-05 の監査（`docs/audits/gpt6-full-audit-2026-09-05.md` D-1 層2）で、**イベント合計と最終スコアの不一致を検出しても、recap の生成が止まっていない**ことがコードで確認された。

`lib/llm/pipeline.ts:204-235` は不一致を検出すると `console.warn` と `logPipelineRun({ stage: 0, status: "failed" })` を行うが、**その後の処理にそのまま進み、汚染されたイベントを入力として本文を生成する**。これは `fix-score-event-integrity-check.md` の「不一致を検知・記録する」という当初スコープどおりの挙動であり、実装が仕様に反したのではない。**仕様の防御範囲が足りていなかった。**

`lib/llm/stages/assemble.ts:924` のゲートは `derived_stats` を `null` にするだけで、`score_timeline` と `match_events` は入力に残る。`fix-derived-stats-event-integrity-gate.md` は対象外に次のように書いている。

> `score_timeline` のゲート（HT スコア・リードチェンジは多少の欠落でも方向性は正しく、recap@4.7 以前から使用実績がある。今回は新規追加の derived_stats のみ対象）

**この判断の前提は「多少の欠落」だった。** 今回確認された汚染は欠落ではなく、**別試合のイベントの全面的な置き換え**である（`f01f68e2-…` に第1戦の 19 イベントがチーム帰属を反転して入り、合計 32–35 に対し最終スコアは 56–17）。`generate-recap.ts:163` の `matchEventsBlock` は「スコアリングイベントは以下のデータのみを根拠に記述すること」として汚染データを本文の唯一の根拠に指定し、L167 の `scoreTimelineBlock` は「# ターニングポイントの骨格として必ず使うこと」と指示する。**方向性が正しいどころか、全部が別試合のものになる。**

なお `pipeline.ts:236` には既に「recap でイベント 0 件なら `status: "skipped"` を返す」防御がある。**この既存防御は維持し、同じ形で不整合時の分岐を足す。**

## スコープ

対象:
- `lib/llm/pipeline.ts`: 不一致検出時に生成へ進まず終了する
- `lib/llm/stages/assemble.ts`: 不一致時に `score_timeline` と `match_events` も入力から落とす
- 不一致で止めたことを Discord ops 通知に出す

対象外:
- **既存データの修正・削除**（`match_events` に触れない）
- **公開済み本文の非公開化・再生成**（棚卸しは `audit-published-recap-event-integrity.md`、対応は Owner の `content-regen` 運用）
- 取り込み時の拒否（`fix-event-ingestion-identity-guard.md`）
- 表示の隔離（`fix-contaminated-events-display-isolation.md`）
- preview の生成（preview は終了後のイベントを根拠にしない。**recap のみ対象**）
- QA プロンプト・採点ルーブリックの変更（`tactical_depth` 閾値等は別 spec）
- `PROMPT_VERSION` のバンプ（プロンプト文字列を変更しないため不要）
- `lib/llm/content-length.ts` の字数要件（触れない）

## データモデル変更

データスキーマの変更はない。内部の集約結果にはeventIntegrity（判定、元イベント数、期待値、実測値、差分、理由）を保持する。DB・UIの公開型には不用意に露出させない。

## API サーフェス

なし。

## UI サーフェス

なし。

## LLM 連携

**LLM 呼び出しは増えない。むしろ減る**（不整合な試合で生成を行わなくなるため）。コスト影響はマイナス方向。

プロンプトの文字列は変更しない。`generate-recap.ts` は `assembled.match_events.length > 0` を見て分岐する既存構造（L60 `hasEvents`、L66 `isDataSparse`）をそのまま使う。

## 変更詳細

### 1. `lib/llm/stages/assemble.ts`

`eventTotalsMatchFinalScore` が false のとき、`derived_stats` を `null` にする既存処理（L924）に加えて、**`score_timeline` を `null`、`match_events` を空配列にする**。

判定は既存の `eventTotalsMatchFinalScore` をそのまま使う。`fix-event-ingestion-identity-guard.md` が `lib/ingestion/event-integrity.ts` へ切り出した後は、そちらを参照する。**判定ロジックを書き起こさないこと。**

**適用条件を誤らないこと**: `eventTotalsMatchFinalScore` は `status` が `finished` でない試合やスコアが null の試合でも false を返すが、**それは「不整合」ではない**。本ゲートの適用は `contentType === "recap"` かつ試合が `finished` かつ `home_score` / `away_score` が両方非 null のときに限る。試合前の preview 生成を壊してはならない。

### 2. `lib/llm/pipeline.ts`

L204-235 の検出ブロックで不一致を確認したら、`logPipelineRun` の後に**生成へ進まず終了する**。L236-243 の既存パターンに合わせ、`status: "skipped"` を返す。

既存の `logPipelineRun({ stage: 0, status: "failed", output: { type: "score_event_mismatch" } })` は残す。

### 3. Discord ops 通知

止めたことを `lib/llm/notify.ts` の既存パターンで通知する。**件数だけでなく match_id と `https://www.trylinerugby.com/matches/<id>` を含める**（週次監査の `2. スコア不一致: matches=${count}` という件数のみの通知が 2026-08-17 以降ずっと埋もれていた経緯が背景。`lib/llm/notify.ts:209`）。

## 受け入れ条件

**テスト実行の条件**: 既定の `pnpm test` は `vitest.config.ts:16` の `exclude` により次を実行しない — `tests/ingestion/events.test.ts` / `tests/llm/pipeline.test.ts` / `tests/llm/stages/assemble.test.ts` / `tests/health.test.ts` / `tests/db/**`。**本 spec の受け入れテストはこれらに該当する領域なので、「`pnpm test` が green」を完了根拠にしてはならない。**

次のいずれかで**実際に実行されること**を条件とする。

- (a) DB と LLM をモックした単体テストとして、除外されていない新規ファイルに置く
- (b) 除外を外した実行コマンドを用意する

**PR 本文に、実行したコマンドと結果を貼ること。**


1. finished かつイベント合計が最終スコアと不一致の試合で recap パイプラインを実行すると、**LLM 呼び出しが 1 回も発生せず** `status: "skipped"` が返ることを検証するテストがある
2. 同ケースで `logPipelineRun` に `type: "score_event_mismatch"` が記録されることを検証するテストがある（既存挙動の維持）
3. **正常系**: イベント合計が最終スコアと一致する finished 試合では、従来どおり生成が進み `match_events` と `score_timeline` が入力に含まれることを検証するテストがある
4. **preview が壊れていないこと**: `contentType === "preview"` では本ゲートが一切適用されず、従来どおり生成されることを検証するテストがある
5. 試合前（`status !== "finished"`）および `home_score` / `away_score` が null の試合で、本ゲートが適用されないことを検証するテストがある
6. `assembleMatchContentInput` が不整合の finished 試合に対して `match_events: []`、`score_timeline: null`、`derived_stats: null` を返すことを検証するテストがある
7. イベント 0 件の recap で従来どおり `status: "skipped"` が返る（`pipeline.ts:236` の既存防御が壊れていない）
8. Discord 通知に match_id と試合 URL が含まれる
9. `lib/llm/prompts/generate-recap.ts` の `PROMPT_VERSION` が変更されていない
10. `lib/llm/content-length.ts` に差分が無い
11. `pnpm typecheck` が green。テストは下記「テスト実行の条件」を満たすこと
12. **`match_events` / `match_content` への DELETE / UPDATE が差分に含まれない**

## 判定順序（未解決なしとする前に確定する）
recapかつfinishedかつ両スコア確定時に、空配列化の前の入力で判定する。不一致はeventIntegrityへ証拠を保存し、events=[] / score_timeline=null / derived_stats=nullとする。pipelineはevents.lengthで再判定せずeventIntegrityを使い、stage0 failedとmatch_id付き通知を出して、全LLM呼び出し前に理由付きskippedを返す。未終了・スコア未確定・eventsなしは別理由とする。既存公開記事の内容・statusは変更しない。

**意図的に受け入れる副作用**: 不整合が残っている試合では recap が生成されなくなる。棚卸し（`audit-published-recap-event-integrity.md`）の結果次第では対象が広がり、一時的に recap の生成本数が落ちる可能性がある。**それでも誤った本文を出し続けるより望ましい**という判断で本 spec を採る。生成が止まった試合は Discord 通知で可視化されるため、Owner がイベントの再取得を判断できる。
