# 日本語見出しフォントの修正（font-serif の Oswald エイリアス解消）

## 背景

サイト最大のタイポグラフィが事実上「未指定」になっている。

- `tailwind.config.ts:35-40` で `fontFamily` の `serif` / `display` / `heading` の3つすべてが `var(--font-heading)` を指している
- `--font-heading` は `app/layout.tsx:12-17` で **Oswald（next/font/google、`subsets: ["latin"]`）** に割り当てられている。Oswald は日本語グリフを1文字も持たない
- さらに `app/globals.css:58-62` の base レイヤーで `h1, h2, h3 { font-family: var(--font-heading) }` が一括指定されている

結果、ホームヒーローの `<h1 className="font-serif ...">海外ラグビーを、日本語で深掘り。</h1>`（`app/page.tsx:192`）をはじめ、**サイト内のほぼすべての日本語見出しがフォールバックの `sans-serif` ＝閲覧端末任せのシステムフォントで描画**されている（Windows: 游ゴシック / Android: Noto Sans 等、端末ごとにバラバラ）。`--font-body` の Noto Sans JP は正常。

これは「テンプレ感が強い」という課題の最大の単一原因であり、`docs/growth-design-review-2026-06.md` §1.1-1 / §1.3（マッチシート方向）の第一歩。

## スコープ

対象:
- `app/layout.tsx` — 日本語セリフフォントの追加ロード
- `tailwind.config.ts` — `fontFamily` マッピングの修正
- `app/globals.css` — `h1, h2, h3` の base ルール修正

対象外:
- 各ページ・コンポーネントの className 変更（既存の `font-serif` / `font-heading` / `font-display` 指定はそのまま活かす）
- 色・余白・レイアウト等その他のデザイン変更（design.md 本体の別 spec）
- 英語ページ専用の書体設計

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### 1. フォントロード（`app/layout.tsx`）

`Noto_Serif_JP` を next/font/google で追加する:

```tsx
const serifJp = Noto_Serif_JP({
  subsets: ["latin"], // next/font が unicode-range で日本語グリフを分割配信する
  variable: "--font-serif-jp",
  weight: ["600", "700"],
  display: "swap",
  preload: false, // 日本語フォントは preload せず swap に任せる（FOUT 許容）
});
```

`<html>` の className に `serifJp.variable` を追加。Oswald（`--font-heading`）と Noto Sans JP（`--font-body`）は**削除しない**。

### 2. Tailwind マッピング（`tailwind.config.ts`）

| クラス | 現状 | 変更後 | 役割 |
|---|---|---|---|
| `font-serif` | `var(--font-heading)`（Oswald） | `["var(--font-serif-jp)", "Hiragino Mincho ProN", "Yu Mincho", "serif"]` | 日本語の大見出し（ヒーロー・recap 見出し・pricing 等） |
| `font-heading` | `var(--font-heading)` | `font-serif` と同じスタック | 大会ハブ・H2H 等の見出し |
| `font-display` | `var(--font-heading)` | `["var(--font-heading)", "sans-serif"]`（Oswald 維持） | スコア・順位表の数字・uppercase 英字ラベル専用 |
| `font-body` | 変更なし | 変更なし | 本文 |

`font-display` の現使用箇所（`components/standings-table.tsx:73` の tabular 数字、`components/round-heading.tsx:39` の uppercase ラベル）は Latin/数字のみのため Oswald のままで正しい。

### 3. base ルール（`app/globals.css`）

```css
h1, h2, h3 {
  font-family: var(--font-serif-jp), "Hiragino Mincho ProN", "Yu Mincho", serif;
}
```

`var(--font-heading)` への一括指定を上記に差し替える。

## LLM 連携

なし

## 受け入れ条件

1. ホーム（`/`）のヒーロー h1 で、Playwright の `getComputedStyle` により `font-family` の先頭が Noto Serif JP のカスタムプロパティ由来であること。かつ `document.fonts.check('700 32px "Noto Serif JP"')` が true（日本語グリフが実ロードされている）
2. 日本語テキストを含む見出し（ホームヒーロー / `/pricing` h1 / 試合ページ recap 内 H1 見出し / `/calendar` h1）に Oswald が適用されていない
3. `components/standings-table.tsx` の数字と `components/round-heading.tsx` のラベルは引き続き Oswald（`font-display`）で描画される
4. 375px / 1440px の両ビューポートでホーム・試合詳細・pricing のスクリーンショットを撮り、見出しの折返し・行間に崩れがないこと（Noto Serif JP は Oswald よりグリフ幅が広いため `break-keep` 周りを目視確認）
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
6. Lighthouse（または next build の出力）でフォント追加によるレイアウトシフトの悪化が顕著でないこと（`display: swap` + `preload: false` の組で確認）

## 未解決の質問

1. **書体の最終確定**: 本 spec は Noto Serif JP を既定とするが、design.md 方向では Shippori Mincho も候補。差し替えは `app/layout.tsx` の1箇所で済むため、まず Noto Serif JP で出して実物を見て Owner が判断する
2. **大会ハブの英語タイトル**: `app/c/[competition]/...` の h1 は大半が Latin（"Six Nations" 等）で、Oswald のままの方が映る可能性がある。本 spec では `font-heading` ごとセリフに寄せるが、実画面を見て「Latin タイトルのみ `font-display` に戻す」例外を後続で検討
3. Noto Serif JP のウェイト（600/700 の2つで足りるか。recap 本文中の見出しは 700 のみで良いか）
