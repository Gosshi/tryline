# 試合詳細ページのヒーローに背景画像を追加する

## 背景

サイト全体の画像・ビジュアル監査（tryline-site-auditorエージェント、2026-07-07）で判明。試合詳細ページ（`/matches/[id]`）のヒーロー（`components/match-header.tsx`）は、チームカラーから生成したCSSグラデーションのみで構成されており、直下から4〜5段落の長文レビューが続く。最も読まれる有料コンテンツの入口が、最も「文字量に圧倒される」体験になっている。

`public/visuals/match-detail-bg.jpg` は既に生成済みでリポジトリに配置されているが、どのコードからも参照されておらず未使用（`grep -rn "match-detail-bg" app components` で確認済み、0件）。この画像は「観客無し・低コントラストのピッチライン質感、本文の背後に敷くことを想定した控えめなデザイン」というプロンプト意図（`docs/design-ui-growth-review-2026-07-03.md` D-7）で作られており、本specのユースケースに合致する。新規の画像生成は不要。

**訂正（2026-07-07、初回実装のレビューで発覚）**: 初版のspecは既存4層グラデーションの最後尾に画像レイヤーをそのまま追加する内容だったが、4層目 `linear-gradient(135deg, ${homeColor}, ${awayColor})` が**完全不透明**（アルファなし）のため、実装後にVercelプレビューで確認したところ画像が100%隠れて見えなかった（`getComputedStyle`で`background-image`に画像URLは含まれているが、視覚的には完全に不可視）。CSSの複数背景レイヤーは前方の層が手前に描画されるため、不透明な層の後ろにある画像は原理的に見えない。本版で4層目に透過性を持たせるよう修正した。

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
+   linear-gradient(135deg, color-mix(in srgb, ${homeColor} 88%, transparent), color-mix(in srgb, ${awayColor} 88%, transparent)),
+   url(/visuals/match-detail-bg.jpg)
  `,
+ backgroundSize: "cover, cover, cover, cover, cover",
+ backgroundPosition: "center, center, center, center, center",
```

**重要**: 4層目（対角線グラデーション）は元々 `${homeColor}, ${awayColor}` という完全不透明の色指定だった。これを `color-mix(in srgb, ${homeColor} 88%, transparent)` のように**必ず透過させる**こと。透過させないと、CSSの背景レイヤーは前方が手前に描画される仕様上、5層目の画像が完全に隠れて見えなくなる（実際に発生した不具合）。88%という数値は目安であり、画像が薄く透ける程度（チームカラー・白文字の可読性を損なわない範囲）に調整してよいが、100%（透過なし）にしないこと。

（CSSの複数背景レイヤーはカンマ区切りで前方が手前・後方が奥に描画される。1〜3層目の暗幕・チームカラーラジアルは元々半透明なので変更不要。）

`backgroundSize` / `backgroundPosition` の値はレイヤー数（5層）に合わせてカンマ区切りで指定すること。既存のグラデーション層には`cover`指定が無意味だが害もないため、シンプルさのため全層に同じ値を指定してよい。

## LLM 連携

なし

## 受け入れ条件

1. `components/match-header.tsx` のヒーロー背景に `public/visuals/match-detail-bg.jpg` が**視覚的に確認できる程度に**表示される。`background-image` に画像URLが含まれているだけでは不十分で、実際にブラウザでレンダリングしたスクリーンショットで画像のテクスチャ（ピッチライン等）が薄くでも視認できることを確認すること（前回のレビューで「CSS上は存在するが完全に不可視」というリグレッションが実際に発生したため、このスクリーンショット確認を必須とする）
2. 既存のチームカラーグラデーション・可読性（見出し・スコア・バッジの白文字）に regression がない
3. レイアウトシフト（CLS）が発生しない（画像は背景レイヤーであり、既存のセクション寸法を変えない）
4. 全ての大会・チームカラーの組み合わせで画像とグラデーションの重なりが破綻しない（数試合をランダムに確認する）
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 未解決の質問

なし。
