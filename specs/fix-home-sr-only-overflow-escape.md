# fix-home-sr-only-overflow-escape

> **本 spec は `specs/fix-home-unwanted-horizontal-scroll.md`（PR #520、`2c3d08a`）を supersede する。** 旧 spec は同じ症状を扱い、`html` / `body` への `overflow-x: hidden` を対処として実装済みだが、**2026-09-06 の本番実測で効いていないことを確認した**。原因の診断が誤っていたためである。詳細は「旧 spec が効かなかった理由」を参照。

## 背景

2026-09-05 の監査（`docs/audits/gpt6-full-audit-2026-09-05.md` A-1 新規所見、A-6 #3）で、**トップページがページ全体として横スクロールする**ことが再度実測された。375px viewport で `document` 幅 2,316px、`scrollTo(10000, 0)` 後に `scrollX=1941`。

監査時点では「2,316px を生む単一原因までは特定していない」とされていた。**2026-09-06 に本番で原因を特定し、修正候補の効果まで実測で確認した。**

### 実測（2026-09-06、`https://www.trylinerugby.com/`、`clientWidth = 1470`）

| 測定 | 値 |
|---|---|
| `document.documentElement.scrollWidth` | **2332** |
| `document.documentElement.clientWidth` | 1470 |
| `document.body.scrollWidth` | **1470** |
| `getComputedStyle(html).overflowX` | `clip` |
| `getComputedStyle(body).overflowX` | `clip` |
| `scrollTo(10000, 0)` 後の `window.scrollX` | **862**（= 2332 − 1470） |

`body` は 1470 に収まっているのに `html` が 2332 になる。この差が手がかりだった。

`position` が `absolute` / `fixed` で右端が `clientWidth` を超える要素を列挙すると、**該当 6 件がすべて同一種類の要素**だった。

```
tag: span, class: "sr-only", text: "最新シーズン",
position: absolute, width: 1px, offsetParent: body,
right: 2332 / 2160 / 1988 / 1816 / 1644 / 1472
```

最右の 1 件の右端 **2332px が `documentElement.scrollWidth` と完全に一致する。**

### 機序

`app/page.tsx:797` の大会カード列は横スクロールする意図的な UI である。

```
ul.flex.gap-3.overflow-x-auto     clientWidth 1406 / scrollWidth 2444  ← 正しくクリップしている
  li.w-52 | li.w-40 .shrink-0
    a.group.flex.h-24 … overflow-hidden          ← position: static   （app/page.tsx:809）
      span
        span.mt-1.flex …                          ← position: static
          <span className="sr-only"> 最新シーズン</span>   ← app/page.tsx:831
```

Tailwind の `sr-only` は `position: absolute` を含む。**この span の祖先に positioned 要素が 1 つも無いため、包含ブロックが初期包含ブロック（ICB）になる。** その結果、静的位置（スクローラ内部の x ≈ 2331）にレイアウトされながら **`ul` の `overflow-x: auto` にクリップされず**、ビューポートのスクロール可能領域を 2332px まで広げる。

**`ul` 自体は正しく実装されている。** `overflow-x: auto` は機能しており、`min-width` の指定漏れでも grid の最小幅問題でもない。監査が候補に挙げた「gridの最小幅・子要素の`min-width`・装飾のクリップ」はいずれも原因ではなかった。

### 旧 spec が効かなかった理由

`specs/fix-home-unwanted-horizontal-scroll.md` は原因を「`ul.overflow-x-auto` の存在自体が `documentElement.scrollWidth` を内部スクロール分だけ増やす」と診断し、`html` / `body` への `overflow-x: hidden` を対処とした。PR #520 で `overflow-x: clip` として実装され、`app/globals.css:74`（`html`）と `:87`（`body`）に現存する。

この診断は誤りである。正しくクリップしているスクローラは祖先のスクロール可能領域に寄与しない。旧 spec の二分探索が `ul` を犯人と示したのは、**原因の `sr-only` span が `ul` の中にあった**ためで、`ul` 自体が原因だったからではない。

そして `html` の `overflow-x: clip` は本症状を止められない。**包含ブロックが ICB である絶対配置要素は `html` ボックスのクリップの外側にあり、ビューポートのスクロール可能領域を広げる。** 上表のとおり、`clip` が両方に効いている状態で実際に 862px スクロールする。

数値も悪化している。旧 spec 執筆時は 1647 vs 1455（差 192px）、現在は 2332 vs 1470（差 862px）。大会カードが増えるたびに広がる。

### 検証済みの修正候補

本番 DOM 上で 2 通りを実測した。**どちらも `scrollWidth` を `clientWidth` と同値にし、実際にスクロールしなくなる。**

| 操作 | `scrollWidth` | `scrollTo(10000,0)` 後の `scrollX` |
|---|---|---|
| 現状 | 2332 | 862 |
| 各 `sr-only` span の祖先 `<a>` に `position: relative` | **1470** | **0** |
| 各 `sr-only` span を DOM から削除 | **1470** | （未計測） |
| 元に戻す | 2332 | 862 |

`<a>` は既に `overflow-hidden` を持つため、`relative` を足すだけで包含ブロックになり span がクリップされる。

### 冗長性についての事実

`app/page.tsx:808` の `<Link>` には既に次の `aria-label` がある。

```tsx
aria-label={`${formatFamilyName(competition.family)} ${competition.season} 最新シーズン`}
```

**`aria-label` は要素の accessible name を上書きするため、子孫の `sr-only` span は accessible name に一切寄与していない。** つまりこの span は現状すでに読み上げに影響していない。この事実は修正方法を選ぶための材料であって、**削除を指示するものではない**。どちらを採るかは下記のとおり実装側の判断でよい。

## スコープ

