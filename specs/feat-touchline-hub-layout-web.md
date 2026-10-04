# デザイン刷新 第2弾（Web）: 大会シーズンページで日程と順位を 1 画面目に出す

> **2026-10-04 追記**: この spec は単独では実装しない。全体の spec `specs/feat-touchline-redesign-web.md` の **PR 2（ページ）の大会ページの節**として使う。下の「対象外: 共有の部品の中身」は、全体の spec の PR 1 で済んでいる前提で読み替える。未解決の質問 1 は Owner 回答済み（待たずに出す）。

## 背景

D037（2026-10-04）で THE TOUCHLINE（A4）への刷新を決め、第1弾（色と書体、PR #907）は本番に出た。第2弾は、GPT の移行計画の 2 番「大会シーズンページ：見出しを短くし、日程と順位を先頭へ」。基準ビジュアルは `docs/notes/gpt-web-redesign-2026-10-03/mock-a4.html` の「Web 大会」タブ。

大会シーズンページ（`/c/<大会>/<シーズン>`）は、検索から最初に着地するページで一番多い（GA4 直近 28 日の着地上位は `/c/pnc/2026` 70、`/c/six-nations/2027` 68 セッション）。来る人は日程・結果・順位を見に来ている。ところが今は、写真のヒーロー（高さ 256〜288px＋白い帯）、シーズンの切り替え、要約の帯、日本代表の試合、アプリの案内、ページ内ナビが日程より上にあり、日程も順位も 1 画面目に入らない。

**本番の実測（2026-10-04、Claude Code、下の「測り方」）:**

| ページ | 幅 | 最初の試合リンクの下端 | 順位表の上端 | 画面の高さ |
|---|---|---|---|---|
| `/c/top-14/2026-27` | 1440 | 1,531px | 5,674px | 900 |
| `/c/top-14/2026-27` | 390 | 1,761px | 8,790px | 844 |
| `/c/six-nations/2027` | 1440 | 1,322px | 3,229px | 900 |
| `/c/pnc/2026` | 1440 | 1,679px | （順位表なし） | 900 |

A4 のモックでは、1440px で最初の試合が 623px、順位表も 1 画面目に入っている（`revision-a4.md`）。

## スコープ

対象:
- `app/c/[competition]/[season]/page.tsx` の**並び順とページ内の配置だけ**
  - ヒーローを低い帯にする（写真は残し、上にかける色を墨色にする）
  - デスクトップ（`lg` 以上）で日程と順位表を左右 2 列に並べる
  - 要約の帯・アプリの案内を日程と順位表の後ろへ移す
  - ページ内ナビを下線のタブにする
- `tests/app/` の大会シーズンページのテストの更新

対象外（この PR では触らない）:
- **共有の部品の中身**（`components/season-match-groups.tsx` は下の「2b」の範囲だけ変更してよい。2026-10-04 改訂）: `components/standings-table.tsx`・`components/season-switcher.tsx`・`components/japan-matches-block.tsx`・`components/ios-app-cta.tsx`・`components/competition-calendar-links.tsx`・`components/newsletter-signup.tsx`・`components/competition-viewing-guide.tsx`。`StandingsTable` はトップ・試合ページ・順位表ページでも使っているので、見た目の変更は部品単位の後続 spec で行う
- 動き（行が順に現れる・勝点の数え上げ）。動きの共通の仕組みと合わせて次の spec で扱う
- 角丸・影の値（`--radius*` / `--shadow*`）
- データの取得（`getSeasonProgress`・`selectStandingsExcerpt` など）、メタデータ・JSON-LD・`revalidate`
- RWC 2027 の専用ページ（`app/c/rwc/2027/page.tsx`）と大会トップ（`app/c/[competition]/page.tsx`）
- チーム色の帯（行の左のチーム色の線）。`SeasonMatchGroups` の中身の変更になるため後続

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

### 新しい並び順

| 順 | 要素 | 今の位置 | 変更 |
|---|---|---|---|
| 1 | ヒーローの帯（大会名・期間・首位・進行） | 1 | 低くする（下の 1） |
| 2 | カレンダーへの追加のリンク（`CompetitionCalendarLinks`＋「今週の全試合を見る」） | ヒーロー内の白い帯 | 帯のすぐ下に、白い箱なしの 1 行で置く |
| 3 | `SeasonSwitcher` | 2 | そのまま |
| 4 | ページ内ナビ | 7 | 下線のタブにする（下の 3） |
| 5 | `JapanMatchesBlock` | 4 | ナビの下へ（日本代表の試合がない大会では今どおり何も出ない） |
| 6 | 日程（`#schedule`）と順位表（`#standings`） | 8・9 | `lg` 以上で左右 2 列（下の 2）。`lg` 未満は日程 → 順位表の縦並び |
| 7 | `SeasonSummaryBand`（次戦・最新レビュー・日本代表の次戦） | 3 | 日程と順位表の後ろへ |
| 8 | `IosAppCta` | 5 | 要約の帯の後ろへ |
| 9 | `NewsletterSignup` | 10 | そのまま（#905 の位置関係「順位表より下」を守る） |
| 10 | 大会ガイド（`#guide`） | 11 | そのまま |

