# 二次テキストのコントラスト未達と reduced-motion 未対応を直す

## 背景

デザイン監査（`docs/design/audit-2026-08-24.md`、所見 A-4 / C-2 / D-3 / D-4）で、WCAG AA を満たしていない箇所が2つ見つかった。D018 の「影響」欄に**実バグとして別 spec で扱う**と記録済み。

**これは見た目の好みの問題ではない。** 二次テキスト（メタ情報・補足ラベル・日付など）が読みにくい状態で、色覚や視力に制約のある読者に実害がある。

### 1. 二次テキストのコントラストが WCAG AA 未達

2026-08-25 実測。背景は `app/globals.css` の `body` が実際に描画する `#f1efe9` と、白カード `#ffffff` の両方。

| トークン | 現行値 | body 背景上 | 白カード上 | 要求 |
|---|---|---:|---:|---:|
| `--color-ink-muted` | `#767d8b` | **3.60:1** | **4.14:1** | 4.5:1 |
| `--muted-foreground` | `220 7% 50%`（= `#777d88`） | **3.60:1** | **4.14:1** | 4.5:1 |

2つは実質同じ色で、同じ問題を抱えている。**どちらの背景でも 4.5:1 に届いていない。**

なお `--color-ink`（`#1f2530`）は body 背景上 13.37:1 で、本文テキストとしては十分。**本 spec では変更しない。**

### 2. `prefers-reduced-motion` が0箇所

`app/globals.css`・`app/`・`components/` を通して `prefers-reduced-motion` / `motion-reduce:` / `motion-safe:` の記述が **0件**。一方 `transition-*` / `animate-*` の宣言は **125箇所**ある。

前庭障害・動揺病のある読者にとって、OS の「視差効果を減らす」設定が無視される状態は実害がある。

## スコープ

対象:
- `app/globals.css` の `--color-ink-muted` と `--muted-foreground` の値変更
- `app/globals.css` への `prefers-reduced-motion` ブロック追加
- `design.md` の Accessibility 節を、修正後の実測値に更新

対象外:
- **個別コンポーネントの色指定の書き換え。** トークン変更で一括して直るため不要
- `--color-ink` の変更（本文テキストは十分なコントラストがある）
- focus ring の再設計（`--ring` は現行のまま）
- ダークモード対応（本プロダクトに存在しない）
- 監査の他の改善候補 #2 / #4 / #5 / #6

## 算出方法

**値を転記するのではなく、この方法で再計算して確認すること。**

WCAG 2.x の相対輝度式を使う。

1. sRGB の各チャネル `c`（0〜255）を `c/255` に正規化
2. `c <= 0.03928` なら `c/12.92`、そうでなければ `((c + 0.055) / 1.055) ** 2.4`
3. `L = 0.2126*R + 0.7152*G + 0.0722*B`
4. コントラスト比 = `(L_明 + 0.05) / (L_暗 + 0.05)`

**背景は2つとも検証すること。** `body` の実背景 `#f1efe9`（`app/globals.css` の `body` セレクタ）と、白カード `#ffffff`。`--color-paper`（`#f5f6f8`）は内部パネル用トークンでページ背景ではないので、これを背景に使って計算しない。

**判定条件: 両方の背景で 4.5:1 以上。** body 背景の方が条件が厳しいので、そちらが律速になる。

## 変更内容

### 1. `--color-ink-muted`

色相を保ったまま暗くする。参考値として `#646a76`（body 4.73:1 / white 5.43:1）を算出済み。これは 4.5:1 を満たす最小限の変更に近い。

**Codex は再計算して確認したうえで、この値かそれより暗い値を採用すること。** 必要以上に暗くすると二次テキストと本文の区別がつかなくなるため、`--color-ink`（`#1f2530`）との差は保つ。

### 2. `--muted-foreground`

shadcn 互換トークンなので **HSL 形式のまま**変更する（`220 7% 50%` の形式を崩さない）。参考値 `220 7% 42%`（= `#646973`、body 4.79:1 / white 5.51:1）。

