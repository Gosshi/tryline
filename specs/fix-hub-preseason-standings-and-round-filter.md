# 大会ハブ: 開幕前の偽「首位」表示と、プールが無い大会に出る Pool A–D フィルタの修正

## 背景

2026-09-25 に URC 2026-27（144試合）とプレミアシップ 2026-27（90試合）が同時開幕する。両大会のシーズンページは**すでに本番で公開されており、開幕前の今、事実と異なる内容を表示している。**

### 1. 1試合も行われていないのに「首位」を表示している

`https://www.trylinerugby.com/c/urc/2026-27` の本番実測（2026-08-31、Chrome 1336×759）:

| ヒーロー帯のセル | 表示 |
|---|---|
| 首位 | **ベネトン** |
| 進行 | **0節 / 全18節** |
| 次節 第1節 | 2026-09-25 (金) 09:00 JST |

同一の帯の中で「0節」と「首位ベネトン」が同時に出ている。

`competition_standings` を本番で確認したところ、URC 2026-27 の全行が次の状態だった（`updated_at` = 2026-08-31T09:57:24Z）。

```
position:1 played:0 won:0 drawn:0 lost:0 points_for:0 points_against:0 total_points:0
position:2 played:0 ... （以下同じ）
```

`position` は 1..16 が振られているが、**全チームの成績が 0 なので順位に意味がない。** 実際の表示順はベネトン → ブルズ → カーディフ で、これはアルファベット順である。

`app/c/[competition]/[season]/page.tsx:500-511` の `leaderLabel` は `standings[0]?.teamName` を無条件に読む。`played` を見ていない。

プレミアシップ 2026-27 の `competition_standings` も同一の形（全行 `played:0` / `total_points:0`）であることを確認済み。

### 2. 同じ理由で、0 が並ぶ表を「順位表」として出している

同ページの `#standings` 節の実測テキスト:

```
順位表
#  チーム    試 勝 分 敗 得点  T 勝点
1  ベネトン   0  0  0  0  0-0  0  0
2  ブルズ     0  0  0  0  0-0  0  0
3  カーディフ 0  0  0  0  0-0  0  0
```

ページ内ナビにも「順位」タブが出る。`hasStandings`（`app/c/[competition]/[season]/page.tsx:575-577`）は `standings.length > 0` しか見ていない。

さらに `seasonFaqs`（同 `:553-560`）は `standings.length > 0` のとき FAQ 構造化データに **「このページ上部の順位表で最新順位を確認できます。」** を出力する。開幕前の URC 2026-27 では、これが検索エンジンに向けた偽の記述になっている。

### この問題は `/c/rwc/2027` では既に解決済み

`specs/fix-rwc2027-pre-tournament-pools.md`（実装済み）が、まったく同じ問題（「全て 0-0-0 の順位表が6プール連続で上部を占有」）を RWC 2027 専用ページで解決している。

実装（`app/c/rwc/2027/page.tsx:160-162, 244-292`）:

```ts
const tournamentStarted = matches.some(
  (match) => match.status === "finished" || match.status === "in_progress",
);
```

- `tournamentStarted === false`: `StandingsTable` を出さず、**チーム名だけの `PoolTeamGrid`**（同ファイル `:93`、ローカル関数）を日程の**下**に置く
- `tournamentStarted === true`: 従来どおり `StandingsTable` を日程の上に置く

**本 spec は、この既に Owner が承認・実装済みのパターンを `/c/[competition]/[season]` に一般化するものである。** 新しい設計判断を持ち込むものではない。

### 3. プールが無い大会に「Pool A / Pool B / Pool C / Pool D」フィルタが出る

`components/season-match-groups.tsx:22-29` の `ROUND_FILTERS` は次の6件をハードコードしている。

```
全試合 / Pool A / Pool B / Pool C / Pool D / ノックアウト
```

表示条件は `showRoundFilter = totalMatches >= 20`（同 `:120`）だけで、**その大会にプールが存在するかを見ていない。**

`competition_pools` の**全件**（2026-08-31 実測）:

| 大会 | プール名 |
|---|---|
| rwc/2023 | Pool A 〜 Pool D |
| rwc/2027 | **Pool A 〜 Pool F** |
| nations-championship/2026 | **Northern Hemisphere / Southern Hemisphere** |

`competition_pools` に行を持つ大会は**この3件のみ。** 一方、しきい値 20 を超えてフィルタが表示される大会には urc / premiership / league-one / super-rugby-pacific / autumn-nations が含まれ、**これらはいずれもプールを1件も持たない。**

**ハードコードされた A〜D の一覧は、それが表示されるどの大会に対しても正しくない。**

