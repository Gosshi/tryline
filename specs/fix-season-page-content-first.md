# fix-season-page-content-first: シーズンページで試合情報を先に見せる（ニュースレター登録を下げ、重複する要約をまとめる）

## 背景

2026-09-30、ChatGPT に Web 版のデザインレビューを依頼した。指摘のうち、**着地の多い面に効くもの**だけを本 spec の対象にする。

### 着地の実測（GA4、直近28日、landingPage）

| 面 | セッション |
|---|---:|
| 大会シーズンページ（`/c/[competition]/[season]` と節ページ） | 約278（全体の約6割） |
| 試合詳細 | 約57 |
| H2H | 約49 |
| トップ | 44 |
| チーム／カレンダー／料金 | 4／2／1 |

シーズンページ上位: `/c/pnc/2026` 72、`/c/six-nations/2027` 64、`/c/greatest-rivalry/2026` 45、`/c/nations-championship/2026` 23。11月の日本代表欧州遠征で、この面の着地がさらに増える見込み。

### 問題 1: ニュースレター登録が、日程・順位表より上にある

`app/c/[competition]/[season]/page.tsx` の表示順（2026-09-30 時点）:

1. ヒーロー（写真・大会名・期間）
2. ヒーロー下の帯（首位・進行・次節）`:862-908`
3. カレンダー登録リンク・「今週の全試合を見る」`:910-930`
4. **`<NewsletterSignup source="competition" />`** `:931-933`（`<header>` の中）
5. `SeasonSwitcher`
6. `SeasonSummaryBand`（次戦・首位・最新レビュー・日本代表の次戦）
7. `JapanMatchesBlock`
8. `IosAppCta`
9. ページ内ナビ
10. `#schedule`（日程・結果）`:998`
11. `#standings`（順位表）`:1086`
12. `#guide`（視聴方法・大会ガイド）

**`email_subscribers` は全期間で 1 件（source = `calendar`）。source = `competition` からの登録は 0 件**（2026-09-30、本番 DB で `select source, status, count(*) from email_subscribers group by 1,2` を実行）。位置を下げて失う登録はない。

### 問題 2: 同じ情報が 2 か所に出ている

| 情報 | ヒーロー下の帯 `:862-908` | `SeasonSummaryBand` `:350-470` |
|---|---|---|
| 首位 | `leaderLabel` | `leaderLabel`（同じ値） |
| 次の試合 | 「次節 第N節」＋キックオフ（`getSeasonProgress().nextMatch`） | 「次戦」＋対戦＋キックオフ（`findNextScheduledMatch(matches)`） |

**次の試合は、2 か所で算出方法が違う。**

- ヒーロー下の帯: `getSeasonProgress`（`:168-208`）が、**未終了の試合を含む最初の節**の、キックオフ最早の試合を返す。キックオフ済みで `status` が `finished` になっていない試合（延期・結果未取り込み）も対象になる。
- `SeasonSummaryBand`: `findNextScheduledMatch`（`lib/format/season-summary.ts:19-34`）が、`status === "scheduled"` かつキックオフが現在以降の試合のうち最早を返す。

このため、2 か所が**別の試合を指すことがある**。また、ヒーロー下の帯は `第{nextRound}節` をそのまま出すため、節番号が 101 などで振られている大会（例: `/c/pnc/2026/round/101` が存在する）で「第101節」と出うる。

### 対象外とした指摘（再提起しない）

- **「日程が第1節から並ぶので、最新節から見せる」**: 実装済み。`components/season-match-groups.tsx` の `getDefaultOpenGroupIndexes`（`:86-105`）が最新の前後 1〜3 節を開き、`:154-165` の `useEffect` で自動スクロールする（節が 10 以上ある大会のみ。`shouldCollapseRoundGroups` `:47-54`）。静止画のキャプチャではスクロール位置が写らないため誤読されやすい（`feat-season-page-ia.md` の「事前確認」と同じ）。
- **「本文幅を 650〜760px に」**: 試合本文はすでに `max-w-3xl`（768px、`components/match-content.tsx:377`）。
- チームページ・カレンダー・料金ページの再設計: 着地が 28 日で合計 7 セッションのため後回し。
- 試合ごとの見出し（得点の山場を見出しにする案）: 別 spec で検討する。

## スコープ

**対象:**
- `app/c/[competition]/[season]/page.tsx` のみ
  - ニュースレター登録の位置の移動
  - ヒーロー下の帯から「次節」のセルを削除
  - `SeasonSummaryBand` から「首位」を削除

**対象外:**
- `components/newsletter-signup.tsx` の中身・文言・計測
- `components/season-match-groups.tsx`（自動展開・自動スクロールは変更しない）
- 大会トップ（`app/c/[competition]/page.tsx`）、節ページ（`/round/[round]`）、トップページ
- `JapanMatchesBlock`・`IosAppCta`・ページ内ナビの位置
- `getSeasonProgress` の算出方法の変更（「進行」の表示には引き続き使う）
- 色・余白・フォントの変更

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

### 1. ニュースレター登録を下げる

