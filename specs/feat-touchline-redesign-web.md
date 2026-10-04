# デザイン刷新（Web）: THE TOUCHLINE を部品・ページ・動きの 3 本の PR で入れる

## 背景

D037（2026-10-04）で、Web と iOS アプリのデザインを THE TOUCHLINE（A4）に刷新すると決めた。第1弾の色と書体（`specs/feat-touchline-foundation-web.md`、PR #907）は本番に出ている。

残りを 1 回の依頼で進める。**見た目の仕様はモックそのもの**とする:
- 基準ビジュアル: `docs/notes/gpt-web-redesign-2026-10-03/mock-a4.html`（Web トップ／Web 大会／Web 試合の 3 タブ）
- 値と動きの一覧: 同フォルダの `revision-a4.md`
- 経緯: `result.md`・`revision-a2.md`・`revision-a3.md`

実装するのはモックを作ったのと同じ Codex のセッション。この spec の役割は見た目を言い直すことではなく、**モックが知らない実データの状態**と、**今の画面が守っている過去の修正**を漏れなく渡すこと。モックは 12 枚のスクリーンショットから作られており、開幕前・プール別・順位表なし・試合 0 件・有料部分の境目などは未確認（`result.md`「検証と未確認」）。

## スコープ

対象のページ:
- トップ（`app/page.tsx`）
- 大会シーズンページ（`app/c/[competition]/[season]/page.tsx`）
- 試合ページ（`app/matches/[id]/page.tsx`）
- これらが使う共有の部品と、全ページ共通のヘッダー・フッター

対象外（今回は触らない。後続で扱う）:
- カレンダー（`/calendar`、D020〜D023 の週ボード）・対戦成績（`/h2h`）・選手／チームページ・料金ページ・大会トップ（`/c/<大会>`）・RWC 2027 の専用ページ。**ただし共有の部品の見た目が変わる分は、これらのページにも及んでよい**（PR 1 の確認する画面に含める）
- ロゴ（「● Tryline」）・アイコン・`app/manifest.ts`・`viewport.themeColor`・OG 画像（D037 決定3）
- 紹介動画の制作と組み込み（D037 決定7。トップの動画の枠は静止画のポスターで作る）
- iOS アプリ（tryline-mobile で別 spec）
- データの取得・DB・LLM・メタデータ・JSON-LD

## PR の分け方

依頼は 1 回、PR は次の 3 本に分けて、**この順に**出す。各 PR は前の PR がマージされた最新の `origin/main` から切る。

| PR | 中身 | 主な対象 |
|---|---|---|
| 1. 部品 | 共有の部品の見た目（角丸・影・罫線・表・試合の行・チーム色の線・ボタン・ヘッダー／フッター）。見出しの太さを 800 にそろえる | `components/` の共有の部品、`app/globals.css`・`tailwind.config.ts` の角丸と影の変数 |
| 2. ページ | トップ・大会・試合の 3 ページの配置 | 3 つの `page.tsx` と、各ページ専用の部品 |
| 3. 動き | `revision-a4.md` の「動きの一覧」 | 動きの共通の仕組み（新規）と、各部品への適用 |

PR ごとに、下の「守ること」と「PR ごとの受け入れ条件」を満たす。

## 守ること（3 本すべて）

今の画面が過去の修正で守っている点。崩したら PR の受け入れ条件を満たさない。

1. **日程の試合リンクはサーバーの HTML に出す**（#749）。`SeasonMatchGroups` などを client 側でしか描かれない場所に移さない。生の HTML の試合リンクの数（下の「測り方 B」）が本番と同じであること。本番の値（2026-10-04、Claude Code）: `/c/top-14/2026-27` 42、`/c/pnc/2026` 5、`/c/six-nations/2027` 15。
2. **計測**: `TrackedLink` などの `cta_id` と `cta_location` の値を変えない。要素を移しても値はそのまま（GA4 の前後比較を切らないため）。`app/` と `components/` 全体の `cta_id` は 27 種類（2026-10-04 に下の受け入れ条件 3 のコマンドで数えた）。PR の前後で同じ集合であること。大会ページの「次戦」「最新レビュー」「日本代表の次戦」の計測（#832、`specs/feat-hub-content-transition-tracking.md`）も残す。
3. **SEO**: 各ページの `h1` の文言、`generateMetadata`、JSON-LD（パンくず・FAQ・試合）、`revalidate` を変えない。
4. **試合ページの有料部分**: レビューの無料部分と有料部分の境目、`PremiumRecapSection`・`PremiumMatchChat`・`SampleRecapCta` の出し分けの条件を変えない。見た目だけ変える。
5. **ニュースレターの位置**: 大会ページでは順位表より下（#905）。
6. **アプリの案内**: `IosAppCta` の表示条件（iPhone のみ、#903）を変えない。
7. **アクセシビリティ**: 色のコントラストは `design.md` の Accessibility の値を下回らない。フォーカスの見た目（`focus-visible`）を消さない。押せる場所は 44px 以上を目安。
8. **D020 の密度の考え方**: 試合の行で「チーム名の間に大きな空白」を作らない（A3 で直した「ボルドー 対 リヨン」をまとめる形）。
9. **スコアの公開**: Web は今どおりスコアを隠さない（スコアを隠す操作はアプリだけ）。

