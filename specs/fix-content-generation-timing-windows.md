# プレビューとレビューの生成タイミングを調査枠に合わせる

## 背景

**週次のタイミングを 2026-09-14 に洗い出したところ、生成が調査枠とかみ合っていない箇所が2つ見つかった。** 全体像は `docs/weekly-schedule.html` にある。

### 問題1: 金曜夜・土曜夜の試合は、事実が入る前にレビューが確定する

`lib/cron/orchestrate.ts:231-235` の recap 候補は **`status: "finished"` と `orderByKickoff: "desc"` だけで、キックオフの絞り込みを持たない**。終了が確認できた最初の live-pipeline の回（03:00 / 09:00 / 15:00 / 21:00 JST）で生成される。

ChatGPT のレビュー調査枠は **18:00、入力の締切は 20:30**（`docs/chatgpt-prompts/README.md`）。

| 試合 | 終了 | 現在の初回生成 | 調査枠 |
|---|---|---|---|
| 金曜夜 | 金 23:00 | **土 03:00** | 土 18:00 → **間に合わない** |
| 土曜夜 | 日 01:30 | **日 05:22**（実測） | 日 18:00 → **間に合わない** |

`lib/cron/orchestrate.ts` は既存コンテンツのある試合を候補から外すため、**後から入れた事実は月曜 09:05 の再生成まで反映されない**。その間に X の下書き通知（12:00 / 22:00）が走るので、**事実の入っていない版で X に流れる**。

### 問題2: プレビューがメンバー発表より前に確定することがある

`lib/cron/preview-window.ts` の `previewDueUpperBound` は「直近に過ぎた JST 15:00 + 33 時間」を返す。**キックオフ時刻によって、生成はキックオフの 9.5〜33 時間前とばらつく。**

翌日 23:00 キックオフの試合は **32 時間前**に確定する。`docs/decisions.md` の D030 の背景が、まさにこれを問題として挙げている。

> 多くの協会のメンバー発表（24〜48時間前）より前に確定してしまう

### 実測（2026-09-14）

キックオフから初回 recap 生成までの実績。

| 試合 | キックオフ(JST) | 初回生成 | 差 |
|---|---|---|---:|
| 日本 vs アメリカ | 土 19:05 | 日 00:16 | 5.2h |
| Top 14 ×5 | 土 23:35 | 日 05:22 | 5.8h |
| 南ア vs NZ | 日 06:00 | 日 12:57 | 7.0h |
| ラ・ロシェル vs トゥールーズ | **月 04:05** | **水 09:28** | **53.4h** |

**GitHub Actions の cron は実測で1〜10時間遅延する。** 2026-09-14 の月曜 09:05 の回は 13:47 に走った。**実行時の時計で分岐する実装を採ってはならない。** D030 の決定4 が同じ理由で下限を撤廃している。

## スコープ

対象:

- `lib/cron/content-windows.ts`（新規）— 2つの上限を計算する純粋関数
- `lib/cron/orchestrate.ts` — preview / recap の候補選択に上限を渡す
- テスト

対象外:

- **`lib/cron/preview-window.ts` の `previewDueUpperBound` の返り値**。`specs/fix-preview-window-upper-bound-boundary.md`（PR #811 マージ済み）が排他境界に直したばかりで、**3経路が揃っている状態を壊さない**
- **`app/api/cron/audit-prekickoff-readiness/route.ts` と `app/api/cron/matches-with-late-lineups/route.ts`**。この2つは「前日 15:00 までに生成されるべきだった試合」を探す監査・救済用途であり、**24時間に狭めると点検漏れ・救済漏れになる**
- **cron のスケジュール**（`.github/workflows/*.yml` / `vercel.json`）
- **月曜 09:05 / 火曜 09:05 の再生成**（`cron-post-match-recap-refresh.yml`）。`force=true` で明示の match_id を処理するため、本 spec の上限とは無関係
- ChatGPT のプロンプト（`docs/chatgpt-prompts/weekend-recap-facts.md` を別途更新済み）
- LLM 呼び出し・プロンプト・QA

