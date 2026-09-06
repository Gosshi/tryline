仕様書 `specs/fix-home-sr-only-overflow-escape.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

**トップページがページ全体として横に 862px スクロールします。** 本番で実測しました（2026-09-06、`clientWidth = 1470`）。

```js
document.documentElement.scrollWidth        // 2332
document.documentElement.clientWidth        // 1470
document.body.scrollWidth                   // 1470   ← body は収まっている
window.scrollTo(10000, 0); window.scrollX   // 862    ← 実際に動く
```

## 原因は特定済みです。推測で探さないでください

`app/page.tsx:831` の **`<span className="sr-only"> 最新シーズン</span>`** です。

```
ul.flex.gap-3.overflow-x-auto      clientWidth 1406 / scrollWidth 2444  ← 正しくクリップしている
  li.w-52 | li.w-40 .shrink-0
    a.group.flex.h-24 … overflow-hidden        ← position: static  （app/page.tsx:809）
      span
        span.mt-1.flex …                        ← position: static
          <span className="sr-only"> 最新シーズン</span>   ← app/page.tsx:831
```

Tailwind の `sr-only` は `position: absolute` を含みます。**この span の祖先に positioned 要素が 1 つも無いため、包含ブロックが初期包含ブロック（ICB）になります。** 結果、スクローラ内部の静的位置（x ≈ 2331）にレイアウトされながら `ul` の `overflow-x: auto` にクリップされず、ビューポートのスクロール可能領域を 2332px まで広げます。

絶対配置で右端が `clientWidth` を超える要素を全列挙したところ、**該当 6 件がすべてこの span** で、最右の右端 2332px が `documentElement.scrollWidth` と完全に一致しました。

**`ul.overflow-x-auto` は正しく実装されています。** `min-width` の漏れでも grid の最小幅問題でもありません。そこを触らないでください。

## 修正候補は 2 つとも本番 DOM で検証済みです

| 操作 | `scrollWidth` | `scrollTo(10000,0)` 後の `scrollX` |
|---|---|---|
| 現状 | 2332 | 862 |
| 各 span の祖先 `<a>` に `position: relative` | **1470** | **0** |
| 各 span を DOM から削除 | **1470** | （未計測） |
| 元に戻す | 2332 | 862 |

`<a>` は既に `overflow-hidden` を持つので、`relative` を足すだけで包含ブロックになり span がクリップされます。

**どちらを採ってもかまいません。選んだ理由と実測値を PR 本文に書いてください。**

判断材料として: `app/page.tsx:808` の `<Link>` には既に `aria-label` があり、その値に「最新シーズン」が含まれています。**`aria-label` は accessible name を上書きするため、この `sr-only` span は現状すでに読み上げに寄与していません。** ただしこれは削除を指示するものではありません。削除を選ぶ場合は受け入れ条件 6 の読み上げ確認が必須です。

## 触るファイル

```
app/page.tsx
```

`specs/fix-home-unwanted-horizontal-scroll.md` への supersede 注記は追加済みです（受け入れ条件 9 は確認のみ）。

トップページの HTML には `sr-only` が 19 箇所、`overflow-x-auto` が 2 箇所あります。**19 箇所すべてを機械的に触らないでください。** スクローラ配下にあり、かつ祖先に positioned 要素が無いものだけが対象です。受け入れ条件 5 のスクリプトで判定してください。

## やってはいけないこと

**`html` / `body` / `main` に `overflow-x: hidden` や `overflow: hidden` を足さないでください。**

`specs/fix-home-unwanted-horizontal-scroll.md` が同じ症状に対してまさにそれを指示し、PR #520 で `app/globals.css:74,87` に `overflow-x: clip` として実装されました。**そして効きませんでした。** 包含ブロックが ICB の絶対配置要素は `html` ボックスのクリップの外側にあるためです。上の実測は、その `clip` が両方効いている状態のものです。

`app/globals.css` は**無改変**にしてください。既存の `clip` は削除もしません（別要因の overflow を露出させうるため。削除可否は Owner が別途判断します）。

カード幅（`w-52` / `w-40`）、`gap`、`px`、`max-w-[1536px]` も変更しないでください。**見た目は 1px も変わらないのが正解です。**

## テストについて

**`pnpm test` が green であることを完了根拠にしないでください。** jsdom にはレイアウトエンジンが無く、`scrollWidth` と `getBoundingClientRect()` は常に 0 を返します。この spec の中心的な条件は vitest では検証できません。

`pnpm test` は「既存のホームページテストを壊していない」ことの確認としてのみ実行してください（受け入れ条件 8）。

## 完了の定義

受け入れ条件 1〜10 をすべて満たし、**PR 本文に次を貼ること**。

1. 375 / 768 / 1440px の 3 幅での `{ clientWidth, scrollWidth, scrollXAfterScrollTo }` の**実際の数値**
2. `ul.overflow-x-auto` の `{ clientWidth, scrollWidth }`（横スクロールが残っている証拠）
3. 絶対配置の逸脱要素を列挙するスクリプトの結果（空配列であること）
4. 大会カードの accessible name の確認結果
5. `pnpm lint` / `pnpm typecheck` / `pnpm test` の結果

**判定は `scrollWidth - clientWidth <= 1` かつ `scrollX === 0` です。`scrollWidth === clientWidth` の厳密一致を条件にしないでください** — スクロールバー幅とサブピクセル丸めで 1px 差が正常に生じます。合否だけでなく実数値を貼ることが条件です。

Owner の目視確認（375 / 768 / 1440px で見た目が変わっていないこと、カード列が横に動くこと）は PR 作成後に Owner が行います。
