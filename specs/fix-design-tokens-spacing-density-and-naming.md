# デザイントークン: spacing / density / layout の新設と、命名乖離2件の整理

## 背景

`docs/decisions.md` の **D020**（2026-08-31、Owner 承認済み）で決まった作業のうち、トークンと文書に関する部分。

### 1. `design.md` が spacing / density / layout を1行も定義していない

| 軸 | design.md | app/globals.css | tailwind.config.ts |
|---|---|---|---|
| colors / typography / radius / shadows | 定義あり（20値。**front-matter と実装は 2026-08-31 に一致済み**） | あり | あり |
| **spacing** | **front-matter に `space` の語が0回** | **`--space-*` が0個** | **拡張なし** |
| **density** | **0** | — | — |
| **layout / grid / column** | **0**（Layout 節は4文、うち2文がモバイル向け） | — | — |
| **breakpoints** | **0** | — | `screens` 拡張なし |

`design.md` の出自は refero（commit `91ea49f`、2026-05-06）で、**refero の DESIGN.md が持つ spacing（base unit + density: compact / comfortable）と layout の節だけが落ちている。**

### 2. レイアウトは 640px で分岐して、そこから上は何も変わっていない

`app/` と `components/` のソース走査（2026-08-31）:

| ブレークポイント接頭辞 | 出現回数 |
|---|---|
| `sm:`（640px） | **221** |
| `md:`（768px） | 49 |
| `lg:`（1024px） | **24** |
| `xl:`（1280px） | **6** |
| `2xl:`（1536px） | 1 |

**読者の63%がデスクトップ**（GA4、2026-07-31〜08-27）である一方、1024px を超えた領域に効く指定は実質30箇所しかない。デスクトップ表示が「引き伸ばされたモバイル」になっている構造的な理由がこれである。

実測される結果（1336×759）:

| 面 | 実測 |
|---|---|
| `/calendar`（14試合週） | 最初の試合行 top=724px、全体3.52画面、**1画面目に試合0件** |
| `/c/urc/2026-27` | `#schedule` top=1273px、最初の試合カード1398px |
| カレンダー1行（幅1008px） | チーム名終端〜時刻開始の空白 **542〜696px（54〜69%）** |

### 3. 実装は既に一貫した spacing を持っている。文書化されていないだけ

同じ走査で、実際に使われている値:

| ユーティリティ | 上位の使用実績 |
|---|---|
| `gap-*` | `gap-2` 64 / `gap-3` 52 / `gap-4` 36 / `gap-1.5` 17 / `gap-6` 10 / `gap-8` 6 / `gap-5` 6 |
| `px-*` | `px-4` 117 / `px-3` 72 / `px-6` 43 / `px-5` 37 / `px-2` 32 / `px-8` 30 |
| `py-*` | `py-2` 76 / `py-3` 41 / `py-4` 29 / `py-1.5` 27 / `py-0.5` 27 / `py-1` 25 |
| コンテナ | `max-w-6xl` **14**（最頻・1152px） / `max-w-2xl` 12 / `max-w-3xl` 8 / `max-w-5xl` 7 |

**base unit は 4px で、実質的なスケールは 2 / 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32 / 40px。** これを書き起こすのが本 spec の主作業であり、値の発明ではない。

### 4. トークン命名の乖離2件

| トークン | 定義 | 実態 | 消費箇所 |
|---|---|---|---|
| `--font-serif-jp` | `app/globals.css:45` で `var(--font-zen-maru)` | Zen Maru Gothic は**丸ゴシックでセリフではない** | **0箇所**（デッドコード） |
| `--color-paper` | `app/globals.css:21` で `#f5f6f8` | **body の実際の背景は `#f1efe9`**。別物 | 3箇所（すべて内部パネル） |

`--color-paper` の3箇所（`app/matches/[id]/page.tsx:548`、`components/match-events-section.tsx:196`、`components/score-graph.tsx:57`）は**いずれも内部パネル用途**で、`design.md` の記述（"it is an internal-panel token, not the page background"）と一致している。**値も用途も正しい。問題は名前だけ。**

真に紛らわしいのは、ページ背景ユーティリティ **`.bg-paper`**（21ファイルで使用、`#f1efe9` を直書き）との名前衝突である。**この衝突が D018 に記録されたコントラスト誤算の直接原因**だった（`--color-paper` を body 背景と取り違えて再計算し、正しかった Codex の値を誤りと判定しかけた）。

