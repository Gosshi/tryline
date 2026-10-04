# Touchline PR 3 — 動きの検証

基点: `origin/main` `12a3a625`（PR #910 のマージ後）。仕様書・指示書・決定記録は変更せず、依存パッケージの追加なし。
基準: `mock-a4.html` と `revision-a4.md` の Web の動き。iOS・データ取得・記事生成・動画制作は対象外。

## 実装した動き

| 場所 | 動き | 時間 | 繰り返し・停止 |
|---|---|---|---|
| トップの背景ポスター | 1.02→1.09倍のズーム、横移動 | 片道24秒／往復48秒 | 表示中だけループ。700px以下は静止 |
| トップの大見出し | 下から28px、opacity、clip-path | 0.4秒、2行なら0／100ms、3行なら0／80／160ms差 | 初回のみ。実際に同じ行へ並ぶ語は同時に動く |
| ティッカー | 2組の同じデータを横移動 | 40px/秒（1周の幅÷40秒） | 表示中だけループ。hover・focus-within・停止ボタンで停止 |
| トップの節・レビュー、大会ガイド、試合の記事見出し | 下から18px、opacity | 0.42秒 | 初回のみ。日程・順位を含む親をフェードさせない |
| 試合の行・順位表の行 | 下から5px、文字opacityは1 | 0.3秒、25msずつ、待ちは最大225ms | 初回のみ。遅い行も0.525秒で終了 |
| 試合ページのチーム色の面 | 左右からスライド | 0.5秒 | 初回のみ |
| 試合ページのスコア・順位表の勝点 | 固定幅・固定高の窓で数字列を0から移動 | 0.5秒 | 初回のみ。隠す設定の開示は即座に最終値 |
| 得点推移 | SVGの得点線・点のclip-pathを左から開く | 0.55秒 | 初回のみ。軸・ラベルは静止 |
| カード・試合の行 | チーム色の線を伸ばす／3px浮く | 線0.22秒、移動0.18秒 | 操作時。押下で1px沈み、0.995倍 |

`TouchlineMotion` が各ページの `main` を描画し、SSRの子要素を保持する。IntersectionObserverは有限の動きとループの2つ。有限の動きはWeakSetで実行済みを管理する。遅れて描かれる部品はMutationObserverで登録する。ループは画面外と別タブで停止。スクロールを操作・抑止するイベントは追加していない。

SSRには最終値が1つだけある。表示領域に入ったときだけ一時的な数字列をReactで描き、読み上げ用の最終値と、`aria-hidden`の数字窓に分ける。終了時には最終値1つへ戻す。数字列は最大61行で、毎フレームの数字更新はしない。外部のアニメーションライブラリ・連番画像は使っていない。

## モックと実データに合わせて判断した点

1. #910の「これからの試合」・最大4件・レビュー大1＋小2の構成を維持して動きを追加。今週だけの固定の試合へ戻していない。
2. 見出しは既存の3つの語のspanと文言を維持し、描画位置から行を判別して時間差を付ける。画像・書体・見出しの読み込みを待たせない。
3. 大会の各日程・全順位表はフェードさせず、行の移動だけ。上位の抜粋・プール別・開閉後の表にも同じ仕組みを適用し、時間差は225msで打ち切る。
4. 1試合・0試合も既存のデータのまま扱う。0件のティッカーは出さず、1件なら同じ1件の2組で流す。停止操作の領域はSSRから確保する。
5. ティッカーのスコア／隠す操作の窓を64pxに固定し、開示前後で2組の長さが変わらないようにする。複製の`aria-hidden`・`inert`・`tabIndex=-1`を維持。
6. 勝点の横の静的な最終値は追加しない。0点・負の勝点・整数でない値は静止。大きい値の途中の数字列は最大60段階に制限し、最後は実際の値にする。
7. ユーザー設定の取得が終わる前のスコアは数え上げない。ネタバレ防止オンで明示的に開示しても数え上げず、最終値を即時表示。設定が途中でオンになった場合は数字の部品を即座に外す。
8. 明るいチーム色の上の暗い文字は、スライド中に墨色の面へ重なると読めなくなる。チーム名・略称の下地に同じチーム色を静的に残し、既存の4.5:1以上の前景色を維持する。
9. 伸びる線には既存の`getTeamColor`を使う。国旗を表す`getTeamStripe`はグラデーションの場合があるため、線の色の指定には使わない。既存のバッジ・細い縦線は変更しない。
10. 得点線のパス・イベント・集計は変更せず、SVGのグループをclip-pathで開く。モックの3時点を結ぶ線は採用しない。イベント0件では新しい線や得点を作らない。
11. 共有部品が対象外のページで使われたときは数え上げず、最終値の静止表示。新しいhover効果とReduce MotionのCSSも3ページの範囲に限定する。対象ページ内の既存のLIVEの点滅は静止させ、追加したループをポスターとティッカーに限定する。

