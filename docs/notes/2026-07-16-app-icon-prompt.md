# iOSアプリアイコン 生成プロンプト

確定コンセプト（Fable/GPT-5.6並行レビュー統合、2026-07-16）: インク地・紙色の単純化ラグビーボール・赤いトライライン。文字/バッジ枠/グラデーションなし。

生成はこちらから実行しない（LLMコスト保護ルール）。Owner が外部ツール（Gemini/ChatGPT/Midjourney等）で生成し、結果画像をこの会話に貼って検品→採用。

## 確定カラー

- 背景（インク）: `#1f2530`
- ボール（紙色）: `#f5f6f8`
- トライライン（赤）: `#c93a40`

## プロンプト案A（推奨・フラットアイコン優先）

```
A minimalist flat app icon design, filling the entire square canvas edge-to-edge with a solid dark navy-charcoal background color #1f2530, no gradient, no texture, no shadow, no vignette. Centered in the icon is a single simplified rugby ball silhouette in flat solid off-white color #f5f6f8, drawn as a clean geometric oval/lens shape (pointed at both ends), with only 1 to 3 thick straight stitch marks across its center — not a realistic or textured ball, purely iconographic and bold. A single thin horizontal line in red color #c93a40 runs across the icon behind or through the ball, like a try line on a rugby pitch, extending edge to edge.
Flat vector illustration style, ultra-minimal modern app icon design (similar to the reductive style of well-known flat sports or news app icons), bold and geometric, high contrast, designed to remain legible at very small sizes (40px).
Strictly no text, no letters, no numbers, no words, no logos, no wordmarks, no circular badge or emblem frame, no outer ring or border, no crest shape, no photorealistic rendering, no 3D bevel or embossing, no drop shadow, no gradient fill, no sponsor marks, no real team branding, no watermark.
Square canvas, centered composition, generous padding around the ball so nothing touches the edges except the red line.
```

## プロンプト案B（バリエーション・線をより強調）

```
Flat minimalist app icon, solid navy-charcoal background #1f2530 filling the full square frame, no gradient or texture. A bold off-white #f5f6f8 rugby ball silhouette sits slightly below center, simplified to a clean geometric pointed-oval shape with 2 thick straight stitch lines, iconographic not realistic. One bold horizontal red #c93a40 line cuts straight across the lower third of the icon, overlapping the bottom edge of the ball, evoking a try line.
Ultra-flat vector app icon aesthetic, high contrast, bold simple shapes only, must read clearly at 40px thumbnail size.
No text, no letters, no numbers, no logos, no wordmarks, no badge circle, no ring border, no crest, no gradients, no shadows, no bevel, no photorealism, no watermark, no sponsor marks.
Square canvas, symmetric padding, nothing touching the canvas edges except the red line.
```

## 検品チェックリスト

- [ ] 完全にフラット（グラデーション・影・立体感なし）か
- [ ] 文字・ロゴ・バッジ枠・外周装飾が一切無いか
- [ ] ボールが単純な幾何学形（縫い目1〜3本のみ）で、写実的すぎないか
- [ ] 赤い線が1本、明確に見えるか
- [ ] 1024pxの縮小版（40〜60px相当に画面上で縮小 or ズームアウト）でもラグビーボールと分かるか
- [ ] 正方形キャンバスいっぱいに使われているか（iOS の角丸マスクで四隅が削られる前提）

AI生成が完全にフラットにならない場合（グラデーションや過度な質感が残る場合）は、その生成画像をシルエットの参考にして Figma 等でベクター化する方が確実。写真調ビジュアルと違いアイコンは精度が重要なため、生成1発で仕上げようとせず「形の参考」として扱ってよい。

## 保存先（採用後）

`tryline-mobile/assets/icon.png`（1024×1024）として配置し、`app.config.ts` に `icon: "./assets/icon.png"` を追加。決定後、`public/icons/` の壊れた緑プレースホルダー PWA アイコンと、X/note のプロフィール画像も同じマークに差し替える運用が Fable/GPT 両方から提案されている（別タスク）。