- プールを持たない大会（URC・プレミアシップ等）: 4タブが全て空振り
- rwc/2027: 実際は A〜F。**E と F が一覧に無い**
- nations-championship/2026: 実際は Northern / Southern。**どちらも一覧に無い**

本番での実証（`/c/urc/2025-26`、2026-08-31、Chrome）:

| URL | `#schedule` 内の試合カード | 節見出し | 表示されるもの |
|---|---|---|---|
| （フィルタなし） | 150 | 20 | 正常 |
| `?round=pool-a` | **0** | **0** | タブ列と「他の大会も含めた今週の試合 →」だけ。**空状態メッセージが無い** |
| `?round=knockout` | 150 | 20 | 全試合と完全に同一（`filterGroupsByRound` の `!isPool` が全節で真になるため） |

つまり6タブのうち、**4つは無言の行き止まり、1つは「全試合」の重複**である。

### 先行 spec との関係

`specs/fix-hub-hero-scrim-and-pool-labels.md`（実装済み）は `competition_pools.pool_name` の**表示名変換**（`formatPoolName`: `Pool A` → `プールA`、`Northern Hemisphere` → `北半球`、`lib/format/competition.ts`）を導入した。本 spec が扱う `ROUND_FILTERS` は `components/season-match-groups.tsx` にハードコードされた**別物**で、その変換を通っていない。結果として、順位表のプール帯は「プールA」、フィルタタブは「Pool A」と表記が割れている。本 spec で `formatPoolName` に寄せる。

## スコープ

対象:
- `app/c/[competition]/[season]/page.tsx` — `leaderLabel`、`hasStandings`、`seasonFaqs`、ページ内ナビのラベル、`#standings` 節の描画
- `components/season-match-groups.tsx` — `ROUND_FILTERS` の廃止と、実データからのフィルタ生成、空結果の表示
- `app/c/rwc/2027/page.tsx` の `PoolTeamGrid` の**共有コンポーネント化**（`components/` へ切り出し）

対象外:
- **`competition_standings` のデータ変更・取り込み処理の修正。** 開幕前に `played:0` の行が入っていること自体は不正ではない（参加16チームの登録として妥当）。**表示層で解決する**
- **`/c/rwc/2027` の表示結果の変更。** `PoolTeamGrid` を切り出しても、RWC ページの見た目は差分ゼロであること
- ヒーロー帯のレイアウト・配色・キービジュアル（`fix-hub-hero-scrim-and-pool-labels.md` で確定済み。差分を出さない）
- `app/c/[competition]/[season]/standings/page.tsx`（順位表単独ページ）
- 試合カード（`components/match-card.tsx`）の見た目
- デスクトップでの情報密度・スクロール量（別件）
- スケジュール節がサーバー HTML に出ていない件（別件）

## データモデル変更

なし。すべて表示層で解決する。

## API サーフェス

なし。

`?round=` クエリパラメータの取りうる値が変わる。**未知の値が来たら「全試合」にフォールバックする**（現行 `isRoundFilterValue` と同じ挙動を維持する）。

## UI サーフェス

### A. 「シーズンがまだ始まっていない」の判定

判定を1か所に定義し、4箇所から参照する。`/c/rwc/2027` の `tournamentStarted` と**同じ試合ベースの判定を主とし**、順位データ側の条件を **OR で足す**。

```
seasonNotStarted =
  matches.every(m => m.status !== "finished" && m.status !== "in_progress")
  || 順位データが全行 played === 0
```

- 第1項は `app/c/rwc/2027/page.tsx:160-162` の `tournamentStarted` の否定。**同じ判定式を使う**（共通ヘルパーに切り出してよい）
- 第2項は「試合は終わっているが順位データがまだ取り込まれていない」ズレを拾うためのもの。この状態でも `standings[0]` は偽の首位になる
- 順位データは `standings` と `poolStandings` の両方を対象にする

### B. 開幕前のヒーロー帯

`seasonNotStarted` が真のとき:

- **「首位」セルを出さない**
- 帯は残りのセル（進行 / 次節）だけで、**空セルが生じないように並ぶ**こと。`sm:grid-cols-3` に2要素を流し込んで右1/3が空白になる状態にしない
- 「進行」「次節」の表示内容は変えない

### C. 開幕前の順位表節

`seasonNotStarted` が真のとき、`#standings` 節を **参加チーム一覧** として描画する。

