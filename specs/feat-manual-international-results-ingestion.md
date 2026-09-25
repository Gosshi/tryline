# 手動で登録した国際試合の結果と得点経過を、自動で取り込む

## 背景

オーストラリア 対 南アフリカ（2026-09-27 09:30 UTC、Perth、`3577d392-73ef-462f-b73c-d5e88f6e8e41`）は、単発のテストマッチとして手動で登録した試合で（`external_ids.source = "manual"`、大会 `australia-south-africa-test-2026`）、**試合後の結果が自動では入らない**。

- 結果の自動取り込み（`lib/ingestion/live-competitions.ts` の `LIVE_COMPETITION_SOURCES`）は、大会ごとに Wikipedia の専用ページを取得元として登録した 13 大会だけが対象。この試合の大会は登録されていない。
- ブレディスローカップの spec（`specs/feat-bledisloe-cup-2026-ingestion.md` の 43 行）は、この試合の得点経過を対象外にした。代表戦の一覧ページ全体を解析に渡すと、ほかの試合のイベントが混ざる危険があったため（イベント汚染と同じ型）。

**今は安全に取り込める部品がそろっている**（2026-09-25 に確認）。
- 取得元: Wikipedia「2026 men's rugby union internationals」に、この試合の結果の枠（`{{rugbybox}}`）がある（日付 `27 September 2026`、`team1 = {{ru-rt|AUS}}`、`team2 = {{ru|RSA}}`、会場 Perth Stadium。試合前なので `score` と得点者は空）。このページは「抜けている国際試合の監査」（`app/api/cron/audit-missing-internationals/route.ts`）がすでに毎週読んでいる。
- 結果の枠の読み取り: `parseWikitextTemplates` と、監査の `parseInternationalFixtures`（`lib/audit/missing-internationals.ts:84`。チームの 3 文字の略号を取り出す）。略号から DB のチームへの対応は、監査の route と同じく `teams.short_code` で引く。
- 得点経過の切り出し: `findEventBlockByTeams`（`lib/ingestion/wikipedia-event-block.ts:96`、#881 で共通化）が、ページの HTML から「両チームの代表チームへのリンクと日付」で 1 試合のブロックだけを選ぶ。選べなければ `null`。
- 書き込み時の照合: `upsertMatchEvents` は、イベントの合計が試合のスコアと一致しなければ書き込まない（`lib/ingestion/event-integrity.ts`、#881 より前の 9/7 から）。

今後も単発のテストマッチを手動で登録することがあるので、この試合専用ではなく、**手動で登録した国際試合すべて**に効く形にする。

## スコープ

**対象**
- Live Pipeline の取り込み（`ingestAllLiveCompetitions`）の最後に、次の手順を足す。
  1. 手動で登録した試合のうち、キックオフから 2 時間以上たち、スコアが入っていないものを DB から探す。
  2. 年ごとの「〈年〉 men's rugby union internationals」の結果の枠から、同じチームの組み合わせで日付が合うものを **1 つだけ**見つけたときに、スコアと試合の状態を入れる。
  3. スコアを入れた試合について、ページの HTML から `findEventBlockByTeams` で試合のブロックを 1 つだけ選べたら、得点イベントを入れる（合計がスコアと一致しなければ、既存の照合で弾かれる）。
  4. **この仕組みで以前にスコアを入れたが、得点イベントがまだ 0 件の試合**は、スコアを変えずに、3 と同じ方法で得点イベントだけを取り直す（2026-09-25 追記）。
     - 理由: Wikipedia では、スコアが先に入り、得点者の欄が数時間後に埋まることが多い。1〜3 だけだと、スコアを入れた回に得点者が空だった試合は、次の回から候補にならない。週 1 回の「Fill Event Gaps」（日曜 06:00 UTC）が最終的に拾うが、9/27 09:30 UTC の試合では 10/4 まで得点イベントが入らず、得点イベントの無いレビューは生成されない（`events_unavailable`）ので、レビューも 1 週間遅れる。

**対象外**
- 手動で登録していない試合（大会ごとの取り込みの対象）。
- ラインアップ。
- 試合の新規登録（見つからない試合を作ることはしない。それは抜けている国際試合の監査の役割）。

## データモデル変更

なし。

## API サーフェス

### 新規 `lib/ingestion/manual-international-results.ts`

```ts
export async function applyManualInternationalResults(options?: {
  now?: Date;
  client?: SupabaseClient<Database>;
  fetchWikitext?: (pageTitle: string) => Promise<string>;
  fetchHtml?: (url: string) => Promise<string>;
}): Promise<ManualInternationalResultsResult>;
```

**1. 対象の試合**

次の 2 つの組を DB から探す。どちらも `external_ids->>source = 'manual'` で、`kickoff_at` が「今から 7 日前」〜「今から 2 時間前」の間の試合。

- **スコア待ち:** `home_score` と `away_score` が null。→ 2〜4 のすべてを行う。
- **得点イベント待ち（2026-09-25 追記）:** 次のすべてを満たす。→ 4 だけを行う（2 と 3 は行わない。スコアは変えない）。
  - `external_ids->>result_source = 'wikipedia-internationals'`
  - `home_score` と `away_score` が null でない
  - `match_events` が 0 件
- 取得するもの: `id`、`kickoff_at`、`home_team_id`、`away_team_id`、両チームの `short_code` と `english_name`（無ければ `name`）、`external_ids`。

**2. 結果の枠の照合**
- 対象の試合のキックオフの年（UTC）ごとに、`fetchWikipediaWikitext(["<年> men's rugby union internationals"])` で wikitext を取る（ページが無ければ、その年は何もしない）。
- `parseWikitextTemplates(wikitext, "rugbybox")` の各枠から、次を読む。
  - 日付（`parseInternationalFixtures` と同じ読み方）
  - ホームとアウェイの略号（同上）
  - `score`（`parseScoreText` で `homeScore` と `awayScore` を取る。空なら試合前として扱う）