## データモデル変更

なし。`matches` に**試合終了時刻の列は存在しない**（`kickoff_at` / `status` / `created_at` / `updated_at` のみ。`updated_at` は取り込みのたびに動くため終了の指標にならない）。**終了時刻の推定は下記の定数1箇所に閉じ込める。**

## API サーフェス

### `lib/cron/content-windows.ts`（新規）

```ts
export const PREVIEW_MAX_LEAD_HOURS = 24;
export const RECAP_MIN_AGE_HOURS = 12;
export const RECAP_RESEARCH_DEADLINE_HOUR_JST = 20;
export const RECAP_RESEARCH_DEADLINE_MINUTE_JST = 30;
export const ASSUMED_MATCH_DURATION_HOURS = 2;

export function previewCandidateUpperBound(now: Date): string;
export function recapCandidateUpperBound(now: Date): string;
```

**`previewCandidateUpperBound`** は次の小さい方を ISO 文字列で返す。**排他上限**（`kickoffLt` に渡す）。

```
previewDueUpperBound(now)          ← 既存関数をそのまま呼ぶ
now + PREVIEW_MAX_LEAD_HOURS
```

**`recapCandidateUpperBound`** は次の小さい方を ISO 文字列で返す。**包含上限**（`kickoffLte` に渡す）。

```
now - RECAP_MIN_AGE_HOURS
直近に過ぎた 20:30 JST - ASSUMED_MATCH_DURATION_HOURS
```

**「直近に過ぎた 20:30 JST」は `previewDueUpperBound` の `lastReleaseJst` と同じ求め方にすること**（JST の壁時計に移してから、その日の 20:30 を作り、まだ過ぎていなければ前日にする）。`lib/cron/preview-window.ts:11-26` を参照。

### `lib/cron/orchestrate.ts`

現在:

```ts
const previewCandidates = await getMatchIdsMissingContent({
  …
  kickoffGte: now.toISOString(),
  kickoffLt: previewDueUpperBound(now),
});

const recapCandidates = await getMatchIdsMissingContent({
  db: deps.db,
  status: "finished",
  contentType: "recap",
  orderByKickoff: "desc",
});
```

変更後は `kickoffLt: previewCandidateUpperBound(now)` とし、recap 側に **`kickoffLte: recapCandidateUpperBound(now)`** を足す。

**`getMatchIdsMissingContent` は `kickoffLte` を既に受け取れる**（`:98`、`:110-112` で `.lte("kickoff_at", …)`）。**新しいパラメータを追加しないこと。**

## UI サーフェス / LLM 連携

なし。**生成される本数が減る方向にのみ働くため、LLM コストは増えない。**

## 受け入れ条件

日付は固定すること（`vi.setSystemTime`）。実行日に依存するテストにしない。

### `previewCandidateUpperBound`

1. `now = 2026-09-18T06:00:00Z`（金 15:00 JST）のとき **`2026-09-19T06:00:00Z`** を返す（24時間側が小さい）
2. `now = 2026-09-18T18:00:00Z`（土 03:00 JST）のとき **`2026-09-19T15:00:00Z`** を返す（`previewDueUpperBound` 側が小さい）
3. どちらの場合も `previewDueUpperBound(now)` 自体の返り値が**変わっていない**

### `recapCandidateUpperBound`

4. `now = 2026-09-19T06:00:00Z`（土 15:00 JST）のとき **`2026-09-18T09:30:00Z`** を返す（金 18:30 JST。調査枠側が小さい）
5. `now = 2026-09-19T12:00:00Z`（土 21:00 JST）のとき **`2026-09-19T00:00:00Z`** を返す（土 09:00 JST。経過時間側が小さい）
6. `now = 2026-09-20T06:00:00Z`（日 15:00 JST）のとき **`2026-09-19T09:30:00Z`** を返す（土 18:30 JST）

### 候補選択への反映