### 1. ヒーローの帯

- 写真（`getCompetitionHeroImage(family)`、`priority` のまま）は残す。
- 写真にかける色を、大会の色（`heroScrimColor`）から**墨色に替える**: `linear-gradient(100deg, rgb(23 25 31 / 0.92) 0%, rgb(23 25 31 / 0.78) 45%, rgb(23 25 31 / 0.45) 100%)`。`heroScrimColor` の変数は他で使っていなければ削除する。
  - 理由: シックスネイションズのように暗い大会の色では写真が見えなくなっていた（2026-08-25 の #727 で Owner が受け入れた既知の問題）。中立の暗い色にすると大会の色に関係なく写真が見える。
- 高さを `min-h-64 sm:min-h-72` から **`min-h-40 sm:min-h-44`（160 / 176px）** にする。
- 中身: 左に大会名の小見出し・`h1`（文言・`font-heading` は今のまま）・期間。**`sm` 以上では首位と進行を帯の右側に置く**（今の帯の下の黒い 2 列を、帯の中に移す）。`sm` 未満では今どおり帯の下に並べる。進行のバーは残す。
- 帯の下の白い箱（`bg-white px-5 py-5`）は削除し、その中身（カレンダーのリンク）を上の表の 2 に移す。`TrackedLink` の `cta_id: "hub_hero_calendar"` は変えない。`cta_location` は `"hub_hero"` のまま変えない（GA4 の比較を切らないため。帯の直下で、ヒーローの一部として扱う）。

### 2. 日程と順位表の 2 列

- `lg`（1024px）以上で `grid-cols-[minmax(0,1fr)_minmax(320px,380px)]`、列の間は今の `gap` に合わせる。
- 左列: `#schedule` の `section` をそのまま（中身・`SeasonMatchGroups`・空の状態・「他の大会も含めた今週の試合 →」も今のまま）。
- 右列: `#standings` の `section` をそのまま（`renderStandingsBlock`・プール別・`seasonNotStarted` の「参加チーム」・「順位表をすべて見る →」も今のまま）。右列は `lg:sticky lg:top-4 lg:self-start` にする。
  - **右列が画面より高いとき**（プールが複数ある大会など）は sticky にすると下が見えなくなるので、`lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto` を付ける。
- `hasStandings` が false の大会（`/c/pnc/2026` など）は 2 列にせず、日程を全幅にする（今と同じ見た目）。
- `scroll-mt-4` と `id="schedule"` / `id="standings"` は残す（ページ内ナビ・外部リンクの `#standings` が今どおり動くこと）。

### 2b. 日程の節の並び順と Premium 案内（2026-10-04 改訂。Codex の実測による）

**改訂の理由**: Codex が 26 節ある大会（Premium 案内が出る状態）で確かめたところ、上の 1・2 だけでは最初の試合の下端が 1440px で 1,131px、390px で 1,300px になり、受け入れ条件 2 を満たせなかった。`SeasonMatchGroups` は、既定で開く節より前に、過去の節の見出し（閉じた状態）を順に並べる。さらにその上に `PremiumUpsellBanner` が出る。

**変更**:
1. `components/season-match-groups.tsx` の表示順を変える。データ（`groupedMatches`）の中身と、既定で開く節の決め方（`getDefaultOpenGroupIndexes`、今は「中心の節とその前後」）は変えない。表示の順だけを次にする:
   - ① 既定で開く節（元の時系列の順のまま）
   - ② それより後の節（昇順）
   - ③ それより前の節（新しい順）。③の前に小見出し「これまでの節」を置く
2. 節の絞り込み（`RoundFilterTabs`、URL の `?round=`）で 1 つの節を選んだときの表示は今のまま。
3. **すべての節と試合のリンクは、今どおりサーバーの HTML に出す**（並びが変わるだけで、出す・出さないは変えない）。受け入れ条件 5 の数が変わらないこと。
4. 並び替えは、`groupedMatches` と既定で開く節の集合から表示順を返す純粋な関数として切り出し、その関数を単体テストする。
5. `app/c/rwc/2027/page.tsx` も `SeasonMatchGroups` を使っているので、同じ並びになる。確認する画面に `/c/rwc/2027` を足す。
6. `PremiumUpsellBanner` を `#schedule` の中の先頭から、日程（`SeasonMatchGroups` と「他の大会も含めた今週の試合 →」）の後ろへ移す。表示条件（`hasAnyContent`）と `cta_id` は変えない。
   - 判断材料: この案内のクリック（`cta_id: premium_upsell_banner_pricing`）は GA4 で直近 28 日 0 回（2026-10-04、Claude Code が確認）。

