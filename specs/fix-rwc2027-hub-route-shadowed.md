# RWC 2027 専用ハブが本番で表示されない（動的ルートに覆われている）

## 背景

`app/c/rwc/2027/page.tsx`（263行）は RWC 2027 専用のハブページで、汎用の大会ハブ `app/c/[competition]/[season]/page.tsx` とは別の独自実装である。**しかし本番 `https://www.trylinerugby.com/c/rwc/2027` はこの専用ページを返していない。**

### 実測（2026-09-04）

`<title>` で判別できる。

| | 実測値 |
|---|---|
| 本番が返している `<title>` | `ラグビーワールドカップ 2027 日程・見どころ \| Tryline` |
| 専用ページが返すはずの `<title>` | `ラグビーワールドカップ2027 日程・出場国・日本語ガイド` |

本番の書式は汎用ハブのもの（`/c/top-14/2026-27` は `トップ14 2026-27 日程・見どころ | Tryline`）と同型である。専用ページの `PendingState()`（"Coming Soon"）でもない（本番 HTML に `Coming Soon` は0件）。

**つまり `/c/rwc/2027` は汎用の動的ルートが応答しており、専用ページは production に存在しないのと同じ状態にある。**

### 何が失われているか（本番 HTML で0件を確認）

| 専用ページにあるもの | 本番 |
|---|---|
| 「開催都市・会場」セクション | **0件** |
| `/c/rwc/2027/bracket` へのリンク | **0件** |
| `<h1>ラグビーワールドカップ2027</h1>` と `Rugby World Cup` の eyebrow | 出ていない |
| `PreTournamentBanner`（開幕前バナー） | 出ていない |
| FAQPage 構造化データ（開催期間・会場数・次の日本戦） | 出ていない |
| SEO 用の独自 metadata（title / description） | 出ていない |

### この不具合が既に飲み込んでいる作業

専用ページに対して、少なくとも3回の作業が投入されている。**そのすべてが本番に出ていない。**

| 作業 | コミット | 内容 |
|---|---|---|
| `specs/fix-rwc2027-hub-page-gate.md` | — | 「Coming Soon」誤表示の解消 |
| `specs/feat-rwc2027-hub-seo-enhancement.md` | `f928caa` | **開催都市・視聴方法・FAQ 構造化データの追加** |
| PR #746（2026-09-02） | `6568092` | 開幕前ハブの順位表示とフィルタ修正 |

`feat-rwc2027-hub-seo-enhancement.md` は GSC で `/c/rwc/2027` の平均順位が29〜58位・クリック0だったことへの対策として書かれたものであり、**その施策が一度も配信されていない。**

### `/c/rwc/2027/bracket` が孤立している

`app/c/rwc/2027/bracket/page.tsx` は本番で 200 を返し、正しく専用ページを表示している（`<title>Rugby World Cup 2027 ブラケット | Tryline`）。しかし:

- サイト全体で `/c/rwc/2027/bracket` へのリンクは **1箇所のみ**（`app/c/rwc/2027/page.tsx:193`）。**その唯一のリンクが、表示されていない専用ページの中にある**
- `sitemap.xml`（総URL 1663件）に `bracket` は **0件**

**内部リンク0・サイトマップ未掲載**で、事実上どこからも到達できない。

## 根本原因（確度: 高。ただし内部機構は未確定）

汎用の動的ルートの `generateStaticParams`（`app/c/[competition]/[season]/page.tsx:61-77`）が、除外なしで全 family × 全シーズンを生成している。

```ts
export async function generateStaticParams() {
  const families = await listFamilies();
  const params = (
    await Promise.all(
      families.map(async (competition) => {
        const seasons = await listSeasonsByFamily(competition);
        return seasons.map((season) => ({ competition, season: season.season }));
      }),
    )
  ).flat();
  return params;
}
```

本番 DB 実測: `competitions` に `family='rwc'` の行が2件（`rwc-2027` / season=`2027`、`rwc-2023` / season=`2023`）。**したがって `generateStaticParams` は `{competition:"rwc", season:"2027"}` を必ず生成し、専用ページと同じ出力パス `/c/rwc/2027` を作る。**