補足: Tailwind の `font-serif` ユーティリティは `tailwind.config.ts:40` で `var(--font-heading)` に割り当てられており、**`--font-serif-jp` を経由していない**。`font-serif` は10ファイル以上で使われているが、これは丸ゴシックの見出しを指す意図的な用法であり、本 spec では**変更しない**。

## スコープ

対象:
- `design.md` — front-matter に `spacing` / `layout` を新設、本文に対応する節を追加
- `app/globals.css` — `--space-*` トークンの追加、`--font-serif-jp` の削除、`--color-paper` の改名
- `app/matches/[id]/page.tsx` / `components/match-events-section.tsx` / `components/score-graph.tsx` — 改名したトークンへの追従（3箇所）
- `tailwind.config.ts` — 必要なら `screens` / `maxWidth` の明示

対象外:
- **既存画面の見た目の変更。** 本 spec は**トークンと文書だけ**を触る。**レンダリング結果に差分を出してはいけない**
- `/calendar` の週ボード化（`specs/feat-calendar-week-board.md`。本 spec のトークンを使う側）
- `.bg-paper` ユーティリティの改名（21ファイルに波及する。**本 spec では触らない**）
- Tailwind の `font-serif` ユーティリティ（意図的な用法。触らない）
- 色・書体・角丸・影の値（D018 と D020 で確定済み）
- `--space-*` を既存コンポーネントに適用して回ること（**トークンを定義するだけ**。適用は各 spec 側の仕事）

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

**見た目に差分を出さない。** これが本 spec の最重要制約。

### `design.md` front-matter に追加する節

値は**実装の実測から書き起こす**（発明しない）。`density.desktop` と `listRow` だけが新規決定。

```yaml
spacing:
  base: "4px"
  scale:
    "0.5": "2px"
    "1": "4px"
    "1.5": "6px"
    "2": "8px"
    "3": "12px"
    "4": "16px"
    "5": "20px"
    "6": "24px"
    "8": "32px"
    "10": "40px"
  density:
    mobile: "comfortable"
    desktop: "compact"
layout:
  container: "1152px"          # max-w-6xl。実装で最頻（14箇所）
  breakpoints:
    sm: "640px"
    md: "768px"
    lg: "1024px"
    xl: "1280px"
  listRow:
    appliesTo: "new-and-redesigned-surfaces"   # 既存画面へ遡及適用しない
    mobile:
      orientation: "stacked"
    desktop:
      orientation: "columnar"
      maxEmptyRatio: 0.25
```

`maxEmptyRatio: 0.25` は**新規に決める値**。「デスクトップの一覧行で、主要テキストの終端から次の列の開始までの空白が、行幅の25%を超えてはならない」という規定。現状のカレンダーは 54〜69%。

**適用範囲は「新規に作る面」と「その spec で作り変える面」に限る**（Owner 判断、2026-09-01）。既存の全画面へ遡って適用する義務は課さない。理由は、既存画面（試合ページ・ホーム・チーム／選手ページ）がこの基準を満たすか未調査であり、**全画面一律にすると事実上どの spec も通らなくなる**ため。`appliesTo` にその旨を記す。

### `design.md` 本文に追加する節

front-matter に対応する散文を、既存の Colors / Typography 節と同じ書き方で追加する。最低限:

- **Spacing**: base unit 4px。スケールの用途（`gap-2` は密な要素間、`gap-4` は要素群、`px-4` は既定の水平パディング等、**実装の使われ方を記述する**）
- **Layout**: コンテナ幅1152px。ブレークポイント4段。**「`sm:` で分岐して終わりにせず、`lg:` 以上で情報の並べ方を変える」ことを明示的に要求する**（実測 `sm:` 221 vs `lg:` 24 の偏りが問題の原因であるため）
- **Density**: モバイルは comfortable（縦積み・読みやすさ優先）、デスクトップは compact（列組み・走査性優先）。**同じ縦積みを横に引き伸ばさない**

### `app/globals.css` の変更

1. `--space-*` トークンを `:root` に追加する（上記スケールに対応）
2. **`--font-serif-jp` を削除する**（消費箇所0）
3. `--color-paper` を **`--color-panel`** に改名する。`.bg-paper` との混同を断つため。値 `#f5f6f8` は変えない
4. 上記3箇所の `var(--color-paper)` を `var(--color-panel)` に置換する

`design.md` の Colors 節の `--color-paper` に関する記述も、新しい名前に合わせて更新する。

## LLM 連携

なし。

## 受け入れ条件

