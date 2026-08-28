# プーマ・トロフィー 2026（オーストラリア代表 アルゼンチン遠征）の取り込み

## 背景

**2026年の The Rugby Championship は開催されない。** Wikipedia によれば 2026 年と 2030 年は休止で、2027〜2029 年は通常開催に戻る。代わりに南半球4か国は二国間遠征を行う。

| 遠征 | Tryline の状態 |
|---|---|
| ニュージーランド → 南アフリカ（4テスト） | ✅ `greatest-rivalry-2026` として取り込み済み |
| **オーストラリア → アルゼンチン（2テスト）** | ❌ **未取り込み** |

**同じ構造の遠征なのに片方だけが入っていない。** 2026-08-28 時点で `matches` にオーストラリア × アルゼンチンの試合は1件も存在しない。

### 実害

1. **今週末の試合がサイトに存在しない。** 第1テストは 2026-08-30(日) 04:00 JST
2. **カレンダーと大会ハブに出ない。** 実測で最も滞在時間が長い面（ハブ107秒・カレンダー120秒）に載らない
3. **ニュース通知が紐付かない。** `matchNewsLink` は DB の対戦カードと突合するため、オーストラリア／アルゼンチン関連の記事は通知先が無い。同時期の南アフリカ×NZ が41件紐付いているのと対照的
4. プレビューもレビューも生成できない

### 大会名の根拠

**この遠征はプーマ・トロフィーを争う。** Wikipedia の Puma Trophy 記事に、Rugby Australia が2テスト遠征でトロフィーを争うと発表したこと、そして **2000年以来初めてテストシリーズとして争奪される**ことが記載されている（2012年以降は Rugby Championship の枠内で争われていた）。

固有名があるので `greatest-rivalry-2026` と同じく**大会として立てられる**。

## スコープ

対象:
- Wikipedia の遠征ページから試合を取り込むソースの新設
- `LIVE_COMPETITION_SOURCES` への登録
- ファミリーの表示資材（アクセント色・表示名・ヒーロー画像）

対象外:
- **プレビュー生成の仕組みの変更。** 後述のとおり**変更不要**
- **マイグレーション。** 後述のとおり**不要**
- `rugby-championship-2026` の扱い（未解決の質問へ）
- 放送情報の紐付け
- 大会ガイド（`supabase/seeds/competition-guides-*.sql`）。別途 Owner が用意する
- `wikipedia-rugby-championship.ts` の変更

## プレビュー生成側の変更は不要

**`cron-weekend-preview-refresh.yml` は大会に依存しない。** 対象の選び方は次のとおり（`:69-130`）。

1. `GET $BASE/api/v1/calendar?from=$FROM&to=$TO` を叩く
2. `match.status !== "scheduled"` を除外
3. キックオフの **JST 日付**が `from`〜`to` の範囲内のものを対象にする

大会名も family も見ていない。**`matches` に入ってカレンダー API に出れば、それだけで自動的に対象になる。**

金曜 21:05 JST の枠（`cron: "5 12 * * 5"`、`:52-56`）は次の範囲を対象にする。

```
from = 実行日(JST) + 1 日
to   = 実行日(JST) + 2 日
```

**第1テストは 2026-08-30(日) JST キックオフなので、2026-08-28(金) の枠に含まれる。**

さらに `workflow_dispatch` で `from` / `to` を指定した手動実行ができる（`:9-18`）。**つまり定刻を逃してもキックオフ前ならいつでもプレビューを生成できる。取り込みさえ済めば締切は無い。**

## マイグレーションは不要

`ingestLiveCompetition` が `upsertCompetition`（`lib/ingestion/live-ingest.ts:41-60`）を呼び、登録情報から `competitions` 行を upsert する。`name` / `name_ja` / `slug` は `LiveCompetitionSource` の `competitionName` / `competitionNameJa` / `competitionSlug` から入る。

**`competitions` への手動 INSERT もマイグレーションも書かないこと。** 登録すれば取り込み実行時に作られる。

## データモデル変更

なし。

`teams` は両チームとも登録済みで日本語名もある。**新規チームの追加は不要。**

| name | slug | name_ja |
|---|---|---|
| Australia | `australia` | オーストラリア |
| Argentina | `argentina` | アルゼンチン |

## 命名

| 項目 | 値 |
|---|---|
| `competitionSlug` | `puma-trophy-2026` |
| `family` | `puma-trophy` |
| `competitionName` | `Puma Trophy 2026` |
| `competitionNameJa` | `プーマ・トロフィー オーストラリア代表 アルゼンチン遠征` |
| `season` | `2026` |
| `sourceLabel` | `wikipedia` |

`competitionNameJa` は `greatest-rivalry-2026` の `グレイテスト・ライバルリー・ツアー オールブラックス 南アフリカ遠征` と同じ流儀（固有名＋遠征の説明）に揃えている。

## 取り込みソース

**雛形は `lib/ingestion/sources/wikipedia-greatest-rivalry.ts`（49行）。** 同じ二国間遠征で、構造も同じはず。

雛形がやっていることは3つだけ。

1. Wikipedia の遠征ページを `fetchWithPolicy` で取得
2. `parseWikipediaSixNationsHtml`（vevent ベースの汎用パーサ）に渡す
3. `mapWithTeamSlugs` で Wikipedia の表記をチームスラッグに変換

対象 URL:

```
https://en.wikipedia.org/wiki/2026_Australia_rugby_union_tour_of_Argentina
```

チーム名の対応表:

```ts
const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Argentina: "argentina",
  Australia: "australia",
};
```