- `<header>` 内の `<div className="mt-5"><NewsletterSignup source="competition" /></div>`（`:931-933`）を削除する。
- 同じ `<NewsletterSignup source="competition" />` を、**`#standings` の節の直後、`#guide` の直前**に置く。順位表の節が無いとき（`hasStandings` が false）は、`#schedule` の節の直後、`#guide` の直前になる（どちらの場合も「`#guide` の直前」で一か所に書ける）。
- `source` の値は `"competition"` のまま変えない（計測の区分を保つ）。
- 外側の余白は、前後の節と同じく親の `gap` に任せる。`mt-5` のような個別の余白は付けない。

### 2. ヒーロー下の帯: 「首位」「進行」だけにする

- `:895-907` の `seasonProgress?.nextMatch` の `<Link>`（「次節 第N節」）を削除する。
- 帯を出す条件を `(leaderLabel || seasonProgress)` にする（今は `seasonProgress?.nextMatch` も含む）。
- 列数は、出すセルの数に合わせる。2 つ（首位と進行）なら `sm:grid-cols-2`、1 つなら列指定なし。今の `leaderLabel ? "sm:grid-cols-3" : "sm:grid-cols-2"` を置き換える。

### 3. `SeasonSummaryBand`: 「首位」を外す

- `items` から `leaderLabel` の項目（`:385-392`）を削除する。`leaderLabel` の props も不要になるので外す。
- 残る項目は「次戦」「最新レビュー」「日本代表の次戦」の最大 3 つ。
- `lg:grid-cols-4` を `lg:grid-cols-3` にする（`sm:grid-cols-2` はそのまま）。

### 変更後の表示順

1. ヒーロー
2. ヒーロー下の帯（首位・進行）
3. カレンダー登録リンク・「今週の全試合を見る」
4. `SeasonSwitcher`
5. `SeasonSummaryBand`（次戦・最新レビュー・日本代表の次戦）
6. `JapanMatchesBlock`
7. `IosAppCta`
8. ページ内ナビ
9. `#schedule`
10. `#standings`（ある場合）
11. **`NewsletterSignup`**
12. `#guide`

## LLM 連携

なし。

## 受け入れ条件

テストは `tests/app/season-page-ia.test.tsx` に足す（既存の `follows()` ヘルパー `:187-191` を使う）。

1. **ニュースレターの位置（順位表あり）:** 順位表のある大会のモックで描画したとき、ニュースレター登録のフォーム（`screen.getByLabelText("メールアドレス").closest("form")`。取得方法は既存の `tests/components/newsletter-funnel-instrumentation.test.tsx:78-81` と同じ）が、`#standings` の要素より**後**、`#guide` の要素より**前**にあり、`<header>` の中に**無い**。
2. **ニュースレターの位置（順位表なし）:** `standings` と `poolStandings` を空にしたモックで、ニュースレター登録が `#schedule` より後、`#guide` より前にある。
3. **首位は 1 か所:** 順位のある（`played > 0`）モックで、`screen.getAllByText("首位")` の件数が **1**。その 1 件は `getByLabelText("シーズン要約")` の**中に無い**。
4. **次の試合のリンクは 1 か所で、`findNextScheduledMatch` の結果を指す:** 次の 2 試合を含むモックで検証する。
   - 試合 A: 第1節、キックオフが現在より前、`status: "scheduled"`（未終了のまま残った試合）
   - 試合 B: 第2節、キックオフが現在より後、`status: "scheduled"`

   このとき、(a) ページ内に「次節」という文字列が**無い**（`queryByText(/次節/)` が null）、(b) 「次戦」の項目のリンク先が試合 B の `/matches/<B の id>` である。
   現在は (a) で失敗する（ヒーロー下の帯が第1節の試合 A を「次節 第1節」として出す）。
5. **`SeasonSummaryBand` の列:** 3 項目のとき `lg:grid-cols-3` を持ち、`lg:grid-cols-4` を持たない。既存の `:985` の assert（`toHaveClass("lg:grid-cols-4")`）は、この条件に合わせて書き換える。
6. **既存のテストは消さない。** 本 spec の変更で落ちる assert は新しい期待値に書き換え、PR 本文に一覧（ファイル・行・変更前→変更後）を書く。書き換える前に、`grep -n "首位\|次節\|lg:grid-cols-4\|NewsletterSignup\|newsletter" tests/app/season-page-ia.test.tsx` の出力を PR 本文に貼る（**標準エラーを捨てない**）。
7. **壊して落ちる確認（コミットしない）:**
   - ニュースレター登録を `<header>` の中に戻すと、条件 1 のテストが落ちる。
   - `SeasonSummaryBand` に首位の項目を戻すと、条件 3 のテストが落ちる。
   - ヒーロー下の帯の「次節」のリンクを戻すと、条件 4 のテストが落ちる。

   それぞれの失敗の出力を PR 本文に貼る。
8. **画面の確認:** ローカル（`pnpm dev`）で `/c/pnc/2026` と `/c/top-14/2026-27` を、幅 1440 と 375 で撮影する。撮影の方法は Playwright 等でよい。
   - 見るのは、ニュースレター登録が順位表の下にあること、首位が 1 か所であること、ヒーロー下の帯の見た目が崩れていないこと。
   - 画像は PR に添付するか、保存先を書く。
9. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` が通る。**すべて実行し、結果を完了報告に含める。**

## 未解決の質問

なし。効果は、11月のシーズンページで「ハブ → 試合ページ」の遷移率（`feat-hub-content-transition-tracking` で計測済み）を変更前と比べて見る。