**追加の受け入れ条件**:
- 並び替えの関数のテスト: 10 節・中心が 5 節目のとき、表示順が [4, 5, 6, 7, 8, 9, 10, 3, 2, 1]。中心が先頭の節（開幕前）のとき [1, 2, …]。全節が終わっているとき（中心が最後）、開く節が先頭に来て、その前の節が新しい順に続く。節が 1 つのとき、そのまま。
- 「壊して落ちる」確認（コミットしない）: 並び替えを元の時系列に戻すと、上のテストが落ちる。
- 受け入れ条件 2 の 1 画面目の測定を、26 節ある大会（`/c/top-14/2026-27`）で、Premium 案内が出る状態で行う。

### 3. ページ内ナビ

- 今の丸いピル型（白い背景・赤い塗りの選択）を、A4 の**下線のタブ**にする: 背景なし、下に `border-b border-[var(--color-rule)]`、項目は文字のみ、最初の項目（「日程・結果」）に `border-b-2 border-[var(--color-accent)]` と `text-[var(--color-ink)]`、他は `text-[var(--color-ink-muted)]`。
- 項目・リンク先・`aria-label`・横スクロール（`overflow-x-auto`）は今のまま。
- `lg` 以上では順位表が右列に見えているので、「順位」のタブは `lg:hidden` にする（`lg` 未満では今どおり出す）。

### 確認する画面

Vercel のプレビューで次を撮り、PR 本文に貼る（1440×900 と 390×844 の 1 画面目と、ページ全体）:
- `/c/top-14/2026-27`（順位表あり・進行中）
- `/c/six-nations/2027`（開幕前・「参加チーム」）
- `/c/pnc/2026`（順位表なし・終了・日本代表あり）
- `/c/nations-championship/2026`（プール別の順位表・日本代表あり）
- `/c/urc/2026-27`（試合数の多い大会）
- `/c/rwc/2027`（専用ページ。2b の並び替えの影響を確認）

## LLM 連携

なし。

## 受け入れ条件

1. 並び順が「新しい並び順」の表のとおり。`lg` 未満では日程 → 順位表 → 要約の帯 → アプリの案内 → ニュースレター → ガイドの順に縦に並ぶ。
2. **1 画面目**（下の「測り方」）:
   - 1440×900: `/c/top-14/2026-27` と `/c/six-nations/2027` で、最初の試合リンクの下端が 900px 以下、かつ順位表（`#standings` の最初の `table`、開幕前は `#standings`）の上端が 900px 以下。
   - 1440×900: `/c/pnc/2026` で、最初の試合リンクの下端が 900px 以下。
   - 390×844: `/c/top-14/2026-27` で、最初の試合リンクの下端が 844px 以下。
   - 本番の値（背景の表）とプレビューの値を並べた表を PR 本文に貼る。
3. ヒーローの帯の高さ（`main header` 要素の高さ）が 1440 で 220px 以下（首位・進行は帯の中）、390 で 340px 以下（帯 160px＋首位・進行が帯の下に縦に 2 段並ぶ分）。
4. ヒーローの写真にかける色が墨色（`rgb(23 25 31 / …)`）で、`heroScrimColor`（大会の色を混ぜたもの）を使っていない。`/c/six-nations/2027` のスクリーンショットで写真が見えること。
5. **生の HTML の試合リンクが減っていない**（#749 で直した「日程がサーバーの HTML に出ない」問題を戻さない）。次を本番とプレビューで実行し、同じ数であること。標準エラーを捨てずに実行し、出力を PR 本文に貼る:
   ```
   for p in /c/top-14/2026-27 /c/pnc/2026 /c/six-nations/2027; do
     echo "$p $(curl -s <ホスト>$p | grep -o 'href="/matches/[0-9a-f-]*"' | sort -u | wc -l)"
   done
   ```
   本番の値（2026-10-04、Claude Code）: top-14 42、pnc 5、six-nations 15。プレビューは Vercel の保護があるため、`vercel curl` か保護の回避用トークン付きで取得してよい。取れない場合は PR 本文にそう書き、Claude Code が確認する。