レスポンスヘッダは `x-nextjs-prerender: 1` / `x-matched-path: /c/rwc/2027` で、ビルド時に事前生成された静的ページが配信されていることを示す。**ただし両ルートとも `x-matched-path` は同じ値になるため、ヘッダだけではどちらのソースが生成したかを外形から確定できない。** 確定はビルド出力で行う（受け入れ条件1）。

### 同種の構成で壊れていないもの（対照）

| パス | 専用ページ | 動的ルートが同じパスを生成するか | 本番 |
|---|---|---|---|
| `/c/rwc/2027` | あり | **する**（family=rwc, season=2027） | **壊れている** |
| `/c/rwc/2027/bracket` | あり | しない（動的側は `/round/[round]` と `/standings` のみ） | 正常 |
| `/c/lipovitan-challenge-cup-2026` | あり | しない | 正常 |

**壊れるのは「動的ルートが同一パスを生成する専用ページ」だけ**であり、専用ページを置くこと自体は問題ない。

## スコープ

対象:
- `app/c/[competition]/[season]/page.tsx` の `generateStaticParams` — 専用ルートが存在するパスを生成しないようにする
- 再発防止のテスト — 専用ルートと `generateStaticParams` の出力が衝突しないことを機械的に検証する
- `app/sitemap.ts` — `/c/rwc/2027/bracket` を追加する
- **`app/c/rwc/2027/page.tsx` に `export const revalidate = 3600` を1行追加する**（下記「再検証間隔」参照）

対象外:
- **専用ページ `app/c/rwc/2027/page.tsx` の表示内容の変更**（表示されるようになれば既存実装がそのまま出る。デザインも文言も変えない。`revalidate` の1行追加だけが例外）
- 汎用ハブ `app/c/[competition]/[season]/page.tsx` の表示内容の変更
- `/c/rwc/2023` の扱い（専用ページが無いので動的ルートで正しい）
- 会場名の日本語化（`Perth Stadium, Perth` 等が英語のまま。**別課題**）
- `competitions.total_rounds`（rwc は null のままで正しい。ノックアウトを含み節の概念が合わない）
- `/c/rwc/2027/bracket` の中身

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

**新しい UI は作らない。** 既に実装済みで配信されていない専用ページが出るようにするだけ。

修正後に `/c/rwc/2027` で表示されるようになるもの（本番データで実在を確認済み）:

| 要素 | 裏付け（本番 DB 実測 2026-09-04） |
|---|---|
| 開催都市・会場 | `rwc-2027` の36試合すべてに `venue` があり、**相異なる会場は8**（`venue` が null の試合は0件） |
| プール分け | `external_ids.pool_name` に **Pool A〜F の6プール** |
| 日程 | 36試合、2027-10-01 〜 2027-10-17 |
| ブラケットへのリンク | `app/c/rwc/2027/page.tsx:193` |

**8会場の内訳**: Perth Stadium, Perth / Stadium Australia, Sydney / North Queensland Stadium, Townsville / Docklands Stadium, Melbourne / Brisbane Stadium, Brisbane / Adelaide Oval, Adelaide / Sydney Football Stadium, Sydney / Newcastle Stadium, Newcastle

### 再検証間隔（revalidate）

実測（2026-09-04）:

| ファイル | `revalidate` |
|---|---|
| `app/c/[competition]/[season]/page.tsx:59`（汎用ハブ） | **3600** |
| `app/c/rwc/2027/bracket/page.tsx:9` | 60 |
| `app/c/rwc/2027/page.tsx` | **指定なし（0件）** |

現在 `/c/rwc/2027` は汎用ハブが応答しているため実質 3600 秒で再検証されている。**このまま専用ページに切り替わると、`revalidate` の指定が無いためビルド時に一度だけ生成され、再デプロイまで更新されなくなる。**

RWC 2027 はプール順位・日程が今後動くため、これは劣化である。**汎用ハブと同じ `export const revalidate = 3600` を専用ページに追加すること。** 値を変えない理由は、切り替え前後で再検証間隔を一致させ、この修正がキャッシュ挙動を変えないようにするため。

## LLM 連携

なし。

## 受け入れ条件

### 診断（実装前に行い、結果を PR 本文に貼る）

