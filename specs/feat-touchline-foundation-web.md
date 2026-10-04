# デザイン刷新 第1弾（Web）: 色と書体の値を THE TOUCHLINE に差し替える

## 背景

D037（2026-10-04）で、Web と iOS アプリのデザインを「THE TOUCHLINE（A4）」に刷新すると決めた。基準ビジュアルは `docs/notes/gpt-web-redesign-2026-10-03/mock-a4.html`、変更点と動きの一覧は同フォルダの `revision-a4.md`。

刷新は 1〜2 日の単位に分けて進める（D037 決定6）。**この spec は第1弾で、サイト全体の「色」と「書体」の値だけを差し替える。** ページの構成・角丸・影・動きは、ページごとの後続 spec で扱う。

色と書体を先に入れる理由:
- サイトの色は `app/globals.css` の変数に集まっている（`--color-*` / shadcn の `--background` 等を参照している箇所が `app/` と `components/` に 553 箇所）。変数を替えるだけで全ページが新しい色になる。
- 書体は今、Zen Maru Gothic（丸ゴシック）を本文と見出しの両方に使っている。D037 決定4で、本文を Noto Sans JP、見出しを明朝の Web フォントに固定すると決めた。読者の約 6 割が Windows で、OS の書体に任せると Mac と別の字形（游ゴシック・游明朝）になるため。

## スコープ

対象:
- `app/layout.tsx`: 読み込む Web フォントの差し替え
- `app/globals.css`: 色の変数・本文と見出しの書体・背景の紙の色
- `tailwind.config.ts`: 見出し系の `fontFamily` の代替書体を `serif` に
- `design.md`: front-matter と「Colors」「Typography」の節を実装に合わせる（D018）
- `tests/app/layout-metadata.test.ts`: `next/font/google` のモックの更新と、書体の変数のテスト追加

対象外（後続の spec で扱う。この PR では触らない）:
- 角丸（`--radius*`）・影（`--shadow*`）。今の値のまま。各ページの `rounded-2xl` などの直書きが多く、変数だけ替えると角丸が混在するため
- ページの構成・余白・新しい部品（トップの全幅の見出し、ティッカー、大会ページの並び替え、スコア帯のチーム色の面）
- 動き（アニメーション）
- ロゴ（`components/site-header.tsx` の「● Tryline」）とアプリのアイコン・`app/manifest.ts`・`viewport.themeColor`（`#c93a40` のまま）
- OG 画像（`app/api/og/route.tsx`）
- コンポーネントに直書きされた色（`components/score-graph.tsx` の `#dfe2e8` / `#767d8b` / `#1f2530`、各ページの濃紺のヒーローのグラデーション、`#f8fafc` など）
- チームの色（`lib/format/team-identity.ts`）
- iOS アプリ（tryline-mobile で別 spec）

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

### 1. 書体（`app/layout.tsx`）

`next/font/google` の読み込みを次の 3 つにする。`Zen_Maru_Gothic` の import と呼び出しは削除する。

| 用途 | フォント | 指定 | CSS 変数 |
|---|---|---|---|
| 本文 | `Noto_Sans_JP` | `weight` を指定しない（可変フォント）、`subsets: ["latin"]`、`display: "swap"` | `--font-noto-sans-jp` |
| 見出し | `Shippori_Mincho_B1` | `weight: ["700", "800"]`、`subsets: ["latin"]`、`display: "swap"` | `--font-shippori-mincho` |
| 数字 | `Outfit` | 今のまま（`weight: ["500", "700"]`） | `--font-number`（今のまま） |

- 3 つとも `next/font/google` の font-data に存在することを確認済み（Noto Sans JP は `variable` あり、Shippori Mincho B1 は 400〜800、2026-10-04 に `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json` で確認）。
- `<html>` の `className` には 3 つの `.variable` を並べる。
- `subsets: ["latin"]` は今の Zen Maru Gothic と同じ扱い（日本語の文字は `unicode-range` で分割されたファイルが、使う文字の分だけ読み込まれる）。

