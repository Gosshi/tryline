# p2-multi-competition: 複数競技対応

## 背景

現状は Six Nations のみ。ターゲットユーザーは週 3〜10 試合の国際試合を観戦しており、
Rugby Championship・Autumn Nations・Premiership・Top 14・URC・Super Rugby Pacific、
そして日本の League One も対象とする。
データモデルは competition-agnostic 設計済みのため、
スクレイパーとシードデータの追加が主な作業となる。

## 対象競技と優先順位

### Priority A — 国際試合（まず対応）

| 競技 | family slug | シーズン形式 | 主要チーム数 |
|---|---|---|---|
| Rugby Championship | `rugby-championship` | `2025` | 4 |
| Autumn Nations Series | `autumn-nations` | `2025` | 〜10（年により変動）|
| Pacific Nations Cup | `pacific-nations-cup` | `2025` | 6〜8 |

### Priority B — ヨーロッパリーグ（プレーオフのみ）

国内リーグは通常シーズン全試合の Wikipedia 一覧ページが存在しないため、
**プレーオフ（準決勝・決勝・入替戦）のみ**をインポート対象とする。
日本のファンが最も注目する試合に絞ることでスクレイパーの安定性とコストを両立する。

| 競技 | family slug | シーズン形式 | インポート対象 |
|---|---|---|---|
| Premiership Rugby | `premiership` | `2024-25` | プレーオフ SF・決勝・入替戦（計 5〜6 試合）|
| Top 14 | `top-14` | `2024-25` | プレーオフ SF・決勝・入替戦（計 5〜6 試合）|
| United Rugby Championship | `urc` | `2024-25` | プレーオフ QF・SF・決勝（計 7〜8 試合）|

### Priority C — 南半球・日本

| 競技 | family slug | シーズン形式 | 主要チーム数 |
|---|---|---|---|
| Super Rugby Pacific | `super-rugby-pacific` | `2025` | 12 |
| Japan League One | `league-one` | `2024-25` | 12（Division 1）|

## 追加チーム一覧

### 国際チーム（Rugby Championship / Autumn Nations / Pacific Nations Cup）

```
new-zealand, south-africa, australia, argentina,
fiji, samoa, tonga, japan, usa, canada, georgia, uruguay,
namibia, portugal, spain, romania
```

### Premiership Rugby（2024-25）

```
bath, bristol-bears, exeter-chiefs, gloucester, harlequins,
leicester-tigers, newcastle-falcons, northampton-saints,
sale-sharks, saracens
```

### Top 14（2024-25）

```
bordeaux-begles, clermont, la-rochelle, lyon, montpellier,
pau, racing-92, stade-francais, toulouse, toulon,
perpignan, castres, bayonne, vannes
```

### URC（2024-25）

```
leinster, munster, connacht, ulster,
glasgow-warriors, edinburgh,
cardiff, ospreys, scarlets, dragons,
benetton, zebre,
bulls, lions, sharks, stormers
```

### Super Rugby Pacific（2025）

```
blues, chiefs, crusaders, highlanders, hurricanes,
brumbies, force, reds, rebels, waratahs,
fijian-drua, moana-pasifika
```

### League One Division 1（2024-25）

インポート対象: **プレーオフ・決勝のみ**（Wikipedia に全試合一覧なし。European 国内リーグと同方針）

```
saitama-wild-knights, kubota-spears, toyota-verblitz,
tokyo-suntory-sungoliath, kobelco-kobe-steelers,
toshiba-brave-lupus, urayasu-d-rocks, canon-eagles,
mitsubishi-dynaboars, ricoh-black-rams,
shizuoka-blue-revs, honda-heat
```

※ `red-hurricanes-osaka`, `shimizu-blue-sharks`, `urayasu-d-rocks` は 2024-25 は D2 のため除外。

## 実装作業（競技ごとに共通）

### 1. チームシードデータ

`supabase/seed/teams-<competition>.sql` を追加。
`teams(slug, name, short_code)` の insert。

### 2. `lib/format/team-identity.ts` への追加

`TEAM_FLAGS`（SVG）、`TEAM_IDENTITY`（color + flag）、`TEAM_STRIPES` に各チームを追加。

国際チームはアルファコード2文字の国旗絵文字で対応（例: 🇳🇿 `"🇳🇿"`）。
クラブチームはプライマリカラー単色で対応（縞なし）。

### 3. スクレイパー実装

`lib/scrapers/wikipedia-<family>-results.ts` を追加。
Wikipedia の該当ページから試合結果をスクレイプする。

全スクレイパーは共通インターフェースで実装:

```typescript
interface CompetitionResultScraper {
  fetchResults(season: string): Promise<HistoricalMatchResult[]>;
}
```

robots.txt は事前確認済み（Wikipedia は robots.txt で学術・情報目的を許可）。

### 4. インポートスクリプト

`scripts/import-<family>-results.ts` を追加。
`import-six-nations-results.ts` と同じ構造を踏襲:
- `upsertCompetition`
- `getTeamLookup`
- `upsertMatches`
- `upsertCompetitionTeams`

実行コマンド例:
```bash
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/import-rugby-championship-results.ts 2024
```

### 5. Cron 設定（`vercel.json`）

既存の `orchestrate` cron は全 competition を対象にしているため原則変更不要。

## データモデル変更

既存の `competitions`, `matches`, `competition_teams`, `teams` テーブルは変更なし。
`competitions.family` と `competitions.season` の組み合わせで競技を識別する。

ルーティングは既存の `/c/[family]/[season]` が自動対応。

## シーズン識別子の方針

| 形式 | 適用競技 |
|---|---|
| `"2025"` | 国際試合（Rugby Championship, Autumn Nations, Pacific Nations Cup, Super Rugby Pacific）|
| `"2024-25"` | ヨーロッパ・日本リーグ（Premiership, Top 14, URC, League One）|

## 各競技の Wikipedia データソース

| 競技 | Wikipedia ページ例 | スクレイプ対象 |
|---|---|---|
| Rugby Championship | `2025_Rugby_Championship` | 全試合結果 |
| Autumn Nations Series | `2025_Autumn_Nations_Series` | 全試合結果 |
| Pacific Nations Cup | `2025_Pacific_Nations_Cup` | 全試合結果 |
| Premiership | `2024-25_Premiership_Rugby_season` | **プレーオフセクションのみ** |
| Top 14 | `2024-25_Top_14_season` | **プレーオフセクションのみ** |
| URC | `2024-25_United_Rugby_Championship` | **プレーオフセクションのみ** |
| Super Rugby Pacific | `2025_Super_Rugby_Pacific_season` | 全試合結果（着手前に構造確認）|
| League One | `2024-25_Japan_Rugby_League_One` | **プレーオフ・決勝のみ**（全試合一覧なし）|

## 受け入れ条件（全競技共通）

各競技について:
- [ ] 全チームが `teams` テーブルに存在する
- [ ] 試合結果が `matches` にインポートされている
- [ ] `competition_teams` が登録されている
- [ ] `/c/<family>/<season>` ページが表示される
- [ ] 順位表が表示される（リーグ戦のみ）
- [ ] コンテンツ生成パイプラインが動作する

## 未解決の質問

- League One のチーム名: 英語表記 or 日本語表記どちらをメインにするか
- Autumn Nations は年により対戦カードが変わるため、チームの事前シードが難しい — 都度追加方式でよいか
- URC の南アフリカ勢（Bulls/Lions/Sharks/Stormers）は Rugby Championship とチームが重複しないため問題なし
- Super Rugby Pacific の finals series（準決勝・決勝）の round 値をどう扱うか