- `app/c/rwc/2027/page.tsx:93` の `PoolTeamGrid` を `components/pool-team-grid.tsx` に切り出し、**両ページから使う**
- プールを持たない大会（URC・プレミアシップ等）でも使えるよう、`poolStandings` が空なら `standings` をプール名なしの1グループとして受け取れるようにする。**プール名の見出しは、プール名があるときだけ出す**
- 既存の `PoolTeamGrid` の挙動（`row.teamName === "-"` を「未確定」に置き換える）は**そのまま維持する**
- **`StandingsTable`（試 / 勝 / 分 / 敗 / 得点 / T / 勝点の列）を描画しない**
- 節見出しを「順位表」から **「参加チーム」** に変える
- 「順位表をすべて見る →」リンクは**出さない**（遷移先も同じ 0 の表になるため）
- ページ内ナビのラベルを「順位」から **「参加チーム」** に変える。アンカーは `#standings` のまま
- **配置順は変えない。** `/c/rwc/2027` は開幕前に日程を上へ動かしているが、`/c/[competition]/[season]` は既に日程（`#schedule`）が `#standings` より上にある。並び替えは不要

`seasonNotStarted` が偽のとき（1試合でも消化済み）は、**現行の順位表表示から一切変更しない。**

### D. FAQ 構造化データ

`seasonFaqs` の順位表に関する回答は、`standings.length > 0` ではなく `seasonNotStarted` で分岐する。

- 真: 「このシーズンの順位表はまだ確定していません。」（既存の未確定側の文言をそのまま使う）
- 偽かつ順位データあり: 現行の「このページ上部の順位表で最新順位を確認できます。」

### E. ラウンドフィルタ

`ROUND_FILTERS` のハードコード配列を廃止し、**表示中の試合データから生成する。**

1. `groupedMatches` に含まれる全試合の `roundName` から、実在するプール名の集合を取る
2. **相異なるプールが2件以上あるときだけ**フィルタ列を表示する。1件以下なら**フィルタ列そのものを描画しない**
3. 表示ラベルは `formatPoolName`（`lib/format/competition.ts`、実装済み）を通す
4. 「ノックアウト」タブは、**プールに属さない試合が1件以上存在するときだけ**出す
5. `totalMatches >= 20` というしきい値は**フィルタ表示の条件から外す。** 試合数ではなくプールの有無で決める
6. クエリ値は表示ラベルではなくプール名から導出する（現行の `normalizeRoundLabel` と同じ正規化でよい）

### F. 絞り込み結果が0件のとき

現在は無言で空になる。**必ず空状態を描画する。**

- 「この絞り込みに該当する試合はありません。」に相当する文言
- 「全試合」に戻る手段を同じブロック内に置く
- 既存の空状態（`app/c/[competition]/[season]/page.tsx:794` 付近の「試合データを準備中です」ブロック）の見た目に揃える。新しいカード様式を作らない

## LLM 連携

なし。LLM 呼び出しは増減しない。

## 受け入れ条件

**本番相当のデータ（URC 2026-27 / プレミアシップ 2026-27 / ネーションズチャンピオンシップ 2026 / URC 2025-26 / RWC 2027）で確認すること。**

### 開幕前表示

1. `seasonNotStarted` 相当の判定が単一のヘルパー（または導出値）として存在し、`leaderLabel` / 順位表節 / ページ内ナビ / `seasonFaqs` の**4箇所すべてがそれを参照している**
2. 全試合が `scheduled` のとき `seasonNotStarted` が `true`
3. 1試合でも `finished` または `in_progress` があり、かつ順位データに `played >= 1` の行があれば `false`
4. 試合が `finished` でも順位データが全行 `played === 0` なら `true`（取り込みラグを拾う）
5. `standings` が空配列のときも `true`（0行を「開幕済み」と誤判定しない）
6. `poolStandings` を持つ大会でも同じ判定になる
7. `/c/urc/2026-27` のヒーロー帯に **「首位」という文字列が出ない**
8. `/c/premiership/2026-27` のヒーロー帯に「首位」が出ない
9. `/c/urc/2026-27` のヒーロー帯に空セル（中身の無いグリッド子要素）が無い
10. `/c/urc/2026-27` の `#standings` 節の見出しが「参加チーム」であり、**文字列「順位表」を含まない**
11. `/c/urc/2026-27` の `#standings` 節に、勝点 `0` を含むセルが1つも無い（`StandingsTable` が描画されていない）
12. `/c/urc/2026-27` の `#standings` 節に、参加16チームのチーム名がすべて出ている
13. `/c/urc/2026-27` のページ内ナビのラベルが「参加チーム」
14. `/c/urc/2026-27` の FAQ 構造化データ（`application/ld+json`）に **「このページ上部の順位表で最新順位を確認できます。」が含まれない**
15. `/c/urc/2025-26`（消化済みシーズン）のヒーロー帯・順位表・ナビ・FAQ が**この変更の前後で差分ゼロ**
16. `/c/rwc/2027` の描画結果が**この変更の前後で差分ゼロ**（`PoolTeamGrid` 切り出しの副作用が無いこと）

