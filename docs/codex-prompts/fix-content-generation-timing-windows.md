# Codex プロンプト: fix-content-generation-timing-windows

`specs/fix-content-generation-timing-windows.md` の受け入れ条件に従って実装してください。**仕様の内容をここで繰り返しません。先に spec を全文読んでください。**

## やること

`orchestrate` の候補選択に上限を2つ足し、**生成のタイミングを ChatGPT の調査枠に合わせます**。純粋関数を新設し、既存の共有関数には触りません。

## 先に読むファイル

```
specs/fix-content-generation-timing-windows.md
docs/weekly-schedule.html              ← 週次の全体像。なぜこの時刻なのかはここに書いてある
lib/cron/preview-window.ts             ← :11-26 「直近に過ぎた JST 15:00」の求め方。20:30 も同じ形で書く
lib/cron/orchestrate.ts                ← :96-116 kickoffLt/kickoffLte の受け口 / :237-240 preview / :231-235 recap
tests/cron/preview-window.test.ts      ← 日付固定の書き方。無改変で通ること
tests/cron/orchestrate.test.ts         ← createMockDb に .lte が無ければ足す
docs/chatgpt-prompts/README.md         ← 調査枠と締切の権威
```

## 一番間違えやすいところ

**実行時の時計で分岐しないでください。**

「JST 21時台なら生成する」のような実装は採れません。GitHub Actions の cron は**実測で1〜10時間遅延**し、2026-09-14 の月曜 09:05 の回は **13:47** に走りました。時計で判定すると、**遅延した回が永久に条件を満たさず生成が止まります**。D030 の決定4 が同じ理由で下限を撤廃しています。

必ず **「直近に過ぎた境界」** で計算してください。`previewDueUpperBound` と同じ形です。

**24時間の上限を `previewDueUpperBound` に入れないでください。**

同関数は **3経路**から呼ばれます。`orchestrate` のほかに `audit-prekickoff-readiness`（22:05）と `matches-with-late-lineups`（21:05）があり、この2つは**「前日15:00までに生成されるべきだった試合」を探す監査・救済用途**です。24時間に狭めると**点検漏れと救済漏れ**になります。

**共有関数に入れても受け入れ条件 1・9・11 は通ってしまいます。** これを検出するのは**条件12 だけ**です。

**`getMatchIdsMissingContent` に新しいパラメータを足さないでください。** `kickoffLte` は既に `:98` と `:110-112` に存在します。

**`RECAP_MIN_AGE_HOURS = 12` は「事実が増えるから」ではありません。** 実測では経過時間と取得件数に相関がなく（11.9時間で11件、119時間で2件）、支配要因は大会でした。**試合直後の空振りを防ぐ安全弁**です。効果を誇張したコメントを書かないでください。

## 計算の確認（spec の受け入れ条件と同じ値）

金曜夜の試合 `kickoff_at = 2026-09-18T12:00:00Z`（金 21:00 JST）の場合:

```
土 15:00 JST の回（now = 2026-09-19T06:00:00Z）
  経過時間側 = now - 12h        = 2026-09-18T18:00:00Z
  調査枠側   = 金20:30 - 2h     = 2026-09-18T09:30:00Z   ← 小さい
  上限 = 2026-09-18T09:30:00Z   kickoff 12:00Z > 上限 → 対象外

土 21:00 JST の回（now = 2026-09-19T12:00:00Z）
  経過時間側 = now - 12h        = 2026-09-19T00:00:00Z   ← 小さい
  調査枠側   = 土20:30 - 2h     = 2026-09-19T09:30:00Z
  上限 = 2026-09-19T00:00:00Z   kickoff 12:00Z ≤ 上限 → 対象
```

## テストは RED から始めてください

**RED になるのは 1・2・4・5・6・7・8・9・10・11 です。** 新モジュールが存在せず、`orchestrate` も上限を渡していないためです。

GREEN（実装前から通る保護テスト）は **3・12・13・14** の4つだけです。

## 実装後に意図的に壊して確認してください

| 壊し方 | 落ちるべき条件 |
|---|---|
| `recapCandidateUpperBound` を経過時間だけにする | **7・8** |
| `recapCandidateUpperBound` を調査枠だけにする | **5** |
| `previewCandidateUpperBound` を `previewDueUpperBound` そのままにする | **1・9** |
| **24時間の上限を共有関数側に入れる** | **12 だけ**（1・9・11 は通る） |

最後の1つを必ず実施し、**条件12 だけが落ちること**を PR 本文に示してください。

## 触ってはいけないもの

```
lib/cron/preview-window.ts                          返り値も比較演算子も変えない（PR #811 で揃えたばかり）
app/api/cron/audit-prekickoff-readiness/route.ts    差分ゼロ
app/api/cron/matches-with-late-lineups/route.ts     差分ゼロ
.github/workflows/*.yml / vercel.json               cron は変えない
RECAP_BATCH_SIZE / orderByKickoff                   変えない
LLM プロンプト・QA・生成パイプライン本体
docs/chatgpt-prompts/*                              更新済み
```

## 完了の定義

1. spec の受け入れ条件15項目すべてを満たす
2. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
3. PR 本文に次を貼る
   1. 実装前に RED だった条件の出力（RED → GREEN）
   2. 意図的破壊4種の出力。**とくに「共有関数側に入れる」で条件12だけが落ちること**
   3. `tests/cron/preview-window.test.ts` が**無改変で通っている**こと

**期待値を手で書き写さないでください。** 実際に走らせた出力を貼ってください。

**`tests/cron/orchestrate.test.ts` のモックに `.lte` を足す必要が出ます。** これは実装の不具合ではないので、テスト側を直してください。
