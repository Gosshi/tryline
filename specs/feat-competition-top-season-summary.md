# 大会トップ `/c/<大会>` に現在シーズンの要点を出す

## 背景

### 実測（2026-09-23 取得）

GSC 28日（2026-08-24〜2026-09-20、`tools/gsc-pull.ts --range 28d --dims page`、表示計 2,226）:

| ページ種別 | ページ数 | 表示 | クリック | CTR |
|---|---:|---:|---:|---:|
| **大会トップ `/c/<大会>`** | 7 | **828（37%）** | 7 | **0.8%** |
| シーズン `/c/<大会>/<年>` | 12 | 484（22%） | 14 | 2.9% |
| その他 | 292 | 920（41%） | 41 | 4.5% |

大会トップ 7 ページの内訳:

| ページ | 表示 | クリック | 平均順位 |
|---|---:|---:|---:|
| `/c/pnc` | 557 | 6 | 9.8 |
| `/c/premiership` | 93 | 1 | 9.6 |
| `/c/rwc` | 74 | 0 | **26.0** |
| `/c/super-rugby-pacific` | 64 | 0 | 11.0 |
| `/c/six-nations` | 24 | 0 | 20.1 |
| `/c/rugby-championship` | 13 | 0 | 11.5 |
| `/c/autumn-nations` | 3 | 0 | 8.0 |

**表示の 67% は `/c/pnc` 1 ページ**。同じ期間の `/c/rwc/2027`（年あり）は表示 180・順位 15.9。

GA4（property 538067713、2026-08-26〜2026-09-22、`landingPage` が `^/c/[^/]+/?$`）の着地は **計 25 セッション**
（`/c/pnc` 13、`/c/lipovitan-challenge-cup` 8、その他 4）。**小さい面であることは正直に書いておく。**

### ページが検索意図に答えていない（2026-09-23 本番を Playwright で確認）

- title は全大会共通で「〈大会名〉 順位表・日程・日本での視聴方法」（`app/c/[competition]/page.tsx:61`）
- しかし本文にあるのは、ヒーローの大会説明・「最新シーズン 〈大会〉 試合一覧を見る →」カード・大会ガイド（LLM 生成の歴史紹介）・最近のレビュー 3 件・全シーズン一覧だけ
  - `/c/rwc`: 本文 1,285 字。順位も日程も視聴方法もなく、「最近のレビュー」は **2023 年大会の 3 試合**
  - `/c/pnc`: 本文 1,352 字。日本代表が 2 試合出た 2026 年大会の日程・結果はレビューカード以外に出ていない
- **title が約束している「順位表・日程・視聴方法」は、1 クリック先のシーズンページにしか無い**

シーズンページ（`app/c/[competition]/[season]/page.tsx`）はこれらを既に全部出している。
データの取得関数も揃っているので、**記事を書く作業ではなくテンプレートの変更**で全大会に効く。

### 過去の判断との関係

- `specs/p3-competition-hub-improvement.md` は「順位表・統計のハブページへの表示」を**対象外**にしていた。本 spec はその判断を**置き換える**（当時は GSC 実測が無かった）
- `specs/feat-season-page-search-answer-blocks.md:19` は「ハブページは別途検討」としていた。本 spec がその別途検討にあたる
- `specs/fix-competition-hub-title-ctr.md:36` は大会トップの title を対象外にしていた。本 spec も **title / description は変えない**（下の「仮説と判定」参照）

### 仮説と判定

**「本文を title の約束に合わせれば順位と CTR が上がる」は仮説であり、検証済みではない。**

- 見込み: 大会トップの CTR がシーズンページ並み（2.9%）になっても、Google で月 +15〜20 クリック程度
- **本命は RWC 2027**（2027-10-01〜11-13）。「ラグビー ワールドカップ」で `/c/rwc` は順位 26〜32。順位が動くまで数か月かかるので今始める
- 判定: デプロイ後 4〜6 週の GSC（`--dims page`）で大会トップ 7 ページの平均順位と CTR を、本 spec の表と比べる
- 効果を切り分けるため、**title / description / canonical は本 spec で変えない**