## 守ること1〜9

| 条件 | 確認 |
|---|---|
| 1. サーバーHTMLの試合リンク | 実際のSeasonMatchGroupsを42・5・15件のfixtureでSSRし、動きのmainで包む前後のリンク集合が完全一致。閉じた節のリンクを含む既存SSRテストも維持。これらの件数は検証用データであり、本番の再取得値ではない |
| 2. 計測 | `cta_id` 27→27、追加・削除なし。`cta_location`・TrackedLinkのanalytics引数を変更していない |
| 3. SEO | h1の文言・metadata・JSON-LD・revalidate・クエリを変更していない |
| 4. 有料部分 | 無料／有料の境目、PremiumRecapSection・PremiumMatchChat・SampleRecapCtaの分岐を変更していない。既存ページテストを維持 |
| 5. ニュースレター | 大会ページの配置を変更していない |
| 6. iOS案内 | IosAppCtaの条件を変更していない |
| 7. アクセシビリティ | 既存フォーカスを維持。停止ボタンは44px。数え上げの読み上げは最終値のみ。明るいチーム色はスライド中も文字の下地を維持 |
| 8. 密度 | 行の日時・対戦名・スコアの配置を維持し、hoverの線は絶対配置。チーム名の間の空白を増やしていない |
| 9. ネタバレ防止 | SpoilerScoreの設定・既定オフ・開示操作は維持。隠しているとき、開示時、数え上げ中に設定オンへ変えたときのテストを追加 |

```text
cta_id: 27 → 27
removed: []
added: []

同じfixtureのSSRの試合リンク集合:
top-14: 42 → 42、差なし
pnc: 5 → 5、差なし
six-nations: 15 → 15、差なし
```

本番とプレビューの生HTMLのリンク件数比較は未取得。先行作業の本番ブラウザアクセス拒否を維持し、再アクセスしていない。データ・リンクの生成処理は変更していない。

## ブラウザ確認

実際のTouchlineMotion・HomeMatchdayBoard・StandingsTable・MatchHeader・ScoreGraphを使う一時fixtureをSSRしてhydrateし、ローカルChromiumで確認。書体・画像はリポジトリのもの。試合・順位・イベントは検証用データであり、実データのNext.jsページの代わりに性能を合格とするものではない。一時fixtureとバンドルはPRに含めない。

