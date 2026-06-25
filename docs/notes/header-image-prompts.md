# note 見出し画像 生成プロンプト集（ChatGPT 画像生成用）

毎週の note ヘッダー用。**文字は AI に描かせず、ビジュアルだけ生成 → タイトルは後で note / Canva で重ねる**方針。

## 使い方
1. 下の「共通指示」＋「方向性プロンプト」を1つ繋げて ChatGPT に投げる
2. 比率は **横長 1.91:1（約1280×670）**＝note ヘッダー / X 兼用
3. 同じプロンプトで2〜3枚出させて好みを選ぶ（"give me 3 variations"）
4. 崩れた文字が出たら "remove all text and letters" で再生成

## ⚠️ 注意
- **実在チームのロゴ・選手の顔・ユニフォームの紋章は出さない**（著作権／肖像）。プロンプトに毎回 "no real team logos, no identifiable faces, no team branding" を含める
- 日本語タイトルは AI に描かせない（崩れる）。**左上を空ける**指定で後載せ前提

---

## 共通指示（毎回これを先頭に付ける）

```
Create a wide landscape banner image, 1.91:1 aspect ratio (about 1280x670), for a blog header about overseas (international) club rugby union. Leave generous clean negative space in the upper-left area so a Japanese headline can be added later. No text, no letters, no numbers, no logos, no identifiable faces, no real team branding, no watermark. Professional, high-quality editorial look.
```

---

## 方向性バリエーション（好きなものを共通指示の後に続ける）

### 1. シネマティック・ナイトスタジアム（王道・万能）
```
Style: a cinematic wide shot of a modern rugby stadium at night under bright floodlights. A single rugby ball frozen in mid-air spinning toward the goal posts. Atmospheric haze, soft lens flare, deep blue and teal tones with warm highlights, shallow depth of field, epic championship-night mood.
```

### 2. ボールド・グラフィックポスター（Trylineのカード配色に合わせる）
```
Style: a bold modern sports poster illustration. An abstract dynamic rugby ball over diagonal geometric color blocks in cyan, violet and hot pink on a deep navy background. Energetic motion lines, flat vector style with subtle grain, high contrast, contemporary editorial design.
```

### 3. ミニマル・ラグジュアリー（落ち着いた回に）
```
Style: a minimalist premium banner. One rugby ball resting in dramatic side light on a smooth charcoal-to-black gradient. Soft rim light, lots of empty space, refined luxury aesthetic, subtle film grain, moody and elegant.
```

### 4. レトロ・プリント / リソグラフ（毎週と差をつけたい回に）
```
Style: a retro 1970s sports magazine cover aesthetic. A rugby ball and a stadium silhouette in a limited risograph palette of burnt orange, teal and cream. Halftone dot texture, vintage print grain, bold simple shapes, nostalgic feel.
```

### 5. ダイナミック・シルエット（試合の熱量を出したい回に）
```
Style: dramatic silhouettes of rugby players in mid-action (tackling, passing, leaping for a lineout), backlit by intense stadium light and golden dust. No visible faces. Strong rim lighting, dynamic diagonal composition, cinematic backlit haze, dark teal and amber palette.
```

### 6. トロフィー / チャンピオンシップ（決勝・優勝回に最適）
```
Style: a glowing championship trophy beside a rugby ball on a dark reflective surface. Warm golden spotlight from above, soft blurred confetti falling in the background, celebratory finals atmosphere, rich shadows, premium cinematic product-shot look.
```

### 7. 南北“同日決勝”コンセプト（今週=決勝ラッシュ回にぴったり）
```
Style: a split diptych concept divided by a dynamic diagonal line. Left side: a sunny southern-hemisphere daytime rugby pitch. Right side: a floodlit northern-hemisphere night stadium. A rugby ball crossing the divide between them. Cinematic, balanced cool and warm tones, symbolic of two finals happening on the same day.
```

---

## タイトル後載せのコツ
- 生成画像を note にアップ → note の見出し設定でそのまま使う
- 文字を画像に焼きたいなら Canva 等で：左上に白 or 黄(#facc15)の太ゴシックで「【今週の海外ラグビー】…」、下部に小さく `trylinerugby.com`
- Tryline カード配色: 背景 `#0b1220` / アクセント黄 `#facc15` / シアン `#22d3ee` / 紫 `#a78bfa` / ピンク `#fb7185`
