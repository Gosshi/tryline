# recap 生成のスキップを Discord に通知する

## 背景

**`lib/llm/pipeline.ts:247-256` は、イベントが0件の試合の recap 生成を黙って諦めている。**

```ts
if (
  contentType === "recap" &&
  assembled.eventIntegrity?.reason === "events_unavailable"
) {
  return {
    matchId,
    contentType,
    status: "skipped",
    qa: null,
  };
}
```

**この分岐自体は正しい。** `lib/llm/stages/assemble.ts:358` が `eventCount === 0 || scoreTimeline === null` のときに `events_unavailable` を立てており、得点イベントが無いまま recap を書かせれば捏造になる。`specs/p3-recap-require-events.md` が定めた意図どおりの動作で、**パイプラインにバグは無い。**

問題は、**このスキップが誰にも届かないこと**である。

### 隣の分岐は通知している

同じ関数の `:202-238` にある**スコア不一致**の分岐は、`console.warn` と `pipeline_runs` への `status: "failed"` 記録に加えて `notifyEventIntegrityMismatch` を呼び、Discord に出る。

**`events_unavailable` の分岐は、そのいずれもしない。** `pipeline_runs` への記録すら無い。

呼び出し側の `lib/cron/orchestrate.ts:322-328` は件数だけ数え、`console.info` を出す。

```ts
if (generated?.status === "skipped") {
  result.recaps.skipped += 1;
  console.info("[orchestrate] recap generation skipped", {
    matchId,
  });
  continue;
}
```

**`console.info` はランタイムエラーに出ない。** ワークフローは成功で終わり、レスポンスの `recaps.skipped` を能動的に読まない限り気づけない。`specs/p3-recap-require-events.md` は orchestrate 側に「ログにも記録する」までしか要求しておらず、**通知は最初から範囲外だった。**

### 実測（2026-09-14、本番 DB）

測り方は「検証」章に SQL を再掲する。候補の定義はコードと同一にした（`status = 'finished'` かつ `match_content` に `content_type='recap'` / `language='ja'` / `status in ('draft','published')` の行が無い）。

recap の候補は **106件**。内訳:

| | 試合数 | 直近2日に生成試行 | 最終試行 |
|---|---:|---:|---|
| **イベント0件** | **44** | **17** | **2026-09-14 04:49** |
| イベントあり | 62 | 0 | 2026-05-30 15:32 |

**イベント0件の44件は毎朝試行され、毎朝無言で捨てられている。**

その44件の内訳:

| 大会 | 試合数 | 最古 | 最新 |
|---|---:|---|---|
| Premiership Rugby 2025-26 | 18 | 2025-09-26 | 2026-06-06 |
| **Top 14 2026-27** | **14** | 2026-09-05 | 2026-09-13 |
| URC 2025-26 | 12 | 2026-05-15 | 2026-05-30 |

`lib/cron/orchestrate.ts:229-234` の候補クエリは **`orderByKickoff: "desc"` のみでキックオフの絞り込みを持たない**ため、新しい順に並ぶ。**現在その先頭14件がすべて Top 14 2026-27 であり、`RECAP_BATCH_SIZE = 10`（`:8`）の10枠は全部イベント0件の試合で埋まっている。**

### 捨てているものの中身

イベント0件の44件のうち **27件が `match_sourced_facts` を保有**しており、合計 **258件**の事実が既に取得済みである。

**Top 14 の14件は全件が事実を持つ**（1試合あたり 7〜26件、計220件）。

**事実の取得は成功している。落ちているのは得点イベントだけである。**

### 因果の限定

**「Top 14 の開幕が既存の試合を枠から押し出した」とは書けない。** イベントを持つ62件の最終生成試行は **2026-05-30** で、Top 14 開幕（2026-09-05）より前である。**枠の占有と、62件が処理されないことの因果は未検証**であり、本 spec はその原因を扱わない。

本 spec が主張するのは次の2点だけである。

1. イベント0件を理由とするスキップは、現在どこにも通知されていない
2. その結果、10枠が生成不能な試合で占有されている事実を運用者が知る手段が無い