### ラウンドフィルタ

17. `components/season-match-groups.tsx` に `Pool A` / `Pool B` / `Pool C` / `Pool D` という文字列リテラルが**存在しない**
18. `/c/urc/2026-27` にフィルタタブ列が**描画されない**（`[role="tab"]` の要素数が 0）
19. `/c/premiership/2026-27` にフィルタタブ列が描画されない
20. `/c/urc/2025-26` にフィルタタブ列が描画されない
21. `/c/nations-championship/2026` に**フィルタ列が描画されない**

> **2026-09-01 訂正**: 当初この条件を「タブが 全試合 / 北半球 / 南半球 になる」としていたが、**誤りだった**。NC は**全試合が北半球チーム 対 南半球チーム**で（本番実測: 同一プール同士0試合 / 別プール同士10試合）、**1試合が1つのプールに属さない**。`external_ids.pool_name` も**全36試合が null**。プールフィルタという概念が成立しないため、描画しないのが正しい。

22. `/c/rwc/2027` にフィルタ列が描画され、タブが「全試合 / プールA 〜 **プールF**」（＋プール外の試合があれば「ノックアウト」）である。**旧ハードコードで欠けていた E・F を含むこと**
22b. 22 のタブを選ぶと、そのプールに属する試合だけが残る
22c. **プールのタブがプール名の昇順に並んでいる**（A → F）。試合のキックオフ順など、データの並びに依存しないこと
23. `/c/urc/2025-26?round=pool-a` にアクセスすると **150件（全試合）が表示される**（未知の値は全試合にフォールバック）
24. 絞り込み結果が0件になる状態で、空状態の文言と「全試合」に戻る導線が描画される（試合カード0件で無言の空白にならない）
25. 現行の折りたたみ挙動（`shouldCollapseRoundGroups`: 節グループ10件以上で折りたたみ、既定で現在節±1を開く）に**差分が無い**。`/c/urc/2026-27` で節グループが18件、`aria-expanded="true"` が2件であることを確認する

### 共通

26. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean
27. **ユニットテストを追加する。** 最低でも: 全試合 scheduled / 一部 finished かつ played>0 / finished だが全行 played=0 / 順位0行 / プール制で全0 / プール0件の大会でフィルタ列が空になる / RWC 相当の A〜F 6プールが全て拾える

### デザイン品質

28. 追加・変更する UI は `app/globals.css` の既存トークン（`--color-ink` / `--color-ink-muted` / `--color-rule` / `--radius-*` / `--shadow-soft`）のみを使う。新しい色・角丸・影を導入しない
29. `design.md` の「Do not add decorative effects that obscure scores, labels, controls, or reading flow」に反する装飾を追加しない
30. **Owner による目視確認を要する。** 「参加チーム」表示が、開幕を待っている大会の入口として自然に読めるか（0の表を消した結果、ページがスカスカで手抜きに見えないか）は機械的には判定できない

## 判定方法（効果測定）

GA4（プロパティ 538067713）で、開幕後4週間を計測する。

| 指標 | 取り方 | 基準 |
|---|---|---|
| `/c/urc/2026-27` の 90% スクロール到達率 | `scroll` イベント数 ÷ `screenPageViews` | 現行の長尺ハブ実測は NC 2026 で **19.0%**（29/153、2026-06-01〜08-30）。**下回らないこと** |
| `/c/urc/2026-27` の平均エンゲージメント時間 | `userEngagementDuration` ÷ `screenPageViews` | NC 2026 は **50.8秒**（7770/153）。同水準以上 |
| `?round=` を含む `pagePath` のセッション | `pagePath` フィルタ | URC / プレミアシップで **0 になる**（回帰検知用） |

**注意**: 本 spec の主目的は誤情報の除去であり、数値の改善ではない。上表は**悪化していないことの確認**に使う。数値が動かないことをもって失敗と判定しない。

## 未解決の質問

1. **`/c/rwc/2027` は開幕前に「日程 → 参加チーム」の順に並べ替えている。** `/c/[competition]/[season]` は元から日程が上なので並べ替え不要と判断したが、Owner が「開幕前は順位節そのものを出さない」を選ぶなら、受け入れ条件 10〜13 を「`#standings` 節とナビ項目を描画しない」に差し替える
2. **`autumn-nations/2021, 2022, 2024` は20試合超だがプールを持たない。** 本修正でフィルタが消える。過去シーズンのため実害・便益とも小さく、個別対応は不要と判断している
3. **`/c/rwc/2023`（Pool A〜D）は `/c/[competition]/[season]` を通るか。** 通る場合、開幕済みシーズンなので `seasonNotStarted` は偽になり、フィルタは正しく4プール分生成されるはずだが、Codex は実際に確認すること
