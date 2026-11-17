# 大会ページのタイトル・説明文を、検索した人の知りたいことに合わせる

## 背景

最大の流入元は Bing です。Bing Webmaster Tools（2026-08-28〜11-13 の週次集計を合算、2026-11-16 取得）で、大会ページは表示されているのにクリックされていないものがあります。

| ページ | 表示 | クリック | CTR | 平均順位 | 主な検索語 |
|---|---:|---:|---:|---:|---|
| `/c/rwc/2027` | 1,149 | 4 | 0.3% | 7.9 | 「ラグビーワールドカップ 2027」517 表示・1 クリック・7.8 位 |
| `/c/league-one` | 187 | 1 | 0.5% | 8.1 | 「リーグワン ラグビー 日程」89 表示・0 クリック・8.5 位 |
| `/c/lipovitan-challenge-cup` | 264 | 7 | 2.7% | 6.9 | |
| `/c/pnc` | 149 | 3 | 2.0% | 7.9 | |
| 参考: `/c/nations-championship/2026` | 1,294 | 105 | 8.1% | 5.9 | |
| 参考: `/c/pnc/2026` | 1,723 | 100 | 5.8% | 6.1 | |

本番のタイトル・説明文（2026-11-17 確認）の問題:

1. **`/c/rwc/2027`** のタイトルは「日程・出場国・日本語ガイド」、説明文は掲載項目の列挙だけ。日本の読者がいちばん知りたい「日本代表はいつ・誰と」と「日本時間」が無い。説明文の「放送・視聴情報」は、日本の放送局が未発表なので根拠が無い
2. **大会トップ `/c/{family}`** の説明文は全大会共通の定型（「最新シーズンの順位表・日程・試合結果と、日本での視聴方法を掲載。」）。リーグワンなら「12月12日開幕」「J SPORTS・DAZN で全試合」という答えを、ページは持っているのに説明文に出していない
3. **終了したシーズンの説明文が「日本語レビュー・日本語レビュー」と重複**している。例: `/c/pnc/2026`（Bing 表示 1 位のページ）「…の全試合結果・日本語レビュー・日本語レビューを掲載。」。原因は `app/c/[competition]/[season]/page.tsx:239` の題名「全試合結果・日本語レビュー」に、`:337` の `suffix` が「日本語レビュー」をもう一度足すこと

## スコープ

対象:
- `/c/rwc/2027` のタイトル・説明文
- 大会トップ `/c/{family}` のタイトル・説明文
- シーズンページ `/c/{family}/{season}` の説明文（重複の修正と、大会単位の視聴情報の 1 文）

対象外:
- ページ本文・見出し（h1）・構造化データ
- 試合ページ・対戦成績ページ・節ページ
- `COMPETITION_DESCRIPTIONS`（大会の紹介文）の中身
- 英語ページ

## データモデル変更

なし。

## API サーフェス

### 共通: 大会単位の視聴情報の 1 文（`lib/format/season-summary.ts`）

```ts
export function formatCompetitionBroadcastSentence(
  broadcastsByMatch: Map<string, MatchBroadcast[]>,
): string | null
```

- `scope: "competition"` の行だけを見て、サービス名を `displayOrder` → 名前の順に「・」でつなぎ、`{names}で全試合を視聴できます（{M月D日}確認）。` を返す。無ければ `null`
- 日付と並び順は、`getSeasonBroadcastGuide` の大会単位の文と同じ算出にする。`getSeasonBroadcastGuide` はこの関数を使うように書き換え、**今の `answer` の文字列は 1 文字も変えない**（既存テストで確認）

例: `J SPORTS（BS）・J SPORTSオンデマンド・DAZNで全試合を視聴できます（11月16日確認）。`

### 1. `/c/rwc/2027`（`app/c/rwc/2027/page.tsx:33`）

静的な `metadata` を `generateMetadata` に置き換える。日本戦はページ本体と同じく `listMatchesForCompetition` の結果から `isJapanMatch`（同ファイル）で取る。