## スコープ

対象:
- `app/c/[competition]/page.tsx` に「現在シーズンの要点」セクションを追加する（全大会共通）
- シーズンページ内の要点算出用の純粋関数を共有モジュール `lib/format/season-summary.ts` へ移す（シーズンページの表示は変えない。`SeasonSummaryBand` コンポーネントは移さない）
- 大会トップに ISR（`revalidate = 3600`）と `generateStaticParams` を付ける
- 既知の公式開催期間を持つ定数モジュールを新設する（初期値は RWC 2027 のみ）

対象外:
- title / description / OG / canonical の変更
- FAQ 構造化データ（FAQPage）の大会トップへの追加。シーズンページと同じ問いを重複させない
- `app/c/rwc/2027/page.tsx` と `app/c/lipovitan-challenge-cup-2026/page.tsx` の変更（`RWC2027_TOURNAMENT_DATES` 文字列の共通化も今回はしない）
- ヒーロー画像・大会説明文（`COMPETITION_DESCRIPTIONS`）・大会ガイド本文の変更
- `listSeasonsByFamily` の公開記事件数が 1000 行上限で欠ける問題（下の「未解決の質問」3。別 spec）
- `competitions.start_date / end_date` を取り込みで正しく保つ修正（下の「データの制約」参照。別件）
- ユーザー別の状態（ネタバレ防止設定など）。ISR でキャッシュする公開ページなので持ち込まない。スコア表示の扱いはシーズンページと同じ

## データの制約（2026-09-23 本番 DB で確認）

**`competitions.start_date / end_date` は開催期間として信用できない。** 表示には使わないこと。

| 大会 | DB の start〜end | 実際 |
|---|---|---|
| `rwc-2027` | null〜null | 2027-10-01〜11-13（36/52 試合＝プール戦のみ取り込み済み） |
| `top-14-2026-27` | 2026-09-26〜2026-09-27 | 既に 21 試合終了。`lib/ingestion/live-ingest.ts:73-81` が**その回に取り込んだ試合の日付範囲で上書き**している |
| `nations-championship-2026` | 2026-07-04〜2026-11-21 | 11 月末のファイナルズが未取り込みの可能性 |

また `hasIncompleteSchedule`（`lib/format/schedule-coverage.ts:13`）は `totalRounds === null` の大会を常に「欠けなし」と判定する。
RWC 2027 は `total_rounds` が null なので、**試合の日付範囲から期間を出すとプール戦の終わりで切れる**。

大会トップが「現在シーズン」として選ぶシーズン（`seasons.find(matchCount > 0) ?? seasons[0]`、`app/c/[competition]/page.tsx:93`）と、その状態:

| 大会 | 選ばれるシーズン | 試合 | 終了 | 予定 | 日本代表の試合 | 状態 |
|---|---|---:|---:|---:|---:|---|
| pnc | 2026 | 4 | 4 | 0 | 2 | post |
| premiership | 2026-27 | 90 | 0 | 90 | 0 | pre（9/25 開幕） |
| rwc | 2027 | 36 | 0 | 36 | 3 | pre |
| super-rugby-pacific | 2026 | 83 | 83 | 0 | 0 | post |
| six-nations | 2027 | 15 | 0 | 15 | 0 | pre |
| rugby-championship | 2025 | 12 | 12 | 0 | 0 | post |
| autumn-nations | 2025 | 32 | 32 | 0 | 5 | post（2026 は 0 試合なので選ばれない） |

## データモデル変更

なし。マイグレーションなし。

## API サーフェス

### 新規: `lib/format/competition-period.ts`

公式に確定している開催期間だけを持つ定数と取得関数。

```ts
export type CompetitionPeriod = { startDate: string; endDate: string }; // "YYYY-MM-DD"（主催者が発表した日付。日本時間への換算はしない）

export function getKnownCompetitionPeriod(competitionSlug: string): CompetitionPeriod | null;
```

