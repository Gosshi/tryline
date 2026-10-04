# Codex 指示書: デザイン刷新 第1弾（Web）— 色と書体の値を差し替える

仕様書: `specs/feat-touchline-foundation-web.md`
決定: `docs/decisions.md` の D037
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら（行番号のずれ以上の違い）、実装を進めずその場で止めて Owner に確認する。**最新の `origin/main` からブランチを切る。**

## やること

仕様書の UI サーフェス 1〜5 を実装する。

1. `app/layout.tsx`: `Zen_Maru_Gothic` を削除し、`Noto_Sans_JP`（可変・`--font-noto-sans-jp`）と `Shippori_Mincho_B1`（700/800・`--font-shippori-mincho`）を足す。`Outfit` はそのまま。`<html>` の `className` に 3 つの `.variable`。
2. `app/globals.css`: 書体の変数、`body` の太さ 400、`h1〜h3` の明朝・800、色の変数（表どおり）、新規 `--color-ink-strong` / `--color-brass`、`body` と `.bg-paper` の背景。
3. `tailwind.config.ts`: `fontFamily` の `display` / `heading` / `serif` の代替書体を `"serif"` に。
4. `design.md`: front-matter と、仕様書に挙げた 6 つの節（Overview・Colors・Typography・Brand Position・Visual Principles の 2・Accessibility）。
5. `tests/app/layout-metadata.test.ts`: `next/font/google` のモックを更新し、`RootLayout({ children: null }).props.className` のテストを足す。

## 触るファイル

- `app/layout.tsx`
- `app/globals.css`
- `tailwind.config.ts`
- `design.md`
- `tests/app/layout-metadata.test.ts`

## 守ること

- `--radius*` / `--shadow*` / `--space-*` / `--text-*` は変えない。角丸・影・余白・ページの構成・動きはこの PR の対象外。
- ロゴ（`components/site-header.tsx`）、`app/manifest.ts`、`viewport.themeColor`、OG 画像、`lib/format/team-identity.ts` は変えない。
- コンポーネントに直書きされた色（`components/score-graph.tsx` など）は変えない。
- `font-black` などコンポーネント側の Tailwind クラスは変えない。
- 既存のテストは消さない。落ちる assert があれば新しい期待値に書き換え、PR 本文に一覧を書く。

## 処理すべきエッジケース

1. 見出しに `font-black`（900）が付いている要素: Shippori Mincho B1 は 800 までなので、ブラウザは 800 を使う。太字の合成（faux bold）が起きていないことを、プレビューのスクリーンショットで見出しが潰れていないかで確認する。
2. 見出しの要素に `font-body` など本文書体のクラスが付いている箇所: クラスの指定が優先され、ゴシックのまま描かれる。これは意図どおり（変えない）。
3. 書体の読み込み前: `display: "swap"` で代替書体が先に出る。`next/font` の `adjustFontFallback`（既定で有効）を無効にしない。
4. `.bg-paper` と `body` の背景は同じ値にする（片方だけ直さない）。

## 検証

- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` を実行する。**すべて必ず実行し、結果を完了報告に含める。**
- 仕様書の受け入れ条件 6 の `rg` は、標準エラーを捨てずに実行し、出力を PR 本文に貼る。
- 受け入れ条件 7 の書体の読み込み量を、仕様書の「測り方」どおりに本番とプレビューで測り、表を PR 本文に貼る。プレビューの合計 KB が本番の 2 倍を超えたら、マージせず Owner に報告する。
- 受け入れ条件 8 のスクリーンショット（5 ページ × 1440 / 390）を PR 本文に貼る。
- 「壊して落ちる」確認（コミットしない）: 受け入れ条件 10。失敗の出力を PR 本文に貼る。

## 完了の定義

- PR が作成され、上の検証結果・スクリーンショット・書体の読み込み量の表がすべて PR 本文にある。
- マージは Owner がスクリーンショットを見て判断する。