- タイトル: `ラグビーワールドカップ2027 日程（日本時間）・日本代表の試合・出場国`
- 説明文: `${RWC2027_TOURNAMENT_DATES}にオーストラリアで開催。日本代表は${対戦相手（日付）を「・」でつなぐ}と対戦。全${RWC2027_TOURNAMENT_MATCH_COUNT}試合の日程を日本時間で掲載し、プール順位表・決勝トーナメント表も確認できます。`
  - 対戦相手は日本以外のチームの `name`（`MatchListItem` が日本語名を持つ。2026-11-17 時点でサモア・フランス・アメリカ）、日付は JST の `M月D日`。キックオフ順
  - 日本戦が 0 件、または取得がエラーのときは、日本代表の文を省き、`${RWC2027_TOURNAMENT_DATES}にオーストラリアで開催。全${…}試合の日程を日本時間で掲載し、プール順位表・決勝トーナメント表も確認できます。` にする（エラーは `console.error`。ページを落とさない）
- 「放送・視聴情報」は説明文に入れない（日本の放送局が未確認のため）
- `openGraph` を今の設定で持っているなら、同じ文に揃える。持っていなければ足さない

期待値（2026-11-17 のデータ）:
`2027年10月1日〜11月13日にオーストラリアで開催。日本代表はサモア（10月3日）・フランス（10月9日）・アメリカ（10月15日）と対戦。全52試合の日程を日本時間で掲載し、プール順位表・決勝トーナメント表も確認できます。`

### 2. 大会トップ `/c/{family}`（`app/c/[competition]/page.tsx:85`）

`generateMetadata` で、ページ本体と同じ手順で最新シーズンを決める（`listSeasonsByFamily` → `selectLatestSeasonWithMatches` → `listMatchesForCompetition` → `getMatchBroadcastsForMatches`）。

- タイトル: `${name} ${最新シーズンの season} 日程・順位表・日本での視聴方法`
  - 例: `ジャパンラグビー リーグワン 2026-27 日程・順位表・日本での視聴方法`
  - `lipovitan-challenge-cup` の特別なタイトルは今のまま
  - 最新シーズンが決まらない（0 件・エラー）ときは今のタイトル（`${name} 順位表・日程・日本での視聴方法`）
- 説明文: 次の順に連結する
  1. シーズンの 1 文（`getCompetitionHubState(matches)` で分ける。`competitionTitle` は `formatCompetitionTitle(latestSeason, latestSeason.season)`）
     - `pre`: `${competitionTitle}は${最初のキックオフの JST M月D日}開幕、全${中止以外の試合数}試合の日程を日本時間で掲載。`
     - `active`: `${competitionTitle}の最新結果・次の試合・日程を日本時間で掲載。`
     - `post`: `${competitionTitle}の全試合結果を掲載。`
     - `information`・最新シーズンが決まらない: なし
  2. `formatCompetitionBroadcastSentence(broadcastsByMatch)`（`null` ならなし）
  3. 今の `overview`（`COMPETITION_DESCRIPTIONS` か既定文）
  4. 今の結び「最新シーズンの順位表・日程・試合結果と、日本での視聴方法を掲載。」は、1 が出たときは付けない。1 が出ないときは今どおり付ける
- データ取得のエラーは `console.error` し、今のタイトル・説明文で返す（ページを落とさない）

期待値（リーグワン、2026-11-17 のデータ）:
`ジャパンラグビー リーグワン 2026-27は12月12日開幕、全101試合の日程を日本時間で掲載。J SPORTS（BS）・J SPORTSオンデマンド・DAZNで全試合を視聴できます（11月16日確認）。ジャパンラグビー リーグワンは、日本の最高峰クラブが争う国内プロラグビーリーグです。シーズンを通じて上位進出と優勝を争います。`

### 3. シーズンページ `/c/{family}/{season}`（`app/c/[competition]/[season]/page.tsx`）

- **重複の修正**（`formatCompetitionHubDescription`、`:318` 付近）: `metadataCopy.title` に「日本語レビュー」が含まれるときは、`details` に「日本語レビュー」を足さない。順位表の扱いは変えない
  - 修正後の例: `パシフィック・ネーションズカップ 2026はアメリカ・カナダ・フィジー・日本が参加する全4試合。2026/9/12〜2026/9/19の全試合結果・日本語レビューを掲載。`
