# 試合詳細ページのヒーローに背景画像を追加する

## 背景

サイト全体の画像・ビジュアル監査（tryline-site-auditorエージェント、2026-07-07）で判明。試合詳細ページ（`/matches/[id]`）のヒーロー（`components/match-header.tsx`）は、チームカラーから生成したCSSグラデーションのみで構成されており、直下から4〜5段落の長文レビューが続く。最も読まれる有料コンテンツの入口が、最も「文字量に圧倒される」体験になっている。

`public/visuals/match-detail-bg.jpg` は既に生成済みでリポジトリに配置されているが、どのコードからも参照されておらず未使用（`grep -rn "match-detail-bg" app components` で確認済み、0件）。この画像は「観客無し・低コントラストのピッチライン質感、本文の背後に敷くことを想定した控えめなデザイン」というプロンプト意図（`docs/design-ui-growth-review-2026-07-03.md` D-7）で作られており、本specのユースケースに合致する。新規の画像生成は不要。

**訂正1（2026-07-07、初回実装のレビューで発覚）**: 初版のspecは既存4層グラデーションの最後尾に画像レイヤーをそのまま追加する内容だったが、4層目 `linear-gradient(135deg, ${homeColor}, ${awayColor})` が**完全不透明**（アルファなし）のため、実装後にVercelプレビューで確認したところ画像が100%隠れて見えなかった（`getComputedStyle`で`background-image`に画像URLは含まれているが、視覚的には完全に不可視）。CSSの複数背景レイヤーは前方の層が手前に描画されるため、不透明な層の後ろにある画像は原理的に見えない。

**訂正2（2026-07-07、訂正1の修正後レビューで再発覚）**: 訂正1で4層目を `color-mix(in srgb, ${homeColor} 88%, transparent)` にして透過させたが、実際にVercelプレビューで確認したところ、依然として画像がほぼ視認できなかった（NZ vs イタリアの濃紺〜青系カラーの組み合わせで実測）。原因は `public/visuals/match-detail-bg.jpg` 自体が「観客無し・極めて低コントラスト」というプロンプト意図で作られた近黒画像であり、88%不透明の色付きグラデーション越しでは、単純なアルファブレンドだと画像のピッチラインがほぼ消えてしまうため。

`background-blend-mode: screen` を4層目に適用したところ、画像の明るい部分（ピッチライン・隅のスパークルアイコン）が濃色系のチームカラーの上にもはっきり浮き出ることをブラウザで実測確認済み（screenブレンドは暗い色同士では変化がなく、明るい方の色が優先的に表に出るため、画像自体が近黒でも明るいディテールだけが選択的に透けて見える）。単純なアルファ不透明度の調整だけでは不十分で、blend modeの指定が必須。

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
+ backgroundBlendMode: "normal, normal, normal, screen, normal",
```

**重要（2点とも必須）**:
1. 4層目（対角線グラデーション）は元々 `${homeColor}, ${awayColor}` という完全不透明の色指定だった。これを `color-mix(in srgb, ${homeColor} 88%, transparent)` のように透過させること。
2. **それに加えて** `backgroundBlendMode: "normal, normal, normal, screen, normal"` を必ず指定すること（5層に対応する5つの値。4番目だけ `screen`、他は `normal`）。透過だけでは近黒の画像が濃色のチームカラーに完全に埋もれてしまうことを実測で確認済み。`screen` ブレンドモードにより、画像の明るい部分（ピッチライン・隅のアイコン）だけが選択的に浮き出て見えるようになる。

（CSSの複数背景レイヤーはカンマ区切りで前方が手前・後方が奥に描画される。1〜3層目の暗幕・チームカラーラジアルは元々半透明なので変更不要。`backgroundBlendMode` は各レイヤーとその下の合成結果との混合方法を指定する。）

`backgroundSize` / `backgroundPosition` / `backgroundBlendMode` の値はレイヤー数（5層）に合わせてカンマ区切りで指定すること。既存のグラデーション層には`cover`/`normal`指定が無意味だが害もないため、シンプルさのため該当しない層は`cover`/`normal`のままでよい。

## LLM 連携

なし

## 受け入れ条件

1. `components/match-header.tsx` のヒーロー背景に `public/visuals/match-detail-bg.jpg` が**視覚的に確認できる程度に**表示される。`background-image` に画像URLが含まれているだけでは不十分で、実際にブラウザでレンダリングしたスクリーンショットで画像のテクスチャ（ピッチライン・隅のアイコン等）が視認できることを確認すること。**濃色系のチームカラー同士の組み合わせ（例: ニュージーランド×イタリア等の紺・青系）を最低1件含めて確認する**こと（明るい配色では見えても濃色配色では埋もれる、という不具合が2回連続で発生したため）
2. 既存のチームカラーグラデーション・可読性（見出し・スコア・バッジの白文字）に regression がない
3. レイアウトシフト（CLS）が発生しない（画像は背景レイヤーであり、既存のセクション寸法を変えない）
4. 全ての大会・チームカラーの組み合わせで画像とグラデーションの重なりが破綻しない（数試合をランダムに確認する）
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 未解決の質問

なし。