## スコープ

対象:

- `events_unavailable` による recap スキップを **run 単位で1通** Discord に通知する
- スキップした理由が呼び出し側に届くよう、`generateMatchContent` の戻り値に理由を加える

対象外:

- **生成不能な試合をバッチ選択から除外すること。** 枠の占有そのものを解く変更であり、除外条件の設計を伴う。本 spec は「見えるようにする」までで止める
- **Top 14 の得点イベントを取り込むこと**（別 spec）
- **日本代表戦のイベント補完**（`specs/feat-jrfu-match-event-fallback.md` が扱う）
- **イベントを持つ62件が処理されない原因の調査**
- **通知の重複抑制。** 同じ試合が毎日鳴ることは許容する。抑制には「どの試合をいつ通知したか」の永続化が要り、テーブル追加を伴う。**run 単位で1通にまとめることで、1日あたりの通知数を1通に抑える**
- スコア不一致（`status: "mismatch"`）側の挙動。既に通知されており、差分を出さない
- `console.info` の削除。ログからの追跡を壊さない

## データモデル変更

なし。マイグレーション不要。

## API サーフェス

新規ルートなし。

### 1. `generateMatchContent` の戻り値に理由を加える

`lib/llm/pipeline.ts` の2つのスキップ分岐が、なぜ捨てたかを返す。

```ts
skipReason?: "events_unavailable" | "score_mismatch";
```

- `:247-256`（イベント不足）は `skipReason: "events_unavailable"` を返す
- `:202-238`（スコア不一致）は `skipReason: "score_mismatch"` を返す
- **スキップ以外の戻り値に `skipReason` を付けない**

**既存フィールドは変えない。** `status: "skipped"` の値も変えない（`lib/cron/orchestrate.ts:322` が依存している）。

### 2. `RunOrchestrateDeps` に通知関数を足す

`lib/cron/orchestrate.ts:47-62` の `RunOrchestrateDeps` に、**任意の**関数を加える。`sendPushNotification` と同じ扱いにすること（未設定なら何もしない）。

```ts
export type RunOrchestrateDeps = {
  …
  notifyRecapSkipped?: (report: RecapSkipReport) => Promise<void>;
};

export type RecapSkipReport = {
  batchSize: number;
  matches: RecapSkipEntry[];
  skippedCount: number;
};

export type RecapSkipEntry = {
  competitionFamily: string | null;
  matchId: string;
  reason: string;
};
```

`batchSize` には `RECAP_BATCH_SIZE` の値を入れる。**本 spec の目的は「10枠のうち何件が生成不能だったか」の可視化なので、分母を報告に含めること。**

### 3. `lib/llm/notify.ts` に通知関数を足す

既存の `notifyEventIntegrityMismatch`（`:341-359`）と同じ形にする。`postOpsAlert`（`:155`）を使い、`matchPageUrl`（`:90`）で試合 URL を作る。

```ts
export async function notifyRecapGenerationSkipped(
  report: RecapSkipReport,
): Promise<void>
```

メッセージは日本語で、次を含める（値は例）。

```
⚠️ recap 生成をスキップ（イベント不足）
スキップ: 8件 / バッチ枠 10件
理由別: events_unavailable 8件
試合: <試合URL> ほか4件
対応: 得点イベントの取り込み状況を確認してください
```

**列挙する試合 URL は `DATA_INTEGRITY_ACTION_ITEM_LIMIT`（`lib/llm/notify.ts:45`、値は 4）件までにし、超過分は残件数を明記する。** これは `specs/fix-data-integrity-alert-actionability.md` が定めた規約（先頭 N 件＋残件数、N は名前付き定数）に従う。44件分の URL を並べると `truncateDiscordMessageContent`（`lib/llm/notify.ts:80-88`）で末尾が切れ、件数が読めなくなる。

### 4. orchestrate が集計して1回だけ呼ぶ

`lib/cron/orchestrate.ts:322-328` のループ内では**集計するだけ**にし、ループを抜けた後（`:340` の `return result` の前）に1回だけ通知する。