### 2. 書体の割り当て（`app/globals.css` / `tailwind.config.ts`）

- `--font-body: var(--font-noto-sans-jp);`
- `--font-heading: var(--font-shippori-mincho);`
- `body` の `font-weight` を `500` → `400` にする。
- `h1, h2, h3` の `font-family` を `var(--font-heading), serif`、`font-weight` を `900` → `800` にする（Shippori Mincho B1 の最大が 800）。
- `tailwind.config.ts` の `fontFamily` の `display` / `heading` / `serif` の代替書体を `"sans-serif"` → `"serif"` にする。`body` と `number` は `"sans-serif"` のまま。
- コンポーネント側の `font-black`（900）は変えない。見出し書体の要素では 800 が使われ、本文書体（Noto Sans JP は 900 まである）の要素では 900 のまま描かれる。

### 3. 色（`app/globals.css` の `:root`）

shadcn の変数（HSL。小数 1 桁は 16 進に戻したとき元の色と一致することを確認済み）:

| 変数 | 今 | 新 | 16 進 |
|---|---|---|---|
| `--background` | `220 13% 97%` | `42 33% 94%` | `#f5f2eb` |
| `--foreground` | `219 22% 15%` | `222 13.5% 14.5%` | `#20232a` |
| `--card` | `0 0% 100%` | `42.9 100% 98.6%` | `#fffdf8` |
| `--card-foreground` | `219 22% 15%` | `222 13.5% 14.5%` | `#20232a` |
| `--primary` | `357 57% 51%` | 変えない | `#c93a40` |
| `--primary-foreground` | `0 0% 100%` | 変えない | `#ffffff` |
| `--muted` | `220 14% 95%` | `42 19.2% 89.8%` | `#eae7e0` |
| `--muted-foreground` | `220 7% 42%` | `226.7 4.5% 39.4%` | `#606269` |
| `--border` | `220 16% 94%` | `42 11.4% 82.7%` | `#d8d5ce` |
| `--input` | `220 16% 94%` | `42 11.4% 82.7%` | `#d8d5ce` |
| `--ring` | `357 57% 51%` | 変えない | `#c93a40` |

Tryline の変数:

| 変数 | 今 | 新 |
|---|---|---|
| `--color-panel` | `#f5f6f8` | `#eae7e0` |
| `--color-ink` | `#1f2530` | `#20232a` |
| `--color-ink-muted` | `#646a76` | `#606269` |
| `--color-rule` | `#eceef2` | `#d8d5ce` |
| `--color-accent` | `#c93a40` | 変えない |
| `--color-accent-dim` / `--color-accent-subtle` | — | 変えない |
| `--team-home` / `--team-away` | — | 変えない |
| **新規** `--color-ink-strong` | — | `#17191f`（墨色の大きな面。第1弾では使う箇所なし。後続の spec が使う） |
| **新規** `--color-brass` | — | `#956137`（小見出し。同上） |

### 4. 背景の紙（`app/globals.css` の `body` と `.bg-paper`）

`body` と `.bg-paper` の 2 箇所を同じ値に変える。

- `background-color: #f1efe9;` → `background-color: #f5f2eb;`
- `background-image` の 1・2 行目（赤と紺の `radial-gradient`）は**削除**する（A4 の紙色には色味の重ねがない）。
- 3 行目の `linear-gradient(180deg, #f8f7f4 0%, #f1efe9 45%, #eceae3 100%)` → `linear-gradient(180deg, #f8f6f1 0%, #f5f2eb 45%, #efebe3 100%)`
- 4 行目の紙のざらつき（`url("data:image/svg+xml,...")`）は今のまま残す。

### 5. `design.md`