1. `design.md` の front-matter に `spacing.base` / `spacing.scale` / `spacing.density.mobile` / `spacing.density.desktop` / `layout.container` / `layout.breakpoints` / `layout.listRow` が存在する
2. `layout.listRow.appliesTo` が `"new-and-redesigned-surfaces"` であり、本文にも**既存画面へ遡及適用しない**旨が書かれている
3. `spacing.scale` の各値が、実装で実際に使われている Tailwind の間隔（2/4/6/8/12/16/20/24/32/40px）と対応している
4. `layout.container` が `1152px`（`max-w-6xl`）である
5. `design.md` 本文に Spacing / Layout / Density に相当する節が追加され、front-matter の各キーが散文でも説明されている
6. 本文の Layout 節に「`lg:` 以上で情報の並べ方を変える」旨の要求が明記されている
7. `app/globals.css` に `--space-*` トークンが定義されている
8. `app/globals.css` から `--font-serif-jp` が**削除されている**
9. リポジトリ全体（`app` / `components` / `lib` / `tailwind.config.ts`）に `--font-serif-jp` の参照が**0件**である
10. `app/globals.css` に `--color-panel: #f5f6f8` が定義され、`--color-paper` が**存在しない**
11. `var(--color-paper)` の参照がリポジトリ全体で**0件**、`var(--color-panel)` が**3件**（`app/matches/[id]/page.tsx` / `components/match-events-section.tsx` / `components/score-graph.tsx`）
12. `.bg-paper` ユーティリティは**変更されていない**（21ファイルの利用側にも差分が無い）
13. Tailwind の `font-serif` ユーティリティと `tailwind.config.ts:40` のマッピングが**変更されていない**
14. `design.md` の Colors 節が `--color-panel` を説明しており、`--color-paper` に言及していない
15. **`design.md` の front-matter と `app/globals.css` を突き合わせる検算を行い、色・書体・角丸・影の20項目が引き続き全件一致することを PR 本文に貼る**（2026-08-31 に一致を確認済み。回帰させないこと）
16. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

### 見た目の非回帰（最重要）

17. 次の5ページについて、デスクトップ幅 **1440** と モバイル幅 **390** のスクリーンショットを変更前後で撮り、**差分がゼロ**であることを示す:
    `/` / `/calendar` / `/c/urc/2026-27` / `/matches/<任意の公開済み試合>` / `/c/nations-championship/2026`
18. `--space-*` を**既存コンポーネントに適用していない**（定義の追加のみ。`git diff` に `space-` を使う JSX/CSS の変更が含まれない）

### デザイン品質

19. 追加する散文は、既存の Colors / Typography 節と**同じ書き方・同じ密度**であること。箇条書きの羅列にしない
20. **Owner による目視確認を要する。** `density.desktop: compact` の記述が、実装者が読んで判断できる粒度になっているかは機械的には判定できない（`maxEmptyRatio` の適用範囲は 2026-09-01 に「新規・改修面のみ」で決着済み）

## 判定方法（効果測定）

本 spec 自体は**見た目を変えないため、GA4 で測る指標は無い。** 効果は後続 spec が使うことで現れる。

代わりに次を成立条件とする。

| 確認 | 方法 | 期待 |
|---|---|---|
| 文書と実装の一致 | 受け入れ条件14の突き合わせ | 色・書体・角丸・影 20項目 + spacing の全件一致 |
| 後続 spec が参照できるか | `specs/feat-calendar-week-board.md` が `design.md` の `layout.listRow` を根拠に受け入れ条件を書けること | 書ける |
| 再発防止 | 次回のデザイン監査で「spacing の規定が無い」が所見に上がらないこと | 上がらない |

## 未解決の質問

1. ~~`maxEmptyRatio: 0.25` は妥当か~~ → **決着（Owner 判断、2026-09-01）。適用範囲を「新規・改修する面のみ」に限定する。** 既存画面へ遡及適用しない。`appliesTo: "new-and-redesigned-surfaces"` を front-matter に明記すること
2. **`--space-*` トークンを定義しても、既存実装は Tailwind のユーティリティを使い続ける。** 二重管理になるが、Tailwind の既定スケールが 4px 基準で一致しているため実害は無いと判断した。CSS 変数側を「文書上の権威」、Tailwind を「実装手段」と位置づける
3. **`.bg-paper` の改名を将来行うか。** 21ファイルに波及するため本 spec では見送った。`--color-panel` への改名で混同の主因は消えるが、`.bg-paper` という名前自体は依然として `#f1efe9`（paper ではなく page background）を指す