| 確認 | 結果 |
|---|---|
| 通常のCSSアニメーション | ポスター24秒、ティッカー36秒、見出し0.4秒、行0.3秒、左右の面0.5秒、数字列0.5秒、線0.55秒を確認 |
| 動くプロパティ | Web Animationsのキーフレームでtransform・opacity・clip-pathのみ。レイアウトの幅・高さ・余白を動かしていない |
| 順位表の途中 | 各行のopacity=1、待ちは0／25／50ms。勝点の窓は1つ、別の可視の最終値なし |
| 390×844 | トップ・大会・試合すべてmain.scrollWidth=390。ポスターのanimation-name=none。順位表は幅332px |
| アプリJSを読み込まないSSR fixture | 3画面の見出し・行・スコア・勝点を表示。重要要素のopacity=0は0件、animation=0。勝点14／10／9、スコア42／38は最終値 |
| 停止状態のCSS/JS | 下記の代替メディア条件で3画面のanimation=0、running/loop-active=0、勝点・スコアは最終値。ティッカーの複製はdisplay:none |
| 隠す設定 | 試合のスコアの数字と数え上げは0件。開示クリックはブラウザツールの承認制限により未実施。開示・途中でオンへの切り替えは自動テスト成功 |
| 静止画像 | 1440×900と390×844のローカル表示をツール内で目視。画像ファイルの保存／PR添付と実データの撮影は未実施 |

ブラウザツールにはReduce Motionの設定がなく、Playwrightコネクターと専用headless Chromeも起動できなかった。代替確認は**検証用fixtureだけでメディア名をprefers-color-scheme:darkへ置き換え、JSのmatchMediaも同じ条件へ接続したもの**。製品コードはprefers-reduced-motion:reduceのまま。ネイティブのReduce MotionエミュレーションとブラウザのJavaScript無効設定自体は未確認。上のSSR確認はアプリのscriptを読み込まない方法。正式な確認手順を以下に残す。

### 正式なReduce Motion／JS無効確認手順

Playwrightを使える環境で、プレビューのトップ・大会・試合を確認する（未実行）。既存のログイン設定を持ち込まない新しいcontextで行う。

```js
const routes = [
  "/",
  "/c/top-14/2026-27",
  "/matches/3577d392-73ef-462f-b73c-d5e88f6e8e41",
];
// baseURLは検証するプレビューのURL。認証情報は出力しない。
const read = () => ({
  animations: [...document.querySelectorAll(".tl-scope [data-tl-motion], .tl-scope [data-tl-loop], .tl-scope [data-tl-lines], .tl-count-track, .tl-ticker-track")]
    .map(el => ({ name: getComputedStyle(el).animationName, duration: getComputedStyle(el).animationDuration })),
  hiddenCritical: [...document.querySelectorAll("h1,h2,[data-match-layout],tbody tr,.tl-number")]
    .filter(el => getComputedStyle(el).opacity === "0").length,
});
for (const javaScriptEnabled of [true, false]) {
  const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  if (javaScriptEnabled) await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of routes) {
    await page.goto(new URL(route, baseURL).href);
    await page.waitForLoadState("networkidle");
    const result = await page.evaluate(read);
    // hiddenCritical === 0。Reduce Motion時は全nameがnone、またはdurationが0。
    console.log({ route, javaScriptEnabled, ...result });
  }
  await context.close();
}
```

途中の数え上げは`reducedMotion:"no-preference"`で再読み込みし、0.5秒以内の数字の窓だけが表示されること、読み上げ用の最終値がsr-onlyであることを確認。終了後と再スクロールで数字列が残らず、再度動かないことを確認する。

## 自動テスト・変更したassert

- TouchlineMotionの14テスト: SSR、行に応じた見出しの時間差、1回だけの実行、途中の数字と最終値、Reduce Motion、途中の設定変更、行の時間差、タブ／画面外、停止ボタン、ネタバレ防止、未知の設定、異常に大きい数字、Observerなし。
- SeasonMatchGroups: 実部品を動きのmainで包んでも同じ42／5／15件のリンクをサーバーHTMLに保持する3テストを追加。
- 既存のケースは削除していない。勝点の書体のassertはMotionNumberの親のtdへ移動。カードの「style属性がない」は「background／backgroundColorを指定していない」へ変更（hoverの線用のCSS変数が増えたため）。紙色の面を維持する検証は残す。

### 壊して落ちる確認（復元済み）

共通の仕組みの`if (reduced.matches) continue;`を一時的に外すと、停止状態を確認するテストが失敗した。実行時点では11テスト中1失敗・10成功。復元後、追加テストを含む14テストが成功。

