# 調査する試合のプレビューは、事実が入るまで作らない

Owner 決定（2026-10-12）: 「手動で事実を入れるまでは生成しなくてよい。締切までに来なければ作る」。締切は 22:00 JST。前提: `specs/feat-ops-bulk-fact-paste.md`（共通の判定関数 `decideManualFactRegeneration` をここで拡張する）。

## 背景

- プレビューは「キックオフ日（JST）の前日 15:00 以降、かつキックオフまで 24 時間以内」に作られる（`lib/cron/preview-window.ts`、`lib/cron/content-windows.ts` の `previewCandidateUpperBound`、D030）。
- ChatGPT の調べ物は木・金・土の 20:00 に走り、翌日キックオフの試合を扱う（`docs/chatgpt-prompts/weekend-preview-facts.md`）。土曜の回は日曜と月曜未明の試合を扱う。
- そのため、調べる試合では**事実が必ず生成の後に届き**、貼るたびに作り直している（`specs/feat-preview-regenerate-on-manual-facts.md`）。1本を2回作っている。
- 前日 15:00 に作る仕組み自体は、調べない試合（平日の試合など）のために残す。

## 方針

**調べる対象の試合だけ、手動の事実が入るまでプレビューを作らない。** 前日 22:00 を過ぎても事実が無ければ、通常どおり作る。

- **調べる対象:** キックオフ（JST）が金・土・日、または月曜 12:00 より前。木・金・土の 20:00 の回が扱う範囲と同じ。
- **待つ条件:** 調べる対象で、**手動の事実**（`match_sourced_facts`、`content_type = "preview"`、`model_version = "manual"`）が1件も無く、今がキックオフ日の前日 22:00 JST より前。
- 事実が入れば、待つのをやめる（その後は今と同じ D030 の時刻で作る）。
- 貼った時点ですでに D030 の時刻を過ぎていれば、**貼ったときにその場で初めて作る**（作り直しではなく1回目の生成）。

### 時刻の例（JST）

| キックオフ | 調べる回 | 今の生成 | 変更後 |
|---|---|---|---|
| 土 13:00 | 金 20:00 | 金 15:00 → 貼ったら作り直し | 貼ったとき（金 21 時ごろ）に1回だけ |
| 土 23:00 | 金 20:00 | 金 23:00 以降（24時間以内の条件） | 事実あり → 金 23:00 以降に1回だけ（今と同じ時刻） |
| 月 04:00 | 土 20:00 | 日 15:00 | 土に事実が入るので待たず、日 15:00 に1回だけ |
| 土 13:00、調べ物が来なかった | 金 20:00 | 金 15:00 | 金 22:00 以降の最初の定期実行 |
| 水 19:00（調べない） | なし | 火 15:00 | 変わらない |

## スコープ

対象:
- 定期実行のプレビュー候補から、待つ条件に当たる試合を外す
- 貼ったときの判定（`decideManualFactRegeneration`）に「初めて作る」（`"generate"`）を足す
- `docs/chatgpt-prompts/weekend-preview-facts.md` の説明（Claude が直す）

対象外:
- レビュー（すでに 20:30 の締切を待っている。`recapCandidateUpperBound`）
- `previewDueUpperBound` そのもの（`app/api/cron/audit-prekickoff-readiness/route.ts`・`app/api/cron/matches-with-late-lineups/route.ts` も使っているので変えない）
- プレビュー通知の時刻（キックオフ前の最後の 22:30。`lib/push/notifications.ts` の `previewNotificationSlot`）

### 英語のプレビュー（リーグワンだけ。2026-10-12 確定）

`lib/cron/orchestrate.ts`（435 行あたり）は、リーグワンの試合だけ、日本語プレビューの直後に英語版を作っている（`generateLeagueOneEnglishContent`）。**英語版も日本語版と一緒に待つ**（日本語版を待たせた試合は、英語版も作らない）。

- 理由: 英語版は日本語版と同じ流れで作っており、片方だけ従来の時刻にするには流れを分ける必要がある。事実が入ってから作るほうが英語版の中身も良くなる。リーグワンは 12〜5 月の開催で、今（10 月）は影響が無い。
- 貼ったときに `"generate"`（初めて作る）になった試合がリーグワンなら、日本語版の後に英語版も作る（定期実行と同じ順）。`isLeagueOneMatch`（`orchestrate.ts:118`、今は非公開）を共通の場所に移して使う。`"regenerate"`（作り直し）では英語版を作らない（今の Discord の作り直しと同じ）。