D018 に従い、実装と文書を一致させる。
- front-matter の `name` を `"Tryline Touchline"`、`description` を A4 の方向（紙色・墨色・赤・明朝の見出し）に書き換える。
- front-matter の `colors` と `colors.shadcn` を上の表の値に。`ink-strong` と `brass` を追加する。
- front-matter の `typography.family`（body / heading / number）と `weights` を上の 1・2 の値に。
- front-matter の `page-background` を `"#f5f2eb"` に。
- 本文は次の 5 節を書き換える。それ以外の節（Spacing・Layout・Density・Block Intent・Elevation & Depth・Shapes・Components・Do's and Don'ts・Sports Adaptation）は変えない。
  - **Overview**: 方向を THE TOUCHLINE（D037、2026-10-04）に。基準ビジュアルを `docs/notes/gpt-web-redesign-2026-10-03/mock-a4.html` に。「角丸・影・動き・ページ構成は後続の spec で移行中」と明記する。
  - **Colors**: 上の 3・4 の値（背景の 2 つの `radial-gradient` を外したことも）。
  - **Typography**: 上の 1・2 の値（本文 Noto Sans JP 400、見出し Shippori Mincho B1 800、数字 Outfit）。
  - **Brand Position**: 「friendly, soft-modern」を、紙面のように読める・墨色と赤・アイコンとロゴは据え置き、という D037 の方向に。
  - **Visual Principles** の 2: 「rounded Japanese typography and soft surfaces」を「明朝の見出しとゴシックの本文、紙色の面」に。
  - **Accessibility**: コントラストの数値を新しい色で書き直す。Claude Code が WCAG の相対輝度で計算した値（2026-10-04）: 本文 `#20232a` / 背景 `#f5f2eb` = 14.07:1、補助 `#606269` / 背景 = 5.45:1、補助 / カード `#fffdf8` = 5.99:1、真鍮 `#956137` / 背景 = 4.65:1、白 / 赤 `#c93a40` = 5.04:1、赤の文字 / 背景 = 4.51:1。

### 確認する画面

Vercel のプレビューで、次の 5 ページをデスクトップ（1440×900）とスマホ（390×844）で撮り、PR 本文に貼る。
- `/`
- `/c/top-14/2026-27`
- `/matches/3577d392-73ef-462f-b73c-d5e88f6e8e41`（オーストラリア 42-38 南アフリカ。レビュー本文がある）
- `/calendar`
- `/h2h/japan-vs-usa`

## LLM 連携

なし。

## 受け入れ条件

1. `app/layout.tsx` が `Noto_Sans_JP` / `Shippori_Mincho_B1` / `Outfit` の 3 つを読み込み、`<html>` の `className` に 3 つの `.variable` が入る。`Zen_Maru_Gothic` はリポジトリから消える（下の 6 の grep）。
2. `tests/app/layout-metadata.test.ts`:
   - `vi.mock("next/font/google", …)` に `Noto_Sans_JP: () => ({ variable: "--font-noto-sans-jp" })` と `Shippori_Mincho_B1: () => ({ variable: "--font-shippori-mincho" })` を足し、`Zen_Maru_Gothic` を消す。**足さないと `@/app/layout` の import で関数が無くて落ちる**ので、既存の `metadata` のテストが通ることで確認できる。
   - 新しいテストを 1 本足す: `RootLayout({ children: null })` を**関数として呼び**（描画はしない。`RootLayout` は同期関数で `<html>` 要素を返す）、返り値の `props.className` を空白で分けた配列が `--font-noto-sans-jp`・`--font-shippori-mincho`・`--font-number` の 3 つを含み、`--font-zen-maru` を含まない。描画しないので `SiteHeader`（async のサーバーコンポーネント）等のモックは不要。
