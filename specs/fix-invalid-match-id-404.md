# 形式が正しくない試合IDで 500 ではなく 404 を返す

計画: `docs/dev-plan-2026-10-12.md` T2。

## 背景

試合 ID は UUID だが、URL の ID の形式を確かめずに DB へ問い合わせている。Postgres が `invalid input syntax for type uuid` を返し、クエリ関数がそれを例外として投げる（例: `lib/db/queries/matches.ts` の `getMatchById` は `if (error) throw error`）。その結果、存在しないページなのに 500 になる。

X 投稿で URL の末尾が欠けたとき（2026-10-10、PR #931 で個別に転送を追加）も、この経路で 500 が出ていた。500 は検索エンジンに「サーバーの障害」と伝わり、Vercel のエラー集計も汚す。

### 本番での再現（2026-10-11、`curl -s -o /dev/null -w '%{http_code}'`）

| パス | 今 | 期待 |
|---|---|---|
| `/matches/abc` | 500 | 404 |
| `/matches/abc/en` | 500 | 404 |
| `/api/v1/matches/abc` | 500 | 404 |
| `/api/v1/matches/abc/content` | 500 | 404 |
| `/matches/1e74662b-af45-4ef1-b267-156eb87329d`（末尾が1文字欠けた UUID） | 500 | 404 |
| `/matches/00000000-0000-4000-8000-000000000000`（形式は正しいが存在しない） | 404 | 404（変えない） |
| `/matches/00000000-0000-4000-8000-000000000000/en` | 404 | 404（変えない） |
| `/api/v1/matches/00000000-0000-4000-8000-000000000000` | 404 | 404（変えない） |
| `/api/v1/matches/00000000-0000-4000-8000-000000000000/content` | 200 | 200（変えない。下の「対象外」参照） |

## スコープ

対象:
- `app/matches/[id]/page.tsx`（`generateMetadata` とページ本体）
- `app/matches/[id]/en/page.tsx`（`generateMetadata` とページ本体）
- `app/api/v1/matches/[id]/route.ts`
- `app/api/v1/matches/[id]/content/route.ts`

対象外:
- 形式は正しいが存在しない ID に対する `/api/v1/matches/[id]/content` の 200。モバイルアプリが空の本文を前提にしている可能性があり、変えるならアプリ側の確認が要る。
- 大文字の UUID の扱い。今も Postgres が一致させて 200 を返しており、この修正でも同じように受け付ける（正規化やリダイレクトはしない）。
- 既存の `isUuid` の重複（`app/api/cron/ingest-lineups/route.ts:23` ほか、cron と Stripe webhook に計4か所）の統合。
- チーム・選手・H2H など、ID 以外の slug を使うページ。

## データモデル変更

なし。

## API サーフェス

### 共通の判定関数（新規）

`lib/ids.ts` に `isUuid(value: string): boolean` を足して export する。

- 形式だけを見る：`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`、大文字小文字を区別しない。
- **バージョンとバリアントの桁は制限しない。** 既存の cron 用 `isUuid` は `[1-5]`／`[89ab]` に制限しているが、ここで同じ制限を入れると、全部ゼロの ID などが「形式不正」になり、今 404 を返している URL の扱いが変わってしまう。判定したいのは「Postgres の uuid 型に渡して例外にならないか」だけ。
- 前後の空白は許さない（trim しない）。

### `/api/v1/matches/[id]` と `/api/v1/matches/[id]/content`

- `params` を取り出した直後、DB や認証の処理より前に `isUuid(id)` を確認する。
- 形式不正なら `apiError("match not found", 404, PUBLIC_CACHE_CONTROL)` を返す（`lib/api/v1/response.ts:19`）。本文は、今の「存在しない試合」の 404 と同じ `{ data: null, error: "match not found", success: false }`。
- `content` ルートは今 `apiSuccess` しか import していないので、`apiError` と `PUBLIC_CACHE_CONTROL` を import する。形式不正の 404 はユーザーごとに変わらないので、`PRIVATE_CACHE_CONTROL` ではなく `PUBLIC_CACHE_CONTROL` を使う。

## UI サーフェス

### `/matches/[id]` と `/matches/[id]/en`

- **`generateMetadata`：** `params` を取り出した直後に `isUuid(id)` を確認する。形式不正なら DB に問い合わせず、今の「存在しない試合」と同じ `{ title: "Match Not Found" }` を返す。
- **ページ本体：** `params` を取り出した直後に `isUuid(id)` を確認する。形式不正なら DB に問い合わせず `notFound()` を呼ぶ。表示は既存の `app/matches/[id]/not-found.tsx`。
- **どちらか一方だけでは足りない。** Next.js はメタデータとページを両方評価するので、片方でも DB に問い合わせれば 500 になる。

## LLM 連携

なし。

## 受け入れ条件

1. **判定関数：** `lib/ids.ts` の単体テストで、次が表どおりになる。

   | 入力 | 結果 |
   |---|---|
   | `1e74662b-af45-4ef1-b267-156eb87329d5` | true |
   | `1E74662B-AF45-4EF1-B267-156EB87329D5` | true |
   | `00000000-0000-0000-0000-000000000000` | true |
   | `abc` | false |
   | `1e74662b-af45-4ef1-b267-156eb87329d`（1文字欠け） | false |
   | `1e74662baf454ef1b267156eb87329d5`（ハイフンなし） | false |
   | ` 1e74662b-af45-4ef1-b267-156eb87329d5`（先頭に空白） | false |
   | `""` | false |

2. **4つの経路が DB に問い合わせない：** 各経路のテストで、ID が `abc` と `1e74662b-af45-4ef1-b267-156eb87329d` のとき次を確認する。
   - ページ2つ：`notFound` が呼ばれ、`getMatchById` などのクエリ関数のモックが**1回も呼ばれない**。
   - `generateMetadata` 2つ：`{ title: "Match Not Found" }` が返り、クエリ関数のモックが1回も呼ばれない。
   - API 2つ：ステータスが 404、本文が `{ data: null, error: "match not found", success: false }`。クエリ関数と `getUserFromBearer` のモックが1回も呼ばれない。
3. **形式が正しい ID の挙動は変えない：** 既存のテスト（`tests/api/mobile-api-v1-match-detail.test.ts`・`tests/api/mobile-api-v1-content.test.ts`・試合ページを import しているテスト群（`grep -rl "app/matches/\[id\]" tests` で列挙））がすべてそのまま通る。存在しない UUID（`00000000-0000-4000-8000-000000000000`）では、今までどおりクエリが呼ばれ、ページ・API とも 404 になる。
4. **わざと壊して確かめる：** 4つの経路のうち1つで `isUuid` の確認を外すと、受け入れ条件2のその経路のテストが落ちる。出力を PR 本文に貼り、変更は戻す。
5. **本番での確認：** デプロイ後、背景の表の9行を `curl -s -o /dev/null -w '%{http_code}'` で叩き、「期待」の列と一致することを確かめる（Claude が行う）。

## 未解決の質問

なし。