- **視聴情報の 1 文**: `generateMetadata`（`:481`）で `getMatchBroadcastsForMatches(matchIds)` を読み、`formatCompetitionBroadcastSentence` が `null` でなければ説明文の末尾に足す
  - 例（リーグワン 2026-27）: `ジャパンラグビー リーグワン 2026-27は12チームが参加する全101試合。2026/12/12〜2027/5/9の日程・見どころを掲載。J SPORTS（BS）・J SPORTSオンデマンド・DAZNで全試合を視聴できます（11月16日確認）。`
  - 視聴情報の取得エラーは `console.error` し、1 文を省く
- タイトルは変えない

## UI サーフェス

なし（`<title>`・`<meta name="description">`・OG の文だけ）。

## LLM 連携

なし。

## 受け入れ条件

1. `formatCompetitionBroadcastSentence` が、大会単位の行 3 件で上の例と完全一致を返し、試合単位の行だけ・0 件では `null`
2. `getSeasonBroadcastGuide` の既存テストが、期待値を変えずに通る
3. `/c/rwc/2027` の `generateMetadata` が、日本戦 3 試合のモックで上の期待値と完全一致の説明文、上のタイトルを返す。日本戦 0 件・取得エラーのときは日本代表の文が無い説明文を返し、例外を投げない。説明文に「放送」「視聴」が含まれない
4. `/c/league-one` の `generateMetadata` が、`pre` 状態・101 試合・大会単位の行 3 件のモックで上の期待値と完全一致の説明文とタイトルを返す。`active`・`post`・`information` の各状態で 1 文目が仕様どおり（`information` では今の結びが付く）。`lipovitan-challenge-cup` のタイトルが今のまま。データ取得エラーで今のタイトル・説明文を返す
5. `/c/pnc/2026` 相当（`post`・recap あり・順位表なし）の説明文に「日本語レビュー」がちょうど 1 回だけ含まれ、上の修正後の例と完全一致。順位表ありの `post` では「全試合結果・日本語レビュー・順位表を掲載。」のように順位表は残る（今の並びのまま）
6. シーズンページの説明文に、大会単位の行があるときだけ視聴情報の 1 文が付く
7. **`generateMetadata` に依存を足すと、同じ関数を呼ぶ既存テストのモックが足りずに落ちることがある**（PR #636 で発生）。`tests/app/` で `generateMetadata` を呼ぶ既存テストを `rg "generateMetadata" tests/app` で洗い出し、モックを足す。既存の期待値は変えない（重複の修正で変わる 1 件だけは、変更理由を PR 本文に書く）
8. **壊して落ちる確認**（PR 本文に出力を貼る。コミットしない）: (a) 重複の修正を外す → 条件 5 が落ちる、(b) 大会トップの 1 文目を外す → 条件 4 が落ちる
9. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` が通り、CI が緑
10. PR 本文に、プレビュー環境の `/c/rwc/2027`・`/c/league-one`・`/c/league-one/2026-27`・`/c/pnc/2026` の `<title>` と description を貼る（SSO で開けなければ保留と書く。Claude Code が確認する）

## 競合とマージ順

- 触るファイル: `app/c/rwc/2027/page.tsx`、`app/c/[competition]/page.tsx`、`app/c/[competition]/[season]/page.tsx`、`lib/format/season-summary.ts`、テスト
- 進行中の spec で同じファイルを触るものはない（2026-11-17 時点）

## 本番操作

なし。

## 効果の測り方（Claude Code が行う）

- 2026-12-14 頃に `tools/bing-pull.ts` で取り直し、上の表の 4 ページの CTR を比べる（表示回数が 100 未満のページは判断しない）
- RWC 2027 は 2027 年に向けて関心が上がるので、表示回数の増減ではなく CTR で見る。順位が大きく動いた場合は CTR の比較から外す

## 未解決の質問

なし。