**試合ごとに通知してはならない。** 実測でスキップは1 run あたり最大10件であり、試合ごとに呼ぶと1日10通になる。

スキップが**0件のときは通知関数を呼ばない**こと。

## UI サーフェス

なし。

## LLM 連携

なし。**本変更は LLM 呼び出しの前に確定する情報だけを扱う。** `events_unavailable` の分岐は既に全 LLM ステージより前にあり（`tests/llm/pipeline-recap-skip.test.ts` の "returns skipped before any LLM stages when recap events are missing" が保証している）、本変更でコストは増えない。

## 受け入れ条件

1. `generateMatchContent` が `events_unavailable` でスキップしたとき、戻り値に `skipReason: "events_unavailable"` が入る
2. `generateMatchContent` が `score_mismatch` でスキップしたとき、戻り値に `skipReason: "score_mismatch"` が入る
3. **スキップしなかったとき、戻り値に `skipReason` キーが存在しない**（`"skipReason" in result === false` で確認すること。`undefined` との比較にしないこと）
4. 既存の `tests/llm/pipeline-recap-skip.test.ts` の "returns skipped before any LLM stages when recap events are missing" が、**LLM ステージが呼ばれないことの検証を保ったまま**通る
5. 10件の候補すべてが `events_unavailable` でスキップしたとき、`notifyRecapSkipped` が **1回だけ**呼ばれ、引数が `skippedCount: 10` と `batchSize: 10` を持つ
6. **スキップが0件のとき、`notifyRecapSkipped` が1度も呼ばれない**
7. 10件中3件がスキップ・7件が成功したとき、`notifyRecapSkipped` が1回呼ばれ、`skippedCount: 3` と `batchSize: 10` を持ち、`matches` の長さが **3** である
8. `notifyRecapSkipped` が未設定（`undefined`）でも `runOrchestrate` が例外を投げず、`result.recaps.skipped` が従来どおり加算される
9. `notifyRecapSkipped` が例外を投げても `runOrchestrate` が例外を投げず、`result` を返す
10. `OrchestrateResult` の形が変わっていない（`recaps.skipped` の意味と加算箇所が同じ）
11. `notifyRecapGenerationSkipped` が、試合 URL を **4件まで**しか並べず、5件以上のときに残件数を示す文字列を含む
12. `notifyRecapGenerationSkipped` が `DISCORD_WEBHOOK_OPS` 未設定のときに例外を投げない（既存 `postOpsAlert` の挙動、`lib/llm/notify.ts:158-161`）
13. `console.info("[orchestrate] recap generation skipped", …)` の行が残っている
14. スコア不一致側の `notifyEventIntegrityMismatch` の呼び出しと引数が変わっていない（`tests/llm/pipeline-recap-skip.test.ts` の "stops before every LLM stage and notifies when event totals differ" が無改変で通る）
15. `app/api/cron/orchestrate/route.ts` が `notifyRecapSkipped` を deps に渡している
16. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 検証（PR 本文に書くこと）

### RED になる条件とならない条件

**実装前に落ちるのは 1・2・5・7・11・12・15 だけである。** これらは「まだ存在しないもの」（`skipReason` フィールド、`notifyRecapSkipped`、`notifyRecapGenerationSkipped`、route の配線）に依存するため落ちる。

| # | 内容 | 実装前 |
|---|---|---|
| 1 | イベント不足時に `skipReason: "events_unavailable"` | **RED** |
| 2 | スコア不一致時に `skipReason: "score_mismatch"` | **RED** |
| 5 | 10件全スキップで1回・`skippedCount: 10` / `batchSize: 10` | **RED** |
| 7 | 10件中3件スキップで `skippedCount: 3` / `matches.length === 3` | **RED** |
| 11 | 試合URLを4件までに絞り残件数を示す | **RED**（関数が無い） |
| 12 | webhook 未設定でも例外を投げない | **RED**（関数が無い） |
| 15 | route が `notifyRecapSkipped` を deps に渡す | **RED**（未配線） |
| 3 | 非スキップ時に `skipReason` キーが無い | GREEN（キーが存在しないため自明に通る） |
| 4 | LLM ステージ前に止まる既存テスト | GREEN（回帰防止） |
| 6 | スキップ0件のとき1度も呼ばれない | **GREEN（呼び出し自体が無いため自明に通る）** |
| 8 | 未設定でも落ちず `recaps.skipped` は加算 | GREEN（既存動作の保護） |
| 9 | 通知が例外を投げても落ちない | GREEN（呼び出しが無いため自明に通る） |
| 10 | `OrchestrateResult` の形が不変 | GREEN（回帰防止） |
| 13 | `console.info` の行が残る | GREEN（回帰防止） |
| 14 | スコア不一致側の通知が無改変 | GREEN（回帰防止） |

