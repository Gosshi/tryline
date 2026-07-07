# 試合詳細ページのヒーローに背景画像を追加する

## 背景

サイト全体の画像・ビジュアル監査（tryline-site-auditorエージェント、2026-07-07）で判明。試合詳細ページ（`/matches/[id]`）のヒーロー（`components/match-header.tsx`）は、チームカラーから生成したCSSグラデーションのみで構成されており、直下から4〜5段落の長文レビューが続く。最も読まれる有料コンテンツの入口が、最も「文字量に圧倒される」体験になっている。

`public/visuals/match-detail-bg.jpg` は既に生成済みでリポジトリに配置されているが、どのコードからも参照されておらず未使用（`grep -rn "match-detail-bg" app components` で確認済み、0件）。この画像は「観客無し・低コントラストのピッチライン質感、本文の背後に敷くことを想定した控えめなデザイン」というプロンプト意図（`docs/design-ui-growth-review-2026-07-03.md` D-7）で作られており、本specのユースケースに合致する。新規の画像生成は不要。

## スコープ

対象:
- `components/match-header.tsx:64-77`（ヒーローの`background`を構成しているstyleブロック）に、既存のグラデーション層の下に `public/visuals/match-detail-bg.jpg` を追加する

対象外:
- 大会ごとに異なる背景画像を出し分けること（`match-detail-bg.jpg` は1枚の汎用アセットとして全試合共通で使う。大会別バリエーションは将来の別spec）
- ヒーロー以外のセクション（本文中のイラスト区切り等）
- 新規画像生成（`public/visuals/match-detail-bg.jpg` を使うのみ）

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

`components/match-header.tsx` の `<section>` の `style` に設定されている `background` の値（既存4層のグラデーション: 暗幕オーバーレイ→ホームチーム色ラジアル→アウェイチーム色ラジアル→対角線グラデーション）の最下層（一番背後）に画像レイヤーを追加する。

```diff
  background: `
    linear-gradient(180deg, rgb(12 16 28 / 16%), rgb(12 16 28 / 38%)),
    radial-gradient(135% 110% at 6% 0%, color-mix(in srgb, ${homeColor} 92%, transparent), transparent 62%),
    radial-gradient(135% 110% at 96% 100%, color-mix(in srgb, ${awayColor} 92%, transparent), transparent 62%),
-   linear-gradient(135deg, ${homeColor}, ${awayColor})
+   linear-gradient(135deg, ${homeColor}, ${awayColor}),
+   url(/visuals/match-detail-bg.jpg)
  `,
+ backgroundSize: "cover, cover, cover, cover, cover",
+ backgroundPosition: "center, center, center, center, center",
```

（CSSの複数背景レイヤーはカンマ区切りで前方が手前・後方が奥に描画される。既存のグラデーション群は画像の上に重なるため、既存のチームカラー表現・可読性は変わらない。）

`backgroundSize` / `backgroundPosition` の値はレイヤー数（5層）に合わせてカンマ区切りで指定すること。既存のグラデーション層には`cover`指定が無意味だが害もないため、シンプルさのため全層に同じ値を指定してよい。

## LLM 連携

なし

## 受け入れ条件

1. `components/match-header.tsx` のヒーロー背景に `public/visuals/match-detail-bg.jpg` が描画される（ブラウザDevToolsの計算済みスタイルで確認）
2. 既存のチームカラーグラデーション・可読性（見出し・スコア・バッジの白文字）に regression がない
3. レイアウトシフト（CLS）が発生しない（画像は背景レイヤーであり、既存のセクション寸法を変えない）
4. 全ての大会・チームカラーの組み合わせで画像とグラデーションの重なりが破綻しない（数試合をランダムに確認する）
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 未解決の質問

なし。