## PR 1: 部品

- `app/globals.css` の角丸と影の変数を A4 の値にする: 内容の角丸 3px、ピル型の操作 999px、影は原則なし（浮かせる必要のある所だけ `0 20px 45px #17191f1a`）。`--radius*` を参照せず `rounded-2xl` などを直書きしている共有の部品は、変数か A4 の値に置き換える。
- **見出しの太さを 800 にそろえる**: 見出し書体（Shippori Mincho B1）の要素で 700（`font-bold`）と 800 が混在し、明朝の書体ファイルがトップで 131 件読み込まれている（PR #907 の確認時に実測）。見出し書体の要素は 800 に統一し、`app/layout.tsx` の `Shippori_Mincho_B1` の `weight` を `["800"]` にする。
- 対象の共有の部品（使われている所）: `site-header`・`site-footer`（全ページ）、`standings-table`（トップ・大会・試合・順位表ページ・RWC 2027）、`match-card`・`season-match-groups`・`home-matchday-board`（試合の行）、`featured-competition-card`、`tracked-link` のボタンの見た目、`newsletter-signup`、`ios-app-cta`、`premium-upsell-banner`。コンポーネントの中の直書きの色（`bg-white`・`border-slate-*`・`bg-[#f8fafc]` など）は第1弾の変数に置き換える。
- チーム色: 試合の行と順位表の行で、チーム名の左に A4 と同じ細いチーム色の線を付ける。色は `lib/format/team-identity.ts` の既存の値を使う（新しい色を足さない）。
- ヘッダーのロゴの見た目は変えない。ヘッダーの背景・ナビのピルは A4 に合わせてよい。

## PR 2: ページ

### 大会シーズンページ

`specs/feat-touchline-hub-layout-web.md` の UI サーフェスと受け入れ条件をそのまま使う（並び順・低い帯・墨色をかけた写真・2 列・下線のタブ・1 画面目の基準・未解決の質問 1 は Owner 回答済み: 待たずに出す）。PR 1 の後なので、同 spec の「対象外: 共有の部品の中身」は PR 1 で済んでいる前提で読み替える。

### トップ

モックの「Web トップ」に合わせる:
- 最上部: 全幅の墨色の面に明朝の大見出し（文言は今の「今週の海外ラグビーを、日本時間で追う。」のまま）。紹介動画の枠は**静止画のポスター**で作る（後で動画に差し替える。寸法を最初から確保して CLS を出さない）。ポスターの画像は今のトップの写真（`/visuals/home-hero.jpg`）を使い、新しい生成画像は足さない。
- ティッカー（試合と結果が横に流れる帯）: 中身は今週の試合のデータ（`home-matchday-board` と同じ取得結果）から作る。モックの 4 試合を固定で書かない。0 件のときは帯ごと出さない。繰り返し用に複製した 2 組目は `aria-hidden="true"` と `tabIndex={-1}` にし、リンクが重複して読み上げられないようにする。
- 今週の試合: 2 列、チーム名をまとめて左寄せ。
- 最近のレビュー: 1 本を大きく（チーム色の面）、残りを小さく。レビューが 1 本しかない・0 本の状態でも崩れないこと。
- 注目大会: 墨色の面。

### 試合ページ

モックの「Web 試合」に合わせる:
- スコア帯: 左右をそれぞれのチーム色の面、スコアの箱は墨色。チーム色が無いチーム（`team-identity` に無い）は今のデフォルトの色を使う。
- 本文と要点の 2 列（`lg` 以上）。本文の幅は 1 行 38〜42 字（`revision-a4.md`・`result.md` の値）。
- **得点推移のグラフは今の実データ（`match_events`）の階段状の線のまま**。モックの「主要 3 時点を結ぶ補助線」は採用しない（モックの制約で作ったもの）。
- 有料部分・チャット・次に見る・ラインナップ・試合経過の各ブロックは、中身と出し分けを変えずに見た目だけ合わせる（守ること 4）。

## PR 3: 動き

`revision-a4.md` の「動きの一覧」の Web の行を入れる。ただし次を守る（D037 決定5）:
- 動かすのは `transform`・`opacity`・`clip-path`・SVG の線だけ。レイアウトが動く値（幅・高さ・余白・`top` など）は動かさない。スクロールを乗っ取らない。
- 1 回動いたら止まる。ループするのはトップのポスターとティッカーだけ。ティッカーには停止ボタンを付け、マウスを乗せる・フォーカスで止まる。
- `prefers-reduced-motion: reduce` では全部止め、最終状態で表示する。ティッカーは 1 組だけの静的な表示にする。
- **JavaScript が無くても、サーバーの HTML の段階で文字・数字は最終状態で読める**こと。動きは JS が読み込まれた後に、表示領域に入った要素にだけかける（初期状態を `opacity: 0` にしてサーバーの HTML に出さない）。
- スコアと勝点の数え上げは 0.5 秒以内で最終値まで。**数え上げの横に最終値を重ねて出さない**（A4 の大会ページの勝点の二重表示は不採用、D037 決定5）。読み上げには最終値だけを渡す（数え上げの数字の列は `aria-hidden`）。
- 動きの共通の仕組み（表示領域に入ったら 1 回だけクラスを付ける hook か小さな client の部品）を 1 つ作り、各所はそれを使う。外部のライブラリは足さない。