`--color-ink-muted` と近い明度に揃えること。2つが大きくずれると、同じ役割のテキストがページによって濃さが変わる。

### 3. `prefers-reduced-motion` ブロック

`app/globals.css` の `@layer base` に追加する。**個別コンポーネントに `motion-reduce:` を125箇所足すのではなく、1ブロックで一括対応する。**

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

`!important` が必要なのは、Tailwind のユーティリティが要素側で `transition-duration` を指定しており、詳細度で勝てないため。`0` ではなく `0.01ms` にするのは、`transitionend` を前提にしたコードがあった場合にイベントが発火しなくなるのを避けるため。

`scroll-behavior` を含めるのは、`scroll-behavior: smooth` が指定されている場合に同じ配慮が必要なため。**現行コードに `smooth` があるかを確認し、無ければこの行を入れるかは裁量でよい。**

### 4. `design.md` の Accessibility 節

現在の記述は「`--color-ink-muted` は 3.60:1 で **known WCAG AA failure**」となっている。修正後の実測値に更新し、**未達でなくなったなら「未達」の記述を消すこと。**

同様に「`prefers-reduced-motion` is currently implemented in 0 locations. This is a known unmet requirement」も、対応後の状態に書き換える。

**design.md には引き続き実測値を書く。** 「WCAG AA を満たしている」とだけ書いて数値を消さない。

## 影響範囲

| トークン | 使用箇所 |
|---|---:|
| `--color-ink-muted` | 161 |
| `--muted-foreground` | 3 |

**トークンの値を変えるだけなので、161箇所の個別修正は発生しない。**

濃色背景の上で `--color-ink-muted` が使われていないことは確認済み（暗くしても読めなくなる箇所は無い）。検証コマンド:

```bash
grep -rn "color-ink-muted" app/ components/ | grep -i "bg-\[var(--color-ink)\]\|bg-slate-9\|bg-black\|bg-neutral-9"
# → 0件
```

濃色セクション（`app/page.tsx:258`、`app/en/page.tsx:29`）の内側のテキスト色も確認済みで、いずれも `text-white` / `text-white/70` / `text-[var(--color-accent)]` のみ。`ink-muted` は含まれない。

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

**二次テキスト（メタ情報・日付・補足ラベル）が現在より濃くなる。** これは意図した変更であり、回帰ではない。レイアウト・サイズ・余白は一切変わらない。

`prefers-reduced-motion: reduce` を有効にした環境でのみ、トランジションとアニメーションが実質無効になる。通常環境の見え方は変わらない。

## LLM 連携

なし

## 受け入れ条件

1. `--color-ink-muted` が、body 実背景 `#f1efe9` と白カード `#ffffff` の**両方**で 4.5:1 以上
2. `--muted-foreground` が同じく両方で 4.5:1 以上。**HSL 形式のまま**変更されている
3. 両トークンの明度が近く、同一役割のテキストがページによって濃さが変わらない
4. `--color-ink` が変更されていない
5. `app/globals.css` に `prefers-reduced-motion: reduce` のブロックが**1つだけ**存在する（個別コンポーネントへの `motion-reduce:` 追加は0件）
6. 個別コンポーネントの色指定に差分が無い（`app/globals.css` と `design.md` 以外のファイルで色の変更が0件）
7. `design.md` の Accessibility 節が修正後の実測値に更新され、「known failure」「unmet requirement」の記述が実態と一致している
8. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean
9. PR 本文に、**再計算したコントラスト比の値と計算方法**が記載されている

## 未解決の質問

- 二次テキストが濃くなることで紙面の印象が変わる。**視覚的な最終確認は Owner が本番で行う。** 濃すぎると感じた場合、4.5:1 を割らない範囲で調整の余地がある（`#646a76` は下限に近いため、明るくする余地はほとんど無い）
- `--team-home`（`#667085`）/ `--team-away`（`#475467`）もテキスト色として使われている場合は同種の問題がありうる。**本 spec では扱わない。** 使用箇所を確認したうえで、必要なら別 spec とする