7. 金曜夜の試合（`kickoff_at = 2026-09-18T12:00:00Z` ＝ 金 21:00 JST）が、**土 15:00 JST の回では recap 候補に入らず、土 21:00 JST の回で入る**
8. 土曜夜の試合（`kickoff_at = 2026-09-19T10:05:00Z` ＝ 土 19:05 JST）が、**日 15:00 JST の回では入らず、日 21:00 JST の回で入る**
9. 翌日 23:00 JST キックオフの試合（`kickoff_at = 2026-09-19T14:00:00Z`）が、**金 15:00 JST の回では preview 候補に入らず、土 03:00 JST の回で入る**
10. `orchestrate` が recap 候補の取得時に **`kickoffLte` を渡している**
11. `orchestrate` が preview 候補の取得時に **`kickoffLt` に `previewCandidateUpperBound` の値を渡している**
12. **`audit-prekickoff-readiness` と `matches-with-late-lineups` の差分がゼロ**。この2経路は引き続き `previewDueUpperBound` を直接使う
13. `.github/workflows/*.yml` と `vercel.json` の差分がゼロ
14. `RECAP_BATCH_SIZE = 10` と `orderByKickoff: "desc"` が変わっていない
15. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 検証（PR 本文に書くこと）

### RED になる条件

**実装前に落ちるのは 1・2・4・5・6・7・8・9・10・11 である。** 新モジュールが存在せず、`orchestrate` も上限を渡していないため。

| # | 実装前 |
|---|---|
| 1・2・4・5・6 | **RED**（`lib/cron/content-windows.ts` が無い） |
| 7・8・9・10・11 | **RED**（`orchestrate` が上限を渡していない） |
| 3 | GREEN（既存関数の保護） |
| 12・13・14 | GREEN（回帰防止） |

### 実装後に意図的に壊して確認すること

**3・12・14 は自明に通るため、壊して初めて検出力が確認できる。**

| 壊し方 | 落ちるべき条件 |
|---|---|
| `recapCandidateUpperBound` を「経過時間だけ」にする（調査枠の項を外す） | **7・8** |
| `recapCandidateUpperBound` を「調査枠だけ」にする（経過時間の項を外す） | **5** |
| `previewCandidateUpperBound` を `previewDueUpperBound` そのままにする | **1・9** |
| 24時間の上限を `previewDueUpperBound` 側（共有関数）に入れる | **12** |

**最後の1つが最も重要である。** 共有関数に入れても 1・9・11 は通るため、**条件12 だけが「監査と救済 cron を巻き込んでいないこと」を検出する。**

### 既存テストへの影響

`tests/cron/orchestrate.test.ts` の `createMockDb` が **`.lte` を持っていない場合、recap 候補の取得で落ちる。** モックにチェーンを足すこと。**これは実装の不具合ではないので、テスト側を直す。**

`tests/cron/preview-window.test.ts` は**無改変で通ること**（条件3）。

## デプロイ後に Owner が確認すること

- 金曜夜の試合のレビューが、**土曜 21:00 の回**（実際には遅延して数時間後）に生成され、**初回から監督コメントやカードが入っている**
- 土曜夜の日本代表戦のレビューが **日曜 21:00 の回**になる。**現行の日曜 00:16 から約21時間の後退**であり、これは承認済みの代償
- 翌日夜キックオフの試合のプレビューが、**キックオフ24時間以内**に生成されている
- **`preview-lineup-catchup`（21:05）と `prekickoff-readiness-audit`（22:05）の対象件数が変わっていない**

## 未解決の質問

- **`RECAP_MIN_AGE_HOURS = 12` に増量の根拠は無い。** 2026-09-14 の実測では、キックオフからの経過時間と自動取得の件数に相関が無く（11.9時間で11件、119時間で2件）、支配要因は大会だった。**試合直後の空振りを防ぐ安全弁**として置いている。運用後に不要と判断したら外してよい
- **日曜夜・月曜未明の試合は、月曜 09:05 の再生成が本 spec の上限より先に走る。** そちらは `force=true` で明示の match_id を処理するため、本 spec では扱わない