## データモデル変更

なし。

## API サーフェス

### 待つ条件（新規の関数、`lib/cron/preview-research-hold.ts`）

```ts
export const PREVIEW_RESEARCH_DEADLINE_HOUR_JST = 22;
export const MONDAY_EARLY_CUTOFF_HOUR_JST = 12;

export function isInPreviewResearchScope(kickoffAt: Date): boolean;
export function previewResearchDeadline(kickoffAt: Date): Date; // キックオフ日（JST）の前日 22:00 JST
export function isPreviewHeldForResearch(input: {
  kickoffAt: Date;
  now: Date;
  hasManualPreviewFacts: boolean;
}): boolean; // scope && !hasManualPreviewFacts && now < deadline
```

- 曜日と日付は JST で判定する（`preview-window.ts` と同じく、UTC に 9 時間足して UTC の getter で読む）。

### 定期実行（`lib/cron/orchestrate.ts`）

- `previewCandidates`（今の 323 行目、`getMatchIdsMissingContent`）の結果から、待つ条件に当たる試合を外す。
- 手動の事実の有無は、候補の試合 ID の一覧で `match_sourced_facts` を**1回だけ**引いて決める（試合ごとに引かない）。
- 外した件数をログに出す（例: `[orchestrate] held N preview(s) for manual research`）。

### 貼ったときの判定（`lib/sourced-facts/manual-entry.ts` の `decideManualFactRegeneration`）

今の「日本語の `match_content`（`published` / `draft`）があれば `"regenerate"`」に、次を足す。

- `contentType === "preview"` で、`match_content` が無く、試合が `status = "scheduled"`、キックオフが未来、かつ `kickoff_at < previewCandidateUpperBound(now)`（＝ D030 の時刻を過ぎている）なら `"generate"`。
- それ以外は `"none"`（今と同じ。D030 の時刻より前なら、その後の定期実行で事実入りで作られる）。
- Discord の `/調査事実を追加` もこの判定を使う。`"generate"` のときの Discord の返信は「プレビューを作りました（公開）」など、「作り直し」ではなく「作りました」にする。

## UI サーフェス

なし（Discord の返信文と `/ops/facts` の結果表示の文言だけ）。

## LLM 連携

- 呼び出しの回数は**減る**。調べる試合のプレビューは、2回（15:00 と作り直し）から1回になる。週末 18 試合なら約 18 回、約 $0.9 の削減。
- 段・モデル・プロンプトは変えない。

## 受け入れ条件

1. **待つ条件:** `tests/cron/preview-research-hold.test.ts` で、上の「時刻の例」の5行を固定の時刻（`vi.setSystemTime`）で確かめる。加えて次の境界を確かめる。
   - 月曜 11:59 キックオフは対象、12:00 は対象外
   - 締切ちょうど（前日 22:00:00 JST）は待たない、21:59:59 は待つ
   - 金曜 00:30 キックオフ（木曜 20:00 の回が扱う）は対象で、締切は木曜 22:00
2. **定期実行:** `lib/cron/orchestrate.ts` のテストで、候補3試合（調べる対象・事実なし・締切前 / 調べる対象・事実あり / 調べない試合）のうち、1つ目だけが生成されない。`match_sourced_facts` の問い合わせが1回だけ。
3. **貼ったときの判定:** `decideManualFactRegeneration` のテストで、次の4つ。
   - 既存のプレビューあり → `"regenerate"`
   - 既存なし・D030 の時刻を過ぎている → `"generate"`
   - 既存なし・D030 の時刻より前 → `"none"`
   - レビューで既存なし → `"none"`
4. **既存のテストを壊さない:** `tests/cron/preview-window.test.ts` と、`previewCandidateUpperBound`・`getMatchIdsMissingContent` を使うテストが、アサーションを弱めずに通る。
5. **わざと壊して確かめる:** `isPreviewHeldForResearch` を常に `false` にすると受け入れ条件2が落ちる。出力を PR 本文に貼り、変更は戻す。
6. **本番での確認（Claude、マージ後の最初の金曜）:** 金曜 21:00 より前に、土曜キックオフの調べる試合のプレビューが作られていないこと。貼った後に1本ずつ作られ、`match_content` の作成時刻が貼った時刻の後であること。

## 未解決の質問

なし。
