`/specs/fix-a11y-contrast-and-reduced-motion.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## このタスクの性質

**変更するのは実質2ファイルです。** `app/globals.css`（トークン2つの値 ＋ `prefers-reduced-motion` ブロック1つ）と `design.md`（Accessibility 節の更新）。

**個別コンポーネントには触らないでください。** `--color-ink-muted` は161箇所、`--muted-foreground` は3箇所で使われていますが、**トークンの値を変えるだけで全部直ります。** 161箇所を個別に書き換えるのは誤りです。

同様に、`motion-reduce:` を各コンポーネントに足すのも誤りです。`@media (prefers-reduced-motion: reduce)` を1ブロック置けば125箇所すべてに効きます。

## 値は自分で再計算してください

spec に参考値（`#646a76` / `220 7% 42%`）を書いていますが、**転記せず必ず再計算して確認してください。** 計算式は spec の「算出方法」節にあります。

**背景を取り違えないでください。** ここが最大の落とし穴です。

- ページの背景は **`#f1efe9`**（`app/globals.css` の `body` セレクタが実際に描画する色）
- `--color-paper`（`#f5f6f8`）は**内部パネル用のトークンで、ページ背景ではありません**

`--color-paper` を背景として計算すると、コントラスト比が実際より甘く出ます。前回このリポジトリで実際に取り違えが起きています。

**判定は body 背景（`#f1efe9`）と白カード（`#ffffff`）の両方で 4.5:1 以上。** body 背景の方が厳しいので、そちらが律速です。

## 暗くしすぎないこと

4.5:1 を満たす最小限で止めてください。必要以上に暗くすると、二次テキストと本文（`--color-ink` = `#1f2530`）の区別がつかなくなり、情報階層が壊れます。

また `--color-ink-muted` と `--muted-foreground` は**近い明度に揃えてください**。同じ役割のテキストがページによって濃さが変わると不自然です。

## `--color-ink` は変更しないでください

body 背景上 13.37:1 で、本文テキストとしては十分です。ここを触ると紙面全体の印象が変わります。

## design.md の更新を忘れないこと

現在の design.md は Accessibility 節で「3.60:1 は known WCAG AA failure」「`prefers-reduced-motion` is currently implemented in 0 locations」と書いています。**修正したのに文書が「未達」と言い続ける状態にしないでください。**

ただし**数値そのものは残してください。** 「WCAG AA を満たしている」とだけ書いて実測値を消すのは、この文書の方針（D018）に反します。

## 完了の定義

spec の「受け入れ条件」9項目をすべて満たすこと。特に:

- `git diff --stat` の差分が `app/globals.css` と `design.md` のみ
- `grep -rn "motion-reduce:" app/ components/` が **0件**
- `grep -c "prefers-reduced-motion" app/globals.css` が **1**
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が clean

## PR 本文に必ず含めること

- **再計算したコントラスト比**（採用値 × body 背景 / 白カードの2通り）と、使った計算方法
- 変更前後のトークン値の対比表
- `git diff --stat` の出力（個別コンポーネントに触れていないことの証跡）
- design.md の Accessibility 節の変更前後