## コマンド・性能の範囲

- `pnpm lint`: 成功。
- `pnpm typecheck` (`tsc --noEmit`): 成功。buildと並行実行していない。
- `pnpm test`: 336ファイル／2284テスト成功。
- `pnpm build`: 最適化コンパイル成功（4.5秒）。`ECONNREFUSED 127.0.0.1:54321`で`/c/[competition]/[season]`のページデータ収集が失敗。build全体は未合格。ダミー値とローカルSupabase URLを使い、実際のキーや環境ファイルは扱っていない。

**本番／プレビューのLCP・CLSの各3回の中央値は未確認。**ローカルDBが未起動で実データのNext.jsページを確認できていない。静的fixtureの値を本番性能として記録しない。測定はspecの「測り方A」でプレビューを公開後にOwner／Claude Codeが行う。CLS>0.1、またはLCPが本番より0.5秒以上悪化した場合はマージしない。CodexはPR作成後にマージを待つ。


## PR #911 レビュー修正 — ティッカーのみ

36秒固定では試合数・文字の長さによって速さが変わるため、1周（最初の`.tl-ticker-lap`）の描画幅を測り、`--tl-ticker-duration`に「幅÷40秒」を設定する。測定できてからアニメーションと複製を表示する。測定前、JS未起動、Reduce Motionでは静止。window.resizeとResizeObserverでウィンドウ・文字幅の変化を再測定し、解除時にはObserver・イベント・CSS変数を片付ける。

選択元は従来の`weeklyMatches`のまま。終了試合をキックオフの新しい順、次のscheduled試合を早い順へ並べ、各4件を基本に合計8件まで。片方が4件未満なら他方で補い、同じmatch_idは重複させない。0件なら帯を出さず、キャンセル・開始済みの未終了試合を未来の試合として扱わない。データ取得・試合ボード・レビューの見た目は変更していない。PR 4の見た目の修正は含めず、Ownerの別依頼を待つ。

### 実測と自動テスト

2026-10-04 13:31 UTCに本番トップで確認できた20試合の公開されたチーム名・日時・スコアを用いた、一時的なローカルティッカーfixture。選択関数・TouchlineMotion・CSSは変更後の実装。Next.jsのプレビューページを測定した値ではなく、フォントの実配信の同一性も未確認。

| 確認 | 件数／1周の幅 | CSS変数 | computed animation-duration |
|---|---|---|---|
| ローカル390px、20件から選択後 | 8件／4,132.328125px | 103.308203125s | 103.308s |
| 単体テストの既知の幅 | 4,000px | 100s | CSS変数のassert成功 |
| 単体テストのリサイズ後 | 2,000px | 50s | CSS変数のassert成功 |

ローカル実測でも4,132.328125÷103.308203125＝40px/秒。元の20件・36秒の動きをプレビューで再取得した値は未確認。指定されたプレビューURLはブラウザでログイン画面へ転送され、既存タブへのアクセスも承認レビューで拒否された。Ownerから「確認はこちらで以後やる」と指示されたため、その後ブラウザの確認は行っていない。

修正前に失敗するテストを確認した（5失敗）。追加した7ケースは、4,000px→100秒、リサイズ→50秒、測定前／Reduce Motion／SSR、20件→終了4＋次4、片方のみの20件→8件（2ケース）、重複とキャンセル等、HomePageが20件を受け取ってもリンク8件＋複製8件にすること。既存の0件・1件・ネタバレ防止のテストは維持。

最終結果: `pnpm lint`・`pnpm typecheck`成功、`pnpm test`336ファイル／2291テスト成功。`pnpm build`はコンパイル成功（4.5秒）後、ローカルDB未起動の`ECONNREFUSED 127.0.0.1:54321`で`/c/[competition]/[season]/standings`のページデータ収集に失敗。`cta_id`27→27、差なし。依存追加なし。