1. `pnpm build` を実行し、**ビルドが出力するルート一覧に `/c/rwc/2027` がどう現れるか**を PR 本文に貼る。専用ページと動的ルートの両方が同じパスを生成していることを、ビルド出力で確認する。**この診断結果が上記「根本原因」と食い違う場合は、実装を止めて Owner に報告すること**

### 修正

2. `app/c/[competition]/[season]/page.tsx` の `generateStaticParams` が `{competition:"rwc", season:"2027"}` を返さない
3. `generateStaticParams` の除外は **`rwc`/`2027` をハードコードした条件分岐ではなく**、「`app/c/` 配下に専用ルートが存在するパス」を一般的に除外する形にする。現時点で該当するのは `rwc/2027` のみだが、将来 `app/c/<family>/<season>/page.tsx` を追加したときに自動的に守られること
4. `generateStaticParams` が `rwc`/`2023` は**引き続き返す**（専用ページが無いため動的ルートで正しい）
5. 他の family のシーズンが1つも減っていない。修正前後の `generateStaticParams()` の件数と、減った要素の一覧を PR 本文に貼る

### 表示（プレビューで実測し、結果を PR 本文に貼る）

6. `/c/rwc/2027` の `<title>` が `ラグビーワールドカップ2027 日程・出場国・日本語ガイド` である
7. `/c/rwc/2027` の HTML に `開催都市・会場` が含まれる
8. `/c/rwc/2027` に会場が **8件** 表示される
9. `/c/rwc/2027` の HTML に `/c/rwc/2027/bracket` へのリンクが含まれる
10. `/c/rwc/2027` の HTML に `Coming Soon` が含まれない
11. `/c/rwc/2027` に FAQPage の JSON-LD が含まれる
12. `/c/rwc/2027/bracket` が引き続き 200 を返し、`<title>` が変わっていない
13. `/c/rwc/2023` が 200 を返し、汎用ハブの書式（`… 日程・見どころ | Tryline`）のままである
14. `/c/urc/2026-27` `/c/top-14/2026-27` `/c/premiership/2026-27` が 200 で、`<title>` と「N節 / 全M節」の表示が修正前と変わらない
15. `/c/lipovitan-challenge-cup-2026` が 200 で `<title>` が変わらない

### サイトマップ

16. `sitemap.xml` に `/c/rwc/2027/bracket` が1件含まれる
17. `sitemap.xml` の総 URL 件数が、修正前（1663件）から `+1` 以外に変動していない

### 再発防止

18. 「`app/c/` 配下の静的セグメントだけで構成されるルート」と「`generateStaticParams()` の出力」が交差しないことを検証するテストが追加されている
19. そのテストが、**現在のコード（修正前）では失敗する**ことを確認し、その出力を PR 本文に貼る（テストが実際に不具合を捕まえることの証明）

### 再検証間隔

20. `app/c/rwc/2027/page.tsx` に `export const revalidate = 3600` が追加されている（汎用ハブと同値）
21. `app/c/rwc/2027/bracket/page.tsx` の `revalidate = 60` は**変更されていない**
22. プレビューで `/c/rwc/2027` のレスポンスヘッダを取得し、`x-nextjs-prerender: 1` が引き続き返ることを PR 本文に貼る

### 品質ゲート

23. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

## 判定方法（効果測定）

| 確認 | 方法 | 期待 |
|---|---|---|
| 専用ページが配信される | 受け入れ条件6〜11 | 全件成立 |
| 既存ハブが壊れていない | 受け入れ条件13〜15 | 全件成立 |
| ブラケットの到達性 | 内部リンク数とサイトマップ | リンク1件以上・サイトマップ1件 |
| SEO | GSC で `/c/rwc/2027` の平均順位（修正前29〜58位・クリック0） | **本 spec では測らない。** 反映に数週間かかるため10月に別途確認する |

## 未解決の質問

1. ~~専用ページ側の `revalidate`~~ → **決着（2026-09-04 実測）。指定が無いことを確認し、`revalidate = 3600` の追加をスコープに含めた**（受け入れ条件20）
2. **会場名が英語のまま**（`Perth Stadium, Perth`）。「開催都市・会場」という日本語見出しの下に英語の会場名が8件並ぶ。本 spec では**触らない**が、表示されるようになって初めて見える問題なので Owner の目視判断が要る
3. `rwc-2023` にも専用ページを作るかは検討していない。**本 spec の対象外**
