`/specs/feat-puma-trophy-2026-ingestion.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## 急ぎです

**今週末（2026-08-30 04:00 JST）の試合がサイトに存在しません。** 2026年は The Rugby Championship が休止で、代わりの二国間遠征のうちオーストラリアのアルゼンチン遠征だけが取り込まれていません。

ただし**キックオフ前なら手動でプレビューを生成できる**ので、品質を落として急ぐ必要はありません。

## やることは実質2つです

1. `lib/ingestion/sources/` に取り込みソースを新設
2. `LIVE_COMPETITION_SOURCES` に登録

あとは表示資材のマップ3か所への追記だけです。

## 雛形をそのまま踏襲してください

`lib/ingestion/sources/wikipedia-greatest-rivalry.ts` が**49行**の同型実装です。NZ の南アフリカ遠征という、まったく同じ構造の二国間遠征を扱っています。

やっていることは3つだけです。

1. Wikipedia の遠征ページを `fetchWithPolicy` で取得
2. `parseWikipediaSixNationsHtml`（vevent ベースの汎用パーサ）に渡す
3. `mapWithTeamSlugs` でチームスラッグに変換

**この構造から離れないでください。** 独自のパーサを書き始めないこと。

## 最初に読むファイル

| ファイル | 何を確認するか |
|---|---|
| `lib/ingestion/sources/wikipedia-greatest-rivalry.ts` | **雛形。これを写す** |
| `lib/ingestion/live-competitions.ts:62-70` | Greatest Rivalry の登録の書き方 |
| `lib/ingestion/live-ingest.ts:41-60` | **`upsertCompetition` が大会レコードを自動生成する** |
| `lib/format/competition.ts` | `COMPETITION_FAMILY_COLORS` と `FAMILY_DISPLAY_NAMES` |
| `lib/competition-hero-images.ts` | `COMPETITION_HERO_IMAGES` |

## 落とし穴が3つあります

**1. 汎用パーサが効く保証がありません**

`parseWikipediaSixNationsHtml` はこのページ用に書かれたものではありません。**実際にページを取得して vevent 構造があるか確かめてください。**

効かない場合は、**推測で別のパーサを書かず**、実際の HTML 構造を PR 本文に書いて相談してください。ここで勝手に判断されると、手作りフィクスチャが実データで壊れる過去の失敗を繰り返します。

**2. マイグレーションを書きたくなりますが不要です**

`ingestLiveCompetition` が `upsertCompetition` を呼び、`LiveCompetitionSource` の `competitionName` / `competitionNameJa` / `competitionSlug` から `competitions` 行を upsert します。

**`competitions` への INSERT・マイグレーション・シードを一切追加しないでください。** 登録するだけで取り込み時に作られます。

**3. プレビュー生成側を触りたくなりますが不要です**

`cron-weekend-preview-refresh.yml` はカレンダー API から取って `status === "scheduled"` で絞るだけで、**大会名も family も見ていません**（`:69-130`）。`matches` に入れば自動的に対象になります。

**`.github/workflows/` に差分を出さないでください。**

## 取り込み結果は必ず検算してください

DB は UTC 保存、現地は ART（UTC−03:00）です。

| | kickoff（UTC） | home | away | 会場 |
|---|---|---|---|---|
| 第1テスト | `2026-08-29 19:00` | Argentina | Australia | Estadio 23 de Agosto, San Salvador de Jujuy |
| 第2テスト | `2026-09-05 21:00` | Argentina | Australia | Estadio Malvinas Argentinas, Mendoza |

**アルゼンチンがホームです**（オーストラリアの遠征なので）。ホーム／アウェーが逆になっていないか必ず確認してください。

**この表と一致することをテストで固定してください。** フィクスチャは実ページから取得したものを使ってください。

## アクセント色の選び方

`COMPETITION_FAMILY_COLORS` に `puma-trophy` を足しますが、**赤系は既に3つ埋まっています。**

- `rugby-championship`: `#C8102E`
- `lipovitan-challenge-cup`: `#E60012`
- `top-14`: `#D62B31`

青系も `super-rugby-pacific`（`#0057B8`）と `pnc`（`#00539B`）があります。

**選んだ色が既存のどれとも十分離れている根拠を PR 本文に書いてください。** 大会ハブは色でファミリーを見分ける設計なので、近い色を足すと識別が壊れます。

## やってはいけないこと

- **新しいヒーロー画像の生成・追加。** `public/visuals/` に新規ファイルを置かないでください。画像生成は Owner が外部ツールで行う運用です。`puma-trophy` には既存の `/visuals/rugby-championship.jpg` を暫定で割り当ててください（2026年は Rugby Championship が開催されないため未使用です）
- `competitions` / `teams` への INSERT・マイグレーション・シード追加
- `.github/workflows/` の変更
- `lib/ingestion/sources/wikipedia-rugby-championship.ts` の変更
- **`rugby-championship-2026` の登録の削除。** 空で残っていますが、扱いは Owner の判断待ちです
- 大会ガイド（`supabase/seeds/competition-guides-*.sql`）の追加
- 放送情報の紐付け

## 完了の定義

spec の「受け入れ条件」15項目をすべて満たすこと。特に:

- **2試合が検算表どおりにパースできるテスト**（日付・会場・ホーム／アウェー）
- フィクスチャが**実ページ由来**であること
- `git diff -- .github/` が**空**
- `git diff -- lib/ingestion/sources/wikipedia-rugby-championship.ts` が**空**
- `git diff -- public/visuals/` が**空**
- `supabase/migrations/` と `supabase/seeds/` に新規ファイルが無い
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が clean

## PR 本文に必ず含めること

- **パースできた2試合の一覧**（kickoff UTC・home・away・会場）と、spec の検算表との一致
- `parseWikipediaSixNationsHtml` がこのページで機能したかどうか
- 選んだアクセント色と、既存色と離れている根拠
- `git diff --stat`