- 試合との対応: 略号の組が DB のホームとアウェイの `short_code` に**この順で**一致し、日付の差が 1 日以内の枠。
  - **ちょうど 1 つのときだけ**使う。0 個または 2 個以上なら、その試合は何もせず、理由（`no_rugbybox`、`ambiguous_rugbybox`）を結果に載せる。
  - 略号の組が逆順（DB のホームが枠の team2）でだけ一致した場合は、書き込まずに理由 `home_away_reversed` を載せる（取り違えを避けるため）。
- 枠の `score` が空なら何もしない（理由 `score_not_published`）。

**3. スコアの書き込み**
- `matches` の該当行（id で 1 行だけ）の `home_score`、`away_score` を更新し、`status` を `finished` にする。
- `external_ids` に `result_source: "wikipedia-internationals"` と `wikipedia_url`（そのページの URL）を足す。`source: "manual"` は残す。

**4. 得点イベント**
- 次のどちらかの試合で、`match_events` が 0 件のときだけ行う。
  - この回でスコアを書き込んだ試合
  - 「得点イベント待ち」の組の試合。スコアは DB の値をそのまま使い、`matches` は更新しない。wikitext の再取得は不要（HTML だけを取る）。
- ページの HTML（`https://en.wikipedia.org/wiki/<年>_men%27s_rugby_union_internationals`）を `fetchWithPolicy` で取り、`findEventBlockByTeams(html, homeEnglishName, awayEnglishName, kickoffDate)` でブロックを 1 つ選ぶ。`null` なら何もしない（理由 `no_unique_event_block`）。
- `parseMatchEventsFromVeventHtml` で得点イベントを取り、`upsertMatchEvents` で書く。合計がスコアと合わなければ、既存の照合で弾かれる。その場合は理由（`event_total_mismatch`）を結果に載せる。
- **ページ全体を解析に渡す経路を作らない。**

**5. 結果**
```ts
type ManualInternationalResultsResult = {
  candidates: number; // スコア待ちの試合の数（今までどおり）
  eventRetryCandidates: number; // 得点イベント待ちの試合の数（2026-09-25 追記）
  scoresUpdated: number;
  eventsInserted: number;
  skipped: Array<{ matchId: string; reason: string }>;
};
```

### `lib/ingestion/live-competitions.ts`

- `ingestAllLiveCompetitions` の JRFU の手順（`:185-187`）のあとで `applyManualInternationalResults()` を呼び、結果を `results` に足す。
- 例外は、JRFU の手順と同じく捕まえてログに出し、ほかの結果は返す（この手順の失敗で Live Pipeline 全体を失敗させない）。

## UI サーフェス

なし。スコアが入れば、試合ページとレビューの生成に使われる（既存の流れ）。

## LLM 連携

なし。

## 受け入れ条件

テストでは、実際のページから保存した wikitext と HTML を使う（手作りしない。`feedback_scraper_test_fixture_realism`）。結果の入った枠は、同じページの試合済みの代表戦（例: 7 月の代表戦）を使う。

1. **スコアが入る:** 手動で登録した試合 1 件と、それに合う結果の枠（スコアあり）が 1 つある場合、その試合の `home_score`、`away_score`、`status = "finished"`、`external_ids.result_source` が書き込まれる。
2. **書き込まない場合（それぞれテスト）:**
   - 合う枠が 0 個
   - 合う枠が 2 個以上
   - 枠のホームとアウェイが逆
   - 枠の `score` が空
   - `external_ids.source` が `manual` でない
   - キックオフから 2 時間たっていない、または 7 日より前
   - すでにスコアが入っている
3. **得点イベント:**
   - HTML のブロックを 1 つ選べて、合計がスコアと一致すれば、`upsertMatchEvents` が呼ばれる。
   - ブロックを選べなければ、`upsertMatchEvents` は呼ばれない。
   - `match_events` がすでにある試合では呼ばれない。
   - 確認方法: ブロックを選べないときにページ全体を渡す実装にすると、このテストが落ちること。
4. **得点イベントの取り直し（2026-09-25 追記）:**
   - `result_source = "wikipedia-internationals"`、スコアあり、`match_events` が 0 件、キックオフから 2 時間〜7 日の手動登録の試合で、HTML のブロックを 1 つ選べて合計がスコアと一致すれば、`upsertMatchEvents` が呼ばれる。このとき `matches` の更新は呼ばれない。
   - 同じ試合でブロックを選べなければ、`upsertMatchEvents` は呼ばれず、理由 `no_unique_event_block` が結果に載る。
   - `result_source` が無い（手でスコアを入れた）試合、`match_events` がすでにある試合、キックオフから 7 日より前の試合は、取り直しの対象にならない。
   - `eventRetryCandidates` に、取り直しの対象になった試合の数が入る。
   - 確認方法: 「得点イベント待ち」の組を探す処理を外すと、1 つ目のテストが落ちること。
5. **Live Pipeline への組み込み:** `applyManualInternationalResults` が例外を投げても、`ingestAllLiveCompetitions` はほかの大会の結果を返す。
6. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## マージ後の確認（Claude Code が行う）

7. 9/27 の試合のあと、Wikipedia の結果の枠が埋まってから最初の Live Pipeline の実行で、`3577d392` のスコアと状態が入ったこと、得点イベントが入ったか（入らなかった場合は理由）を確かめる。
8. 9/28 までに入らなかった場合は、理由を確かめて Owner に報告する。スコアだけは、承認を得て手で入れる。

## 未解決の質問

なし。