**条件6を RED として扱わないこと。** 通知関数が存在しない段階ではモックを渡しても呼ばれようがなく、**必ず通る**。2026-09-14 に本 spec が条件6を RED に分類し、Codex が着手前に矛盾を指摘して停止した。

### 実装後に「意図的に壊して落ちるか」を確認する条件

**3・6・9 は自明に通るため、実装後に壊して初めて検出力が確認できる。** 次の3つを一時的に適用し、**該当条件だけが落ちること**を PR 本文に示すこと。

| 壊し方 | 落ちるべき条件 |
|---|---|
| 通知をループ後に**無条件で**呼ぶ（`skippedCount === 0` の分岐を外す） | **6** |
| 非スキップの戻り値に `skipReason: undefined` を**明示的に代入**する | **3**（`"skipReason" in result` が true になる） |
| 通知呼び出しの try/catch を外す | **9** |

**条件5と7も同様に壊して確認する。** `skippedCount` に `matches.length` ではなく `batchSize` を渡す実装へ一時的に書き換え、**条件7（3件のケース）だけが落ち、条件5は通ること**を示すこと。**条件5だけでは 10 と 10 が一致するため、この取り違えを検出できない。**

### 実測の再現

本 spec の背景の数値は次の SQL で出した。**PR 本文に書く期待値は、本番でこれを実行して検算すること。**

```sql
with eligible as (
  select m.id, c.name as competition,
         (select count(*) from match_events e where e.match_id = m.id) as events,
         (select max(pr.created_at) from pipeline_runs pr
           where pr.match_id = m.id and pr.content_type = 'recap') as last_run
  from matches m
  join competitions c on c.id = m.competition_id
  where m.status = 'finished'
    and m.id not in (
      select mc.match_id from match_content mc
      where mc.content_type = 'recap' and mc.language = 'ja'
        and mc.status in ('draft','published')
    )
)
select case when events = 0 then 'zero_events' else 'has_events' end as bucket,
       count(*) as matches,
       count(*) filter (where last_run >= now() - interval '2 days') as attempted_last_2d,
       max(last_run) as most_recent_attempt
from eligible
group by 1;
```

**候補の定義を `lib/cron/orchestrate.ts:87-146` の `getMatchIdsMissingContent` から外れて書き換えないこと。** キックオフの絞り込みを足すと件数が変わる（コード側は絞り込みを持たない）。

## デプロイ後に Owner が確認すること

- 翌朝の run 後、Discord の ops チャンネルに **1通だけ**「recap 生成をスキップ」が出ること。**10通出ていたら試合ごとに呼んでいる**
- その1通の「スキップ: N件 / バッチ枠 10件」が、Vercel ランタイムログの `[orchestrate] recap generation skipped` の行数と一致すること
- 得点イベントが取り込めるようになった大会から、この通知の件数が減ること

## 未解決の質問

- **10枠が生成不能な試合で埋まり続けることを、いつ・どう解くか。** 本 spec は可視化までで、除外は扱わない。通知が毎日同じ件数を報告し続けるなら、次は除外（候補クエリ側）の判断が要る
- **恒久的に生成不能な試合と、後でイベントが埋まる試合をどう区別するか。** Premiership 2025-26 の18件は 2025-09-26 まで遡り、1年近く埋まっていない。Top 14 は取り込み実装が無いだけで、実装すれば埋まる。**この区別が付かないと除外条件を書けない**