`isMissingWikipediaPage` / `toEmptyWhenMissingOrUnstructured` によるフォールバックも雛形と同じにすること。

### 汎用パーサが効くかは必ず検証すること

**`parseWikipediaSixNationsHtml` がこのページで機能する保証はない。** 実際のページを取得して vevent 構造があるか確認し、**2試合が正しくパースできることをテストで固定すること。**

パースできない場合は、その事実と実際の HTML 構造を PR 本文に書いて相談すること。**推測で別のパーサを書き始めないこと。**

## 期待される取り込み結果（検算用）

DB は UTC で保存する。ART は UTC−03:00。

| | kickoff（UTC） | kickoff（JST） | home | away | 会場 |
|---|---|---|---|---|---|
| 第1テスト | `2026-08-29 19:00` | 8/30(日) 04:00 | Argentina | Australia | Estadio 23 de Agosto, San Salvador de Jujuy |
| 第2テスト | `2026-09-05 21:00` | 9/6(日) 06:00 | Argentina | Australia | Estadio Malvinas Argentinas, Mendoza |

**アルゼンチンがホーム**（オーストラリアの遠征なので）。取り込み後にこの表と突き合わせて検算すること。

## 表示資材

`family` を新設するので、ファミリー単位のマップに追記が要る。

| ファイル | 追記内容 |
|---|---|
| `lib/format/competition.ts` の `COMPETITION_FAMILY_COLORS` | `"puma-trophy"` のアクセント色 |
| `lib/format/competition.ts` の `FAMILY_DISPLAY_NAMES` | `"puma-trophy"` の表示名 |
| `lib/competition-hero-images.ts` の `COMPETITION_HERO_IMAGES` | `"puma-trophy": "/visuals/rugby-championship.jpg"` |

### ヒーロー画像は既存を暫定流用する

**新しい画像を生成しないこと**（画像生成は Owner が外部ツールで行う運用）。

`public/visuals/rugby-championship.jpg` が存在し、**2026年の Rugby Championship は開催されないため未使用**になっている。南半球のテストマッチ向けの絵なので暫定流用が妥当。専用画像は後日 Owner が差し替える。

**`getCompetitionHeroImage` は未登録ファミリーを `/visuals/default.jpg` にフォールバックする**ので登録しなくても壊れないが、汎用画像よりは近い絵を当てる。

### アクセント色

`COMPETITION_FAMILY_COLORS` の既存値と**視覚的に重複しない**色を選ぶこと。特に次と近すぎないこと。

- `rugby-championship`: `#C8102E`
- `lipovitan-challenge-cup`: `#E60012`
- `top-14`: `#D62B31`

アルゼンチンのチームカラー（ライトブルー系）が自然だが、`super-rugby-pacific` の `#0057B8` や `pnc` の `#00539B` と近くなりやすい。**選んだ色と、既存のどれとも十分離れている根拠を PR 本文に書くこと。**

## API サーフェス

変更なし。既存の `/api/cron/ingest-live-competitions` が `LIVE_COMPETITION_SOURCES` を反復する。

## UI サーフェス

新規コンポーネントは無い。既存のカレンダー・大会ハブ・試合詳細に自動的に現れる。

## LLM 連携

変更なし。取り込み後、既存のプレビュー／レビュー生成が他大会と同じ経路で動く。

## 受け入れ条件

1. `lib/ingestion/sources/` に遠征ページ用の取り込みソースが新設されている
2. 取得先 URL が `https://en.wikipedia.org/wiki/2026_Australia_rugby_union_tour_of_Argentina`
3. `isMissingWikipediaPage` / `toEmptyWhenMissingOrUnstructured` のフォールバックが雛形と同じ流儀で入っている
4. **保存された HTML フィクスチャに対して2試合がパースでき、日付・会場・ホーム／アウェーが上の検算表と一致することをテストで固定している**
5. フィクスチャが**実ページから取得したもの**である（手作りの HTML を使わない）
6. `LIVE_COMPETITION_SOURCES` に上記の命名表どおりに登録されている
7. `COMPETITION_FAMILY_COLORS` に `puma-trophy` があり、既存色と十分離れている
8. `FAMILY_DISPLAY_NAMES` に `puma-trophy` がある
9. `COMPETITION_HERO_IMAGES` の `puma-trophy` が `/visuals/rugby-championship.jpg` を指している
10. **`competitions` への INSERT・マイグレーション・シードを追加していない**
11. **`teams` への追加をしていない**
12. `.github/workflows/cron-weekend-preview-refresh.yml` に差分が無い（**プレビュー生成側は変更不要**）
13. `lib/ingestion/sources/wikipedia-rugby-championship.ts` に差分が無い
14. `public/visuals/` に新規ファイルを追加していない
15. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

## 未解決の質問

- **`rugby-championship-2026` の空ハブをどうするか。** 2026年は開催されないのに大会レコードが存在し、`LIVE_COMPETITION_SOURCES` にも登録されていて毎回0件を返している。ハブページ自体は 200 で表示される。**削除するか非表示にするかは Owner の判断**。本 spec では触らない
- **専用ヒーロー画像。** 暫定で `rugby-championship.jpg` を流用する。プーマ・トロフィー用の画像を作るかは後日
- **大会ガイド。** `greatest-rivalry` には `supabase/seeds/competition-guides-greatest-rivalry.sql` がある。同等のものを用意するかは Owner の判断
- **放送情報。** 日本での放送があるかは未調査。`project_broadcast_data_gap` のとおり二国間遠征は自動取得の対象外になりやすい
