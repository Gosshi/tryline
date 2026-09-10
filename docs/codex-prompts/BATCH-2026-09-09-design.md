# Codex 投入バッチ 2026-09-09（GPT-6 監査 A 節・デザイン）

`docs/audits/gpt6-full-audit-2026-09-05.md` の A 節（全 64 観点）のうち、**D 区分＝決定論的欠陥**を全件 spec 化したもの。進捗台帳は `docs/audits/gpt6-full-audit-2026-09-05-design-progress.md`。

M 区分（計測先行 13 件）と O 区分（Owner 判断先行 23 件）は本バッチに含まない。

| # | 対象 | 監査項目 | 触る主なファイル | 並行可 |
|---|---|---|---|---|
| 1 | 記事の有料境界に視認計測 | A-3 11 | `components/match-content.tsx` `lib/analytics.ts` | ○ |
| 2 | newsletter 結果ページの正確性 | A-5 ×3 | `app/api/newsletter/confirm/route.ts` `app/newsletter/*` | ○ |
| 3 | 開催しない年度と未取得の区別 | A-4 6 | `app/c/[competition]/[season]/page.tsx` + **マイグレーション** | ○ |
| 4 | 会場の引用脚注が表示と JSON-LD に漏れる | A-5 | `lib/format/venue-timezone.ts` 表示 4 箇所 | ○ |
| 5 | 読了時間の算出対象 | A-3 7 | `components/match-content-section.tsx` | ○ |
| 6 | 日本語姓名の空白の混在 | A-3 6 | `lib/format/` 表示 3 箇所 | ○ |
| 7 | RWC2027 ブラケットの「準備中」 | A-5 | `app/c/rwc/2027/bracket/page.tsx` | ○ |
| 8 | pricing の VideoObject uploadDate | A-5 | `app/pricing/page.tsx:84` | **#9 の後** |
| 9 | AI ラベルの商品名統一と開示 | A-6 5 | `app/pricing/page.tsx` `components/match-chat.tsx` | ○ |

## 順番の制約

- **#8 の日付は確定済み**（`2026-05-18`。2026-09-09 に Owner が YouTube Studio で確認）。ファイル競合のため **#9 の完了後**に投げる
- **#8 と #9 は同じ `app/pricing/page.tsx` を触る。** #9 が `:80` の `description`、#8 が `:84` の `uploadDate`。**#9 を先に完了させてから #8 を投げる**
- **#3 はマージ前に本番へマイグレーション適用が必要**（`competitions` に列追加）。#577 等で複数回事故。Claude Code は実行しない
- 上記以外の 7 本は触るファイルが重ならず並行可

---

## そのまま貼る文面

以下 8 件を実装してください。**#9 以外は触るファイルが重ならないので並行して構いません。**

各 spec と `docs/codex-prompts/` の同名指示書を、**必ず両方とも先に全文読んでください。**

すべて **git worktree で `origin/main` から切って**ください（`docs/runbooks/codex-worktree.md`）。メインの作業ツリーは使わないでください。**通常 PR を 1 件ずつ作ってください。**

出典はすべて GPT-6 監査 `docs/audits/gpt6-full-audit-2026-09-05.md` の A 節です。各 spec の背景に、2026-09-09 に実コード・本番 DB で取り直した実測値を載せてあります。**spec の行番号と件数は当日の実測です。**

### 1. 記事の有料境界に視認計測（A-3 11・P1）

`specs/fix-paywall-view-tracking-article-boundary.md`

`<Paywall>` の利用は `components/match-chat.tsx:327` の 1 箇所だけで、記事側 `components/match-content.tsx:396-428` は `cta_click` しか送っていません。**`paywall_view` が 0 件でも導線が壊れている証拠になりません。** 記事側が一度も計測されていないからです。

計測の追加だけです。**UI と `cta_click` の既存ペイロードは変えないでください。**

### 2. newsletter 結果ページの正確性（A-5 confirmed / expired / invalid-link）

`specs/fix-newsletter-result-page-accuracy.md`

3 項目を 1 本にまとめています。同一ルートと 3 ページの問題で、別々に直すと文言と分岐が食い違うためです。

**登録フォームの専用ページは存在しません。** `NewsletterSignup` は 3 ページに埋め込まれているだけで id もアンカーもありません。存在しないページへリンクさせないでください。

### 3. 開催しない年度と未取得の区別（A-4 6・P1）

`specs/fix-competition-season-not-held-vs-not-ingested.md`

**マイグレーションを含みます。マージ前に本番適用してください。**

試合 0 件は本番に 2 件（`autumn-nations-2026` / `rugby-championship-2026`）。後者は開催されないのに「まもなく公開予定」と出ています。**既定値は「未確認」にして、既存 38 行が「開催する」と断定されないようにしてください。**

### 4. 会場の引用脚注（A-5・P1）

`specs/fix-venue-footnote-display-leak.md`

脚注付き 71 試合 / 55 種。**`app/matches/[id]/page.tsx:325` は JSON-LD の会場名です。** `"Twickenham Stadium, London[9]"` が構造化データとして送られています。

**`normalizeVenue`（`lib/format/venue-timezone.ts:87`）を変えないでください。** `.toLowerCase()` 済みの照合キー専用で、#775 の現地時刻 510/669 件がこれに依存しています。別関数を作ってください。

### 5. 読了時間の算出対象（A-3 7・P2）

`specs/fix-reading-time-basis.md`

Markdown 記法を文字数に数えており、有料部分が対象から外れています。

**英語分岐が `contentMdJa` を使っているのはバグではありません。** 言語は `match_content.language` の別列で、英語記事には英語本文が入ります。ここは触らないでください。

### 6. 日本語姓名の空白（A-3 6・P2）

`specs/fix-japanese-player-name-spacing.md`

`name_ja` を持つ 23 人のうち、空白あり 11 / なし 12 でほぼ半々です。

**空白を機械的に削除しないでください。** `Seungsin Lee` やカタカナの `リーチ マイケル` が壊れます。漢字・ひらがなの姓名だけを対象にしてください。

### 7. RWC2027 ブラケットの「準備中」（A-5・P1）

`specs/fix-rwc2027-bracket-pending-states.md`

RWC 2027 は 36 試合すべて `round` が null で、`round >= 5` のフィルタは必ず 0 件になります。**「チーム未確定」（大会の性質上そうであるだけ）と「日程未取得」を区別してください。**

**ノックアウト試合の取り込みは行いません。** 表示だけです。

### 9. AI ラベルの商品名統一と開示（A-6 5・P2）

`specs/fix-ai-label-product-naming.md`

10 箇所に `AI チャット` / `AIチャット` / `AI CHAT` が残っています。

**置換だけでは失敗です。** チャット画面に「回答が生成物である」旨の明示が現状ありません。`components/match-chat.tsx:21,25` は回答範囲の説明であって開示ではないので、流用しないでください。**置換すると透明性が現状より下がります。開示の追加とセットで行ってください。**

`app/pricing/page.tsx:84` の `uploadDate` は触らないでください（別 spec が扱います）。`:80` の `description` はこちらの担当です。

---

**仕様と現状が食い違うと判断したら、実装を止めて指摘してください。** 直前の #793 では、`live-competitions.ts` の `allSettled` で行き止まりになることを指摘してもらい、仕様の欠陥を直せました。