6. `#schedule` / `#standings` / `#guide` の `id` が残り、ページ内ナビのリンクで各位置へ移動する。
7. `h1` の文言、`breadcrumbJsonLd` と `seasonFaqJsonLd` の出力、`generateMetadata` は変わらない（既存テストが通ること）。
8. 対象外に挙げた部品のファイルに差分がない（`git diff --stat origin/main` の出力を PR 本文に貼る）。
9. 大会シーズンページの既存テスト（`tests/app/season-page-ia.test.tsx` ほか、`rg -l "app/c/\[competition\]/\[season\]/page" tests` で見つかるもの）で、並び順を検証している assert を新しい並び順に書き換える。書き換えた assert を PR 本文に一覧で書く。消すことはしない。
10. 新しいテストを足す:
    - `hasStandings` が true のとき、`#schedule` と `#standings` が同じ 2 列のグリッドの子として描かれる。false のときはグリッドが無く、`#schedule` が全幅。
    - `SeasonSummaryBand` と `IosAppCta` が `#standings`（無い場合は `#schedule`）より後ろに描かれる。
11. 「壊して落ちる」確認（コミットしない）: `SeasonSummaryBand` を `#schedule` の前に戻すと 10 の 2 つ目のテストが落ちる。出力を PR 本文に貼る。
12. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る。
13. 上の 5 ページのスクリーンショットを PR 本文に貼り、Owner が確認してからマージする。

### 測り方（受け入れ条件 2・3）

Playwright で、ビューポートを指定してページを開き、`networkidle` の後 0.8 秒待って、ページ上で次を評価する（Claude Code が本番の値を取ったのと同じ式）:

```js
const firstMatch = [...document.querySelectorAll('main a[href^="/matches/"]')].find(a => a.offsetParent);
const st = document.querySelector('#standings table, #standings');
({
  header: Math.round(document.querySelector('main header')?.getBoundingClientRect().height ?? 0),
  firstMatchBottom: firstMatch ? Math.round(firstMatch.getBoundingClientRect().bottom + scrollY) : null,
  standingsTop: st ? Math.round(st.getBoundingClientRect().top + scrollY) : null,
})
```

本番の値は `#schedule a[href^="/matches/"]` で取った。プレビューでは日本代表の試合（`JapanMatchesBlock`）が日程より上に来るため、`main` 全体の最初の試合リンクで測る（日本代表の試合も「1 画面目に試合がある」に含める）。

## 未解決の質問

1. **#905 の効果測定との重なり**: 11 月に #905（2026-10-03、ニュースレターを順位表の下へ）の効果を「大会ページ → 試合ページの遷移率」で見る予定。この spec も同じ指標を動かすので、10 月中に出すと 2 つの効果を分けられない。Claude Code の推奨は「待たずに出す。#905 とこの spec を合わせた効果として、9 月（両方なし）と出した後で比べる。GA4 に注釈を入れる」。Owner の判断待ち。
2. 動き（行が順に現れる・勝点の数え上げ）は次の spec（動きの共通の仕組み）で入れる。この spec では入れない。

## 2026-10-04 追記: PR #909 のプレビュー確認による修正（Owner 承認済み）

Claude Code がプレビューの実データでモック A4 と比べ、次を同じ PR で直すことにした。

必須:
1. 日程の並び替え（2b）を、節の数に関係なく適用する（節でグループ化され 2 つ以上あるとき）。トップ14は 2026-10-04 時点で 6 節しか取り込んでおらず、`shouldCollapseRoundGroups`（10 節以上）が false のため第1節から表示されていた。6 節のケースのテストを追加する。
2. 右列の順位表に「#・チーム・試・勝・分・敗・勝点」が収まること（得点・T は右列で省略してよい）。`min-w-[34rem]` のため 330px の列で勝点が横スクロールの外に隠れていた。`/standings` ページの表は変えない。
3. 試合ページのスコア帯で、明るいチーム色（例: オーストラリア `#FFD700`）の上の文字と札を暗い色にし、コントラスト 4.5:1 以上にする。

モックに合わせる:
4. トップ最上部にモックの右側のポスター枠（ゴールポストの線画・INTRODUCTION FILM の表示）を入れる。写真が暗すぎて見えないので、スクリムを弱めるかポスター枠側に写真を出す。
5. 大会ページの日程と、トップの今週の試合の行を、モックの 1 行の一覧（日時｜チーム 対 チーム｜スコア）にする。**この範囲に限り `components/season-match-groups.tsx`・`components/match-card.tsx` の見た目の変更を許可する**（上の「対象外」を改める）。サーバーの HTML の試合リンク・`cta_id`・ネタバレ防止は今のまま。
6. 大会ページの日程の見出しに、モックの大きな節番号（例: 05）を付ける。
7. シーズンの切り替えの選択中の色を、大会の色ではなく墨色にする。