## データモデル変更

なし。

## API サーフェス

なし。

## LLM 連携

なし。

## PR ごとの受け入れ条件

### 3 本すべて

1. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る（CI の `validate` が緑）。
2. 守ること 1: 測り方 B の結果を本番とプレビューで並べて PR 本文に貼る。数が同じ。
3. 守ること 2: `rg -o 'cta_id: "[a-z_]+"' app components | sed 's/.*cta_id/cta_id/' | sort -u` の結果（2026-10-04 時点で 27 行）が PR の前後で同じ。差分を PR 本文に貼る（差が無ければ「差なし」と書く）。
4. 既存のテストは消さない。落ちる assert は新しい期待値に書き換え、PR 本文に一覧を書く。
5. 確認する画面のスクリーンショット（1440×900 と 390×844）を PR 本文に貼る。プレビューにアクセスできない場合はそう書けばよい（Claude Code が Owner のブラウザで撮る）。**Owner が見てからマージする。**
6. 性能: 測り方 A で、プレビューの LCP と CLS を測り、本番の値と並べて PR 本文に貼る。CLS が 0.1 を超えたら、または LCP が本番より 0.5 秒以上悪化したら、マージせず Owner に報告する。

### PR 1

- 確認する画面: トップ・`/c/top-14/2026-27`・試合ページ（`/matches/3577d392-73ef-462f-b73c-d5e88f6e8e41`）・`/c/top-14/2026-27/standings`・`/calendar`・`/h2h/japan-vs-usa`・`/pricing`（共有の部品が及ぶページ）。
- 見出し書体の要素に `font-bold`（700）が残っていないこと。`app/layout.tsx` の `Shippori_Mincho_B1` が `weight: ["800"]`。トップの明朝の書体ファイルの数を、PR #907 の確認と同じ方法（`specs/feat-touchline-foundation-web.md` の「訂正」の方法）で測り、131 件から減っていることを PR 本文に書く。

### PR 2

- 大会ページ: `specs/feat-touchline-hub-layout-web.md` の受け入れ条件 1〜11。
- トップ: ティッカーの中身がデータから作られている（今週の試合が 0 件の状態をテストで描き、帯が出ないこと）。複製した 2 組目のリンクが `aria-hidden` と `tabIndex=-1`。レビューが 0 本・1 本・3 本以上のそれぞれで描けるテスト。
- 試合ページ: チーム色が無いチームでスコア帯が描ける。有料部分の出し分けの既存テストがそのまま通る。
- 確認する画面: トップ、大会ページの 5 つ（hub spec の「確認する画面」）、試合ページは次の 3 つ: レビューあり（`/matches/3577d392-73ef-462f-b73c-d5e88f6e8e41`）、プレビューだけの試合前の試合（PR 作成時点の今週の試合から 1 つ）、イベント 0 件の終了した試合（`/matches/` で URC 2026-27 第1節の金曜の試合から 1 つ）。

### PR 3

- `prefers-reduced-motion: reduce` をエミュレートした状態（Playwright の `emulateMedia({ reducedMotion: "reduce" })`）で、各ページの動きの対象の要素に `animation-name` が付いていない、または長さが 0 であることを確かめるテストか確認の手順を PR 本文に書く。
- JavaScript を無効にした状態（Playwright の `javaScriptEnabled: false`）でトップ・大会・試合を開き、見出し・試合の行・スコア・勝点が読める（`opacity` が 0 の要素が無い）ことを PR 本文に書く。
- 数え上げの途中で、最終値が別の場所に重ねて出ていないこと（大会ページの勝点）。
- 「壊して落ちる」確認（コミットしない）: 動きの共通の仕組みで、reduced-motion の分岐を外すと上の確認が失敗すること。

## 測り方

### A. LCP と CLS

ページを開く前に次を登録し、`networkidle` の後 3 秒待ってから値を読む。1440×900、キャッシュなしの新しいコンテキスト、各ページ 3 回の中央値。
```js
window.__vitals = { lcp: 0, cls: 0 };
new PerformanceObserver(l => { for (const e of l.getEntries()) window.__vitals.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__vitals.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
```
（Playwright では `page.addInitScript` で登録する）。対象: トップ・`/c/top-14/2026-27`・試合ページ。プレビューが保護されていて測れない場合はそう書く（Claude Code が Owner のブラウザで測る）。

### B. 生の HTML の試合リンクの数

```
for p in /c/top-14/2026-27 /c/pnc/2026 /c/six-nations/2027; do
  echo "$p $(curl -s <ホスト>$p | grep -o 'href="/matches/[0-9a-f-]*"' | sort -u | wc -l)"
done
```

## 未解決の質問

- なし（D037 と、大会ページの #905 との重なりは Owner 回答済み: 待たずに出す。出した日に Claude Code が GA4 に注釈を入れる）。