- 初期値は次の 2 件（2026-09-23 Owner 承認）:

| slug | startDate | endDate | 根拠 |
|---|---|---|---|
| `rwc-2027` | 2027-10-01 | 2027-11-13 | `app/c/rwc/2027/page.tsx:30` の `RWC2027_TOURNAMENT_DATES` と同じ。[大会公式](https://www.rugbyworldcup.com/en/news/976797/about-mens-rugby-world-cup-2027) |
| `nations-championship-2026` | 2026-07-04 | 2026-11-29 | 開幕は DB の第 1 節（2026-07-04、現地・日本時間とも同日）。ファイナルズ週末は 11/27〜29、Allianz Stadium Twickenham（[会場公式](https://allianzstadiumtwickenham.com/nations-championship-finals-weekend)、2026-09-23 確認）。DB の試合は 11/21 までしか無く、ファイナルズは未取り込み |

- **日付は主催者の発表どおりで、日本時間に換算しない。** グランドファイナル（11/29 現地）のキックオフ時刻は 2026-09-23 時点で未確認で、夕方開始なら日本時間では 11/30 になる。表示上は「2026年7月4日〜2026年11月29日」とする
- これ以外の大会は Owner の承認なしに足さない

### 移設: シーズンページの純粋関数 → `lib/format/season-summary.ts`（新規）

`app/c/[competition]/[season]/page.tsx` のファイル内関数のうち、以下を**本体を変えずに**移して export し、シーズンページはそこから import する。

| 関数 | 現在の位置 |
|---|---|
| `formatMatchKickoffJst(kickoffAt)` | `:154` |
| `findNextScheduledMatch(matches, now?)` | `:158` |
| `getSeasonBroadcastGuide(broadcastsByMatch)` と型 `SeasonBroadcastGuide` | `:175-227` |
| `isJapanMatch(match)` | `:278` |
| `getMatchLabel(match)` | `:282` |
| `getCompetitionHubState(matches)` と型 `CompetitionHubState` | `:286-308` |
| `selectStandingsExcerpt(standings, includeJapan)` | `:446-473` |

加えて、シーズンページ本体（`:766-780`）でインライン計算している首位ラベルを関数化して同じモジュールに置く:

```ts
export function getLeaderLabel(args: {
  poolStandings: PoolStanding[];
  standings: StandingRow[];
  seasonNotStarted: boolean;
}): string | null;
```

`:766-780` の式をそのまま関数本体にし、シーズンページもこの関数を呼ぶ形に置き換える（挙動は同一）。

`SeasonSummaryBand`（`:475` から）と `formatMetadataDate` / `formatMetadataDateRange`（`:372-399`、metadata 専用）は**今回は移さない**。

大会トップ用に次の関数を**新規に**同じモジュールへ置く:

```ts
export function getSeasonPeriodLabel(args: {
  competitionSlug: string;
  matches: MatchListItem[];
  state: CompetitionHubState;
}): string | null;
```

- 返す文字列の形式は `"2027年10月1日〜2027年11月13日"`（日本時間の日付、年を両側に付ける、区切りは全角の `〜`、前後に空白なし）。開始日と終了日が同じなら `"2026年8月8日"` の 1 つだけ
- 判定ルールは下の「開催期間（ブロック A）のルール」。`competitions.start_date / end_date` は引数に取らない（取らせないことで誤用を防ぐ）

### 大会トップが追加で呼ぶクエリ

現在の 3 本（`listSeasonsByFamily` / `getRecentlyReviewedMatchesForFamily` / `getCompetitionGuide`）に加え、選ばれたシーズンの `slug` で:

| 関数 | 定義 | 返り値 |
|---|---|---|
| `listMatchesForCompetition(slug)` | `lib/db/queries/matches.ts:2340` | `MatchListItem[]` |
| `getStandingsForCompetition(slug)` | `lib/db/queries/standings.ts:122`（`cache()` 済み） | `StandingRow[]` |
| `getPoolStandingsForCompetition(slug)` | `lib/db/queries/standings.ts:235` | `PoolStanding[]` |
| `getMatchBroadcastsForMatches(matchIds)` | `lib/db/queries/match-broadcasts.ts:48` | `Map<string, MatchBroadcast[]>` |

- シーズン選択は既存の `selectLatestSeasonWithMatches(seasons)`（`lib/db/queries/competitions.ts:276`）に置き換える。**現在のインライン式と結果は同一**（`matchCount > 0` の先頭、なければ先頭）
- 呼び出し順は 3 段: ① 既存 3 本を並列 → ② 選ばれたシーズンで `listMatchesForCompetition`・`getStandingsForCompetition`・`getPoolStandingsForCompetition` を並列 → ③ 試合 ID で `getMatchBroadcastsForMatches`
- `getNextMatchForTeamSlug`（大会をまたぐ日本代表の次戦）は**使わない**。大会トップは選ばれたシーズン内の試合だけを扱う

### キャッシュ

大会トップは現在 **毎リクエスト動的描画**（2026-09-23 本番で `cache-control: private, no-cache, no-store`、`x-vercel-cache: MISS` を 2 ページで確認。同時刻の `/c/pnc/2026` は `HIT`）。
このまま クエリを 3 本 → 7 本に増やすと Supabase egress が比例して増える（`project_supabase_billing_incident` の前例あり）。

- `export const revalidate = 3600;` を付ける（シーズンページ `:67` と同じ値）
- `generateStaticParams` を `listFamilies()`（`lib/db/queries/competitions.ts:500`）から `{ competition }[]` を返す形で追加する
- デプロイ後に `x-vercel-cache` が 2 回目以降 `HIT` になることを確認する（受け入れ条件 11）。`MISS` のままなら、原因を特定して PR に書く。**`dynamic = "force-static"` 等で黙らせない**

## UI サーフェス

### 主タスク（design.md「Block Intent and Primary Task」）

大会トップの主タスクは **Data**:「いつ開催か・次の試合は日本時間で何時か・日本代表は出るか・今の順位・どこで見られるか」。
大会ガイド（Reading）と全シーズン一覧は従属する。本 spec は大会トップの**範囲を限った再設計**にあたるので、design.md の Block Intent / Layout / Density の規則を適用する。

### 変更後の並び（上から）

```
[ヒーロー（変更なし）]
[現在シーズンの要点]   ← 新規。旧「最新シーズン」カードはここに吸収して削除
[最近のレビュー]       ← 既存。位置だけ大会ガイドの上へ
[大会ガイド]           ← 既存
[全シーズン]           ← 既存
```

### 「現在シーズンの要点」セクション

`<section aria-labelledby=...>` 1 つ。見出し h2 は `{competitionTitle}の日程・結果`（本番の `/c/rwc` なら「ラグビーワールドカップ 2027の日程・結果」。2026-09-23 の本番表示で最新シーズン名は「ラグビーワールドカップ 2027」）。
`competitionTitle` は既存の `formatCompetitionTitle(season, season.season)`。

以下のブロックで構成する。**各ブロックはデータが無ければ丸ごと出さない。**プレースホルダの数字や「0 試合」「未定」の埋め草を出さない。

| # | ブロック | 表示条件 | 内容 |
|---|---|---|---|
| A | シーズン見出し帯 | 常に | 状態ラベル（`pre`=「開幕前」/ `active`=「開催中」/ `post`=「終了」/ `information`=出さない）、開催期間（下記ルール）、シーズンページへのリンク「{competitionTitle} の全日程・結果を見る →」（href `/c/{competition}/{season}`） |
| B | 日程（日本時間） | 状態が `pre` か `active` で、`kickoffAt >= now` かつ `status === "scheduled"` の試合が 1 件以上 | 見出し h3「次の試合（日本時間）」。キックオフ昇順で**最大 3 試合**。各行: `getMatchLabel`、`formatMatchKickoffJst`、`/matches/{id}` へのリンク。4 試合目以降がある場合は「残り {n} 試合の日程を見る →」（href `/c/{competition}/{season}#schedule`） |
| C | 日本代表の試合 | シーズン内に `isJapanMatch` が 1 件以上（`cancelled` を除く） | **新規コンポーネント `components/japan-matches-block.tsx`**（props: `matches: MatchListItem[]`、`seasonHref: string`、`maxItems?: number`＝既定 6）として作る。後続でシーズンページにも置く予定のため（「GPT 提案との関係」参照）。見出し h3「日本代表の試合」。キックオフ昇順で**最大 6 試合**。各行: 日本時間の日時、`getMatchLabel`、`finished` ならスコア（`homeScore–awayScore`、どちらか null なら出さない）、`/matches/{id}` へのリンク。7 試合以上ならシーズンページへのリンク |
| D | 順位 / 結果 | 下記 | 見出し h3 は `post` なら「最終順位」、それ以外は「順位」 |
| E | 日本での視聴方法 | 常に（状態 `information` を除く） | 見出し h3「日本での視聴方法」。`getSeasonBroadcastGuide(broadcastsByMatch).answer` の文をそのまま出す。`services` が 1 件以上なら各 `serviceName` を `url` へのリンク（外部リンク、`rel="noopener noreferrer"`）で並べる |

**開催期間（ブロック A）のルール**:

1. `getKnownCompetitionPeriod(season.slug)` があればそれを出す（例:「2027年10月1日〜2027年11月13日」）
2. なければ、状態が `post` のときだけ、中止（`cancelled`）を除く試合のキックオフの**日本時間の日付**の最初〜最後を出す
3. それ以外（`pre` / `active` / `information` で定数なし）は**期間を出さない**。`competitions.start_date / end_date` は使わない（「データの制約」参照）

**ブロック D のルール**（シーズンページの `seasonNotStarted` と同じ判定。`isSeasonNotStarted(matches, standings, poolStandings)`、`lib/season-standings.ts`）:

- `seasonNotStarted` が true → ブロック D を出さない（ゼロ値の順位表を出さない。`specs/fix-hub-preseason-standings-and-round-filter.md` と同じ方針）
- `poolStandings` が 1 件以上 → `getLeaderLabel(...)` の文字列（例:「プールA: 南アフリカ / プールB: フランス」）を 1 行で出す
- `standings` が 1 件以上 → `selectStandingsExcerpt(standings, hasJapan)` の行を既存 `StandingsTable`（`components/standings-table.tsx`）で出す。`hasJapan` はブロック C の表示条件と同じ
- `post` で `season.champion` があれば、表の上に「優勝: {champion}」を出す
- 表の下に「順位表をすべて見る →」（href `/c/{competition}/{season}/standings`）。順位表が無く優勝だけのときは出さない

### レイアウト（design.md「Layout」「Density」）

- モバイル（< 1024px）: A → B → C → D → E の縦積み
- `lg:` 以上: A を全幅、その下を 2 列にする。左列 B と C、右列 D と E。**モバイルの縦積みを横に伸ばしただけにしない**
- 新しい一覧行（B・C の試合行）は `maxEmptyRatio: 0.25` を満たすこと（design.md「Layout」）
- 色・角丸・影は既存トークンを使う（`--color-accent` / `--color-ink` / `--color-ink-muted` / `--shadow-soft` / `--radius-md`）。新しいトークンを作らない
- ヒーローとの間は design.md「Spacing」の 24–40px、ブロック間は 12–20px

### 旧「最新シーズン」カード

`app/c/[competition]/page.tsx:127-140` のカードは削除する（ブロック A のリンクが同じ役割を持つ）。

### 状態ごとの見え方（Codex のスクリーンショット提出対象）

| 大会 | 状態 | 出るブロック |
|---|---|---|
| `/c/rwc` | pre | A（期間は定数から）・B（10/2 JST の開幕戦から 3 試合）・C（日本代表 3 試合）・E |
| `/c/pnc` | post | A（期間は試合から）・C（日本代表 2 試合とスコア）・D（順位表があれば）・E |
| `/c/premiership` | pre | A（期間なし）・B・E |
| `/c/super-rugby-pacific` | post | A・D・E |

## LLM 連携

なし。LLM 呼び出しを追加しない。大会ガイド本文も触らない。

## 受け入れ条件

### 表示（`tests/app/competition-hub-indexing.test.tsx` に追加）

各条件は、`listMatchesForCompetition` などのモックに与える fixture と、期待する DOM で書く。

1. **pre・RWC 型**: `slug: "rwc-2027"`、全試合 `scheduled`、うち日本代表 3 試合、`totalRounds: null`、`startDate / endDate: null` のとき
   - 既存 fixture（`competition-hub-indexing.test.tsx:47-60`、`nameJa: "ラグビーワールドカップ2027"`）で h2「ラグビーワールドカップ2027の日程・結果」がある（既存テスト `:90` が同じ fixture で「ラグビーワールドカップ2027」を得ている）
   - 「開幕前」と「2027年10月1日〜2027年11月13日」が出る
   - 「次の試合（日本時間）」の下に、キックオフの早い順で**ちょうど 3 件**の `/matches/{id}` リンクがある
   - 「日本代表の試合」の下に日本代表の 3 試合が出る
   - 「最終順位」「順位」の見出しが**無い**
2. **期間ルール**: 条件 1 と同じ fixture で `slug` を `"rwc-2031"` に変えると、期間の文字列が**出ない**（`matches` の日付範囲にフォールバックしない）
3. **pre・定数なし**: `slug: "premiership-2026-27"`、`startDate: "2026-09-25"`、`endDate: "2027-06-03"` のとき、「2026年9月25日」も「2027年6月3日」も出ない
4. **post**: 全試合 `finished`（1 試合だけ `cancelled`）、日本代表 2 試合（スコアあり）、`champion: "Fiji"`、standings 4 行のとき
   - 「終了」が出る。fixture の最初の試合を `2026-09-12T10:05:00Z`、最後の非中止試合を `2026-09-19T15:30:00Z`（日本時間 9/20 00:30）、中止試合を `2026-09-26T10:00:00Z` にしたとき、期間は「2026年9月12日〜2026年9月20日」（UTC の日付「9月19日」でも、中止試合の「9月26日」でもない）
   - 「次の試合（日本時間）」が**無い**
   - 日本代表の 2 試合にスコアが出る
   - 「最終順位」と「優勝: Fiji」が出る
5. **日本代表が出ない大会**: 日本代表の試合が 0 件のとき「日本代表の試合」見出しが**無い**。「出場しません」等の文言も**無い**
6. **4 試合目以降**: 予定試合が 5 件のとき、「残り 2 試合の日程を見る →」が `/c/{competition}/{season}#schedule` を指す
7. **順位表の出し分け**: `seasonNotStarted` が true になる fixture（全試合 `scheduled`、standings 全行 `played: 0`）でブロック D が出ない
8. **旧カード削除**: 「最新シーズン」のテキストを持つリンクカードが無く、ブロック A のリンクが `/c/{competition}/{season}` を指す（既存テスト `links the bare hub to the newest season with matches`（`:83`）はこの内容に書き換える）
9. **並び**: `main` 内の DOM 順で「現在シーズンの要点」セクション → 「最近のレビュー」→ 大会ガイド → 「全シーズン」
10. **空シーズン**: `listMatchesForCompetition` が `[]` を返すとき、ブロック A（リンク付き）だけが出て、B〜E は出ない。例外を投げない

### キャッシュ

11. `app/c/[competition]/page.tsx` が `revalidate = 3600` と `generateStaticParams` を export している。`generateStaticParams` は `listFamilies()` の各値を `{ competition }` にして返す（単体テストで確認）。**デプロイ後**、`/c/pnc` と `/c/rwc` に 2 回リクエストし 2 回目の `x-vercel-cache` が `HIT` であることを PR コメントに貼る（Owner がマージ後に確認してもよい）

### 退行防止

12. シーズンページの既存テスト（`tests/app/season-page-ia.test.tsx`、`tests/app/competition-guide-metadata.test.ts`）が**無変更で**通る。関数の移設でシーズンページの出力が 1 文字も変わらないこと
13. 移設した各関数について、`lib/format/season-summary.ts` 用の単体テストを置く。最低限: `getLeaderLabel` のプールあり / 単一表 / `seasonNotStarted` の 3 パターン、`getSeasonPeriodLabel` の「定数あり」「post で中止除外」「pre で定数なし → null」「開始と終了が同日」、`getKnownCompetitionPeriod` の既知 / 未知 slug
14. **テストが本当に効くことの確認**: 条件 2・3 のテストは、実装を一時的に「定数が無ければ試合の日付範囲 / `season.startDate`・`endDate` を出す」形に書き換えると**落ちる**こと、条件 4 の日付テストは日本時間変換を外すと**落ちる**ことを確認し、PR 本文に「壊して落ちた」ことを書く（書き換えはコミットしない）

### 画面

15. 1440px と 375px で `/c/rwc`・`/c/pnc`・`/c/premiership`・`/c/super-rugby-pacific` のスクリーンショット（ローカルまたはプレビュー）を PR に貼る。1440px では要点セクションが 2 列になっていること
16. `pnpm lint`・`pnpm typecheck`・`pnpm test` が通る。CI（`gh pr checks`）が緑

## 既存テストの巻き添え（実測で特定済み）

- `tests/app/competition-hub-indexing.test.tsx:36-43` は `@/lib/db/queries/competitions` と `@/lib/db/queries/matches` を**必要な関数だけ**モックしている。大会トップが `listMatchesForCompetition`・`selectLatestSeasonWithMatches`・`listFamilies` を呼ぶと未定義で落ちる。`@/lib/db/queries/standings` と `@/lib/db/queries/match-broadcasts` のモックも追加が必要
  - `selectLatestSeasonWithMatches` は純粋関数なので、モックせず `vi.importActual` で本物を使うこと（モックで結果を固定すると選択ロジックを検査しなくなる）
- `tests/app/competition-guide-metadata.test.ts:24-27` は大会トップの `generateMetadata` を呼ぶ。本 spec は `generateMetadata` を変えないので影響しないはずだが、同ファイルは `import` 時にページ全体を評価する。モック不足で落ちたら同ファイルのモックを足す（assert は変えない）
- `tests/app/competition-hub-indexing.test.tsx:83` の「最新シーズン」リンクの assert は、条件 8 の内容に書き換える

## 競合とマージ順

- 2026-09-23 時点で `app/c/[competition]/page.tsx`・`app/c/[competition]/[season]/page.tsx` を触る open PR は無い（`gh pr list` で確認。open は draft のニュースダイジェスト 3 本と docs のみ）
- シーズンページを触る別作業が先に入った場合は、移設対象の行番号がずれる。**関数名で探すこと**

## 本番操作

なし。DB 書き込み・再生成・LLM 呼び出しは無い。

## GPT 提案（2026-09-23）との関係

Owner 経由で GPT から「**日本代表の次の試合を調べる人を、既存の大会ページで取りにいく。まず 11 月の大会ページを一枚仕上げる**」という提案があった（日本時間の日程・視聴先・対戦成績・この試合で何が決まるか、を冒頭に）。実測で確かめた結果:

| GPT の主張 | 確認結果（2026-09-23） |
|---|---|
| 入口はレビューより大会ページ。PNC の大会ページ 73 セッション | **正しいが、入口は大会トップではなくシーズンページ**。`docs/market-demand-research-2026-09-22-evidence.json` の organic 着地は `/c/pnc/2026` が Bing 67・Yahoo 2、大会トップ `/c/pnc` は計 13。南ア対 NZ の 57 も `/c/greatest-rivalry/2026`（シーズンページ） |
| 11 月の大会ページを「これ一つで観戦準備できる」ページに | 対象は `/c/nations-championship/2026`（organic 着地 Bing 19・Yahoo 1、**Google の表示は 28 日で 0**）。日本の 11 月 3 試合（11/8 01:40・11/15 01:40・11/21 23:10 JST）は既に載っているが、第 4〜6 節の一覧に分散して埋もれている。冒頭の「日本代表の次戦」は 10/24 のリポビタン D チャレンジカップ（大会をまたぐ次戦） |
| 相手はどのくらい強い？――対戦成績 | **今のデータでは薄い**。取り込み済みの終了試合は日本対イングランド 3、ウェールズ 1、スコットランド 1。試合ページの H2H リンクは `countHeadToHeadMatches`（`lib/db/queries/matches.ts:2179`、**予定試合も数える**）が 2 以上で出る（`app/matches/[id]/page.tsx:234`）ので 3 戦とも出るが、ウェールズ・スコットランドの H2H ページに載る過去の結果は 1 試合だけ（2026-09-23 訂正: 当初「出ない」と書いたのは誤り）。一方 `/h2h/japan-vs-usa` は Google クリック 28（サイト全体 61 の 46%）で、日本戦前の H2H は実績のある入口 |
| どこで見られる？ | 放送情報は JRFU 公開待ち（期限 10/10、handoff §3-2）。確認できない部分は出さない方針は一致 |
| タイトルに「日本代表」「11月」を | 中身が揃った後にやるのは GPT 自身も同意見。本 spec は効果の切り分けのため title を変えない |

**Claude Code の見立て**: GPT の方向（実際に人が来ているシーズンページで、11 月の日本代表戦を取りにいく）は、本 spec（Google 表示が多いが着地 25 セッションの大会トップ）より**11 月までの集客効果が大きい可能性が高い**。ただし両者は同じ部品で作れる。

- 本 spec のブロック C を `components/japan-matches-block.tsx` として作り、**後続 spec でシーズンページ冒頭にも置く**（日本代表の試合が 1 件以上あるシーズンだけ）。これで GPT 提案の「日本はいつ、誰と戦う？――日本時間の日程」が `/c/nations-championship/2026` の冒頭に出る
- 後続 spec の候補範囲: シーズンページへのブロック配置、H2H リンク（既存の 2 試合以上ルールに従う）、11 月末ファイナルズの扱い。**10/31 までに出すには本 spec のマージが 10 月中旬までに必要**

## 未解決の質問

1. ~~`getKnownCompetitionPeriod` に RWC 2027 以外を足すか~~ → **解決（2026-09-23）**: Nations Championship 2026 を追加（上の表）
2. **判定時期**: デプロイ日 +4 週と +6 週に GSC を取り直す。見るのは大会トップ 7 ページの平均順位・CTR と、`/c/rwc` の「ラグビー ワールドカップ」系クエリの順位
3. **別件（本 spec の対象外。2026-09-23 に別 spec 化: `specs/fix-published-content-count-row-cap.md`）**: `listSeasonsByFamily`（`lib/db/queries/competitions.ts:320-323`）と `listSeasonsByFamilies`（`:387-390`）は `match_content` の published 行を**件数上限なしの select で全件取りに行く**。2026-09-23 時点で published は **1,012 行**あり、PostgREST の 1000 行上限（#853 と同じ型）を既に超えている。欠けた 12 行のシーズンで `publishedContentCount` が減り、件数が 0 になると大会トップの「全シーズン」で**「準備中」表示・リンクなし**になる。公開記事は毎日増えるので悪化する一方。別 spec にするか Owner 判断
4. ~~優先順位~~ → **解決（2026-09-23）**: 続ける。`specs/feat-season-page-japan-matches-block.md`