対象:
- `app/page.tsx` の `sr-only` span 起因の document 横オーバーフローを解消する
- `specs/fix-home-unwanted-horizontal-scroll.md` の冒頭に、本 spec に supersede された旨を追記する

対象外:
- **`ul.overflow-x-auto` による意図した横スクロールの廃止・変更**（監査も「アーカイブ内の意図した横スクロールまで一律に消さない」と明記している）
- カード幅（`w-52` / `w-40`）、`gap`、`px`、`max-w-[1536px]` 等のレイアウト値の変更
- **`app/globals.css:74,87` の既存 `overflow-x: clip` の削除**。効いていないが、削除すると将来の別要因の overflow を露出させうる。本 spec では触らず、根本原因のみ直す。削除の可否は別途 Owner が判断する
- **`html` / `body` に新たな `overflow-x: hidden` / `overflow: hidden` を足すこと。これは禁止**（旧 spec と同じ失敗を繰り返す）
- `app/globals.css` の `sr-only` 定義そのものの書き換え（影響範囲がサイト全体に及ぶ。必要と判断した場合は実装を止めて Owner に相談する）
- 監査 A-1 のその他の指摘（情報階層、言語混在、コピーと実態、無料サンプル、CTA、1440px 密度）。**本 spec は横オーバーフロー 1 点のみ**
- 大会ハブ・カレンダー・試合詳細のレイアウト

### 他ページを対象外とする根拠（2026-09-06 実測）

| URL | `clientWidth` | `scrollWidth` | overflow |
|---|---|---|---|
| `/` | 1470 | **2332** | あり |
| `/c/nations-championship/2026` | 1336 | 1336 | なし |
| `/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a` | 1336 | 1336 | なし |

大会ハブは `overflow-x-auto` を 10 箇所持つが `sr-only` は 1 箇所のみで、絶対配置の逸脱要素は 0 件だった。

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

トップページの大会カード列。**見た目は変わらない。** 変わるのはページ全体が横に動かなくなることだけである。

## LLM 連携

なし。コスト影響ゼロ。

## 変更詳細

`app/page.tsx` の当該 `sr-only` span がスクローラの外へ逸脱しないようにする。上表の 2 通りのいずれか（祖先を positioned にする／span を削る）を採る。**どちらを採ってもよいが、選んだ理由と実測値を PR 本文に書くこと。**

同一パターンが `app/page.tsx` 内の他の `overflow-x-auto` 配下にも無いか確認する。トップページの HTML には `sr-only` が 19 箇所、`overflow-x-auto` が 2 箇所ある。**19 箇所すべてを機械的に触らないこと。** スクローラ配下にあり、かつ祖先に positioned 要素が無いものだけが対象である。判定は受け入れ条件 5 のスクリプトで行う。

## 受け入れ条件

**テストについての前提**: jsdom にはレイアウトエンジンが無く、`scrollWidth` / `getBoundingClientRect()` は常に 0 を返す。**本 spec の中心的な条件は vitest では検証できない。「`pnpm test` が green」を完了根拠にしてはならない。** 実測値の提出をもって検証とする。既存のホームページテストを壊さないことは条件 8 で別途担保する。

1. **実測**: プレビュー URL の `/` を開き、次を実行した結果を PR 本文に貼ること

```js
const de = document.documentElement;
window.scrollTo(10000, 0);
await new Promise(r => setTimeout(r, 300));
const sx = window.scrollX;
window.scrollTo(0, 0);
({ clientWidth: de.clientWidth, scrollWidth: de.scrollWidth, scrollXAfterScrollTo: sx });
```

2. **判定基準**: `scrollWidth - clientWidth <= 1` かつ `scrollXAfterScrollTo === 0` であること。

   **`scrollWidth === clientWidth` の厳密一致を条件にしないこと** — スクロールバー幅とサブピクセル丸めで 1px 差が正常に生じうる。過去に同型の厳密一致条件で 2 回差し戻している。一方 `scrollX` は整数で 0 か否かが明確なので、こちらは厳密一致でよい。**実際の数値を貼ること自体が条件**であり、合否だけの報告は不可

3. 上記を **375 / 768 / 1440px** の 3 幅で実施し、3 件とも条件を満たすこと

4. **意図した横スクロールが残っていること**: 同ページで次を実行し、`scrollWidth > clientWidth` であること（大会カード列は横に動いてよい）

```js
const ul = document.querySelector('ul.overflow-x-auto');
({ clientWidth: ul.clientWidth, scrollWidth: ul.scrollWidth });
```

5. **絶対配置の逸脱要素が 0 件**であること。次を実行して空配列になること

```js
[...document.querySelectorAll('*')].filter(el => {
  const cs = getComputedStyle(el);
  return (cs.position === 'absolute' || cs.position === 'fixed')
    && el.getBoundingClientRect().right + window.scrollX > document.documentElement.clientWidth + 1;
}).map(el => el.tagName + '.' + el.className);
```

6. **読み上げが退行していないこと**: 大会カードの accessible name が従来どおり「<大会名> <シーズン> 最新シーズン」であること。DevTools の Accessibility パネルで 1 件確認し、結果を PR 本文に書く。**span を削除する方法を採る場合はこの確認が必須**

7. `app/globals.css` に差分が無いこと。`html` / `body` / `main` に `overflow-x: hidden` または `overflow: hidden` を新たに追加していないこと

8. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green（既存のホームページテストを壊していないことの確認）

9. `specs/fix-home-unwanted-horizontal-scroll.md` の冒頭に supersede 注記が入っていること

10. **Owner の目視評価**: 375 / 768 / 1440px でトップページの見た目が従来と変わっていないこと。大会カード列が指・トラックパッドで横に動くこと

## 未解決の質問

なし。原因・修正方法・検証方法がすべて本番実測で確定している。