3. `app/globals.css` の値が UI サーフェスの 2〜4 の表と一字一句一致する。`--radius*` と `--shadow*` と `--space-*` と `--text-*` は変更していない（`git diff app/globals.css` に出ない）。
4. `tailwind.config.ts` の差分は `fontFamily` の `display` / `heading` / `serif` の 3 行だけ。
5. `design.md` の front-matter の色が `app/globals.css` と一致する。対象は 14 個: shadcn で値の変わる 8 個（`background` / `foreground` / `card` / `card-foreground` / `muted` / `muted-foreground` / `border` / `input`）、Tryline で値の変わる 4 個（`panel` / `ink` / `ink-muted` / `rule`）、新規 2 個（`ink-strong` / `brass`）。
6. 次の grep の結果が空（標準エラーを捨てずに実行し、出力を PR 本文に貼る）:
   ```
   rg -n "Zen_Maru|zen-maru|Zen Maru" app components lib tests design.md tailwind.config.ts
   rg -n "#f1efe9|#f8f7f4|#eceae3|#f5f6f8|#eceef2|#646a76|#1f2530" app/globals.css design.md
   ```
7. 書体の読み込み量を、同じ方法で本番とプレビューの両方で測り、PR 本文に表で貼る（下の「測り方」）。**プレビューの合計 KB が本番の 2 倍を超えたら、マージせず Owner に報告する。**
8. 上の 5 ページ × 2 幅のスクリーンショットを PR 本文に貼る。Owner が見た目を確認してからマージする（D018〜D023 の UI 変更の作法）。
9. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る。
10. 「壊して落ちる」確認（コミットしない）: `app/layout.tsx` の `className` から `shippori.variable`（命名は実装に合わせる）を外すと、2 の新しいテストが落ちる。落ちた出力を PR 本文に貼る。

### 測り方（受け入れ条件 7）

Playwright で、新しいコンテキスト（キャッシュなし、1440×900）で各ページを開き、`networkidle` の後 1.5 秒待つ。その間の応答のうち URL に `/_next/static/media/` を含み `.woff2` で終わるものの件数と、`response.body()` の合計バイト数を数える。対象は `/`・`/c/top-14/2026-27`・`/matches/3577d392-73ef-462f-b73c-d5e88f6e8e41` の 3 ページ。

参考値（2026-10-04、本番、この方法で Claude Code が測定）: `/` 262 件・134 KB、`/c/top-14/2026-27` 270 件・272 KB、試合ページ 266 件・385 KB。`response.body()` が取れない応答があると KB は小さく出るので、比較は同じ時間帯に本番とプレビューを続けて測った値どうしで行う。

**訂正（2026-10-04、PR #907 の確認時）**: 上の参考値は `response.body()` の取りこぼしで大幅に小さく出ていた。`performance.getEntriesByType('resource')` もブラウザの記録上限（250 件）で頭打ちになり使えない。実際に読み込まれた量は、ページ上で `document.fonts` のうち `status === "loaded"` の FontFace に対応する `@font-face` の `src` を集め、各 URL を `fetch` してバイト数を足す方法で測った。この方法での実測:

| ページ | 本番（Zen Maru Gothic） | PR #907 プレビュー | 比 |
|---|---|---|---|
| `/` | 280 件・4,558 KB | 158 件・6,065 KB | 1.33 倍 |
| `/c/top-14/2026-27` | 281 件・4,570 KB | 50 件・1,025 KB | 0.22 倍 |
| 試合ページ | 278 件・4,531 KB | 176 件・6,477 KB | 1.43 倍 |

受け入れ条件 7（2 倍以内）は満たす。明朝（Shippori Mincho B1）が `/` で 131 件と多いのは、`h3` などの見出しに 700 と 800 の 2 つの太さが使われ、見出しの文字の種類が多いため。

## 未解決の質問

- なし（書体・色・ロゴ・アイコンは D037 で Owner 決定済み）。見出しの明朝を Shippori Mincho B1 にしたのは Claude Code の選定（モックの游明朝に近い字形、太さ 700/800 がある）。プレビューのスクリーンショットで Owner が違和感を持った場合は、Zen Old Mincho（900 まである）に差し替える。
