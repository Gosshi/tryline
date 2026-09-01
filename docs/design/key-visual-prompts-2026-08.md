# 大会キービジュアル 生成プロンプト（未生成の3大会）

作成日: 2026-08-25

## 背景

案B2（`docs/design/mock-hub-b2-depth.html`）で、シーズンページのヒーローを**写真ベースの帯**にする方針が決まった。`public/visuals/` には12ファミリー中9つの画像が既にあるが、以下3つが未生成。

| family | 大会 | 期間 | 優先度 |
|---|---|---|---|
| `nations-championship` | ネーションズチャンピオンシップ 2026 | 2026-07-04 〜 11-21 | **最優先**（Bing 流入が最多の大会） |
| `greatest-rivalry` | グレイテスト・ライバルリー・ツアー オールブラックス 南アフリカ遠征 | 2026-08-07 〜 09-12 | 中 |
| `lipovitan-challenge-cup` | リポビタンDチャレンジカップ 2026 | 2026-08-08 〜 10-24 | 中 |

未生成の間は `DEFAULT_COMPETITION_HERO`（`/visuals/default.jpg`）にフォールバックする（`lib/competition-hero-images.ts:13-17`）。**画像が無くても実装は進められる。**

## 作風の基準

既存9枚は `docs/design-ui-growth-review-2026-07-03.md` D章（D-1〜D-9、試し焼き検品済み）で作られており、以下が共通の作法。今回もこれを踏襲する。

- `wide banner composition`（横長のバナー構図）
- 観客は `a packed stadium crowd ... as dense anonymous bokeh silhouettes`（無人にしない・練習風景にしない）
- パレットを明示（大会ごとに色の性格を変える）
- 光や水しぶきには炎化対策句（`realistic ... only (no fire or lava-like glow effects)`）
- 顔は構図で隠す（逆光シルエット / スクラムで伏せる / モーションブラー）
- キットは2色まで、レフェリー混入を明示的に排除
- 末尾制約を必ず付与

## 帯に載せる前提（今回の追加要件）

B2 のヒーローは**画像の上に左からスクリム（暗幕）をかけ、左側に大会名とメタ情報を重ねる**。したがって:

- **左側が静かで、視覚的な主役が右寄り**の構図が望ましい
- ただしスクリムが濃いので、既存9枚のような中央対称構図でも破綻しない。**強い制約ではない**
- 既存の D-8（OG 背景）が `strong left-side negative space reserved for overlaid interface elements` という同種の指定を持っており、前例がある

各プロンプトに軽い形で入れてある。生成結果が不自然なら、この句を外して再生成してよい。

## 共通の末尾制約

```
no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

---

## KV-1. nations-championship（最優先）

**大会の性格**: 2026年に始まった世界規模の新チャンピオンシップ。北半球6か国と南半球6か国が対戦する。7月と11月の2つのウィンドウ。**「世界大会」の格**を出したい。ファミリーカラーは深いネイビー `#1A3A5C` なので、寒色系で揃えると UI と馴染む。

```
Global test rugby championship occasion: a monumental modern stadium bowl at night, every tier packed with a dense anonymous international crowd rendered as glowing bokeh silhouettes, two opposing lines of anonymous players standing facing each other across the halfway line in the moment before kickoff, seen from a high wide angle in the upper tier, deep navy and steel blue palette with cold white floodlight flare and a single warm red rim accent, cold clear night air, sense of a worldwide championship occasion and anthem-moment gravitas, plain solid dark kits with no chest graphics or sponsor patches, faces obscured by distance and shadow, straight white pitch lines only, no hash marks, no yard crosses, no plus signs, no center circle, clean floodlight glow only (no fire or lava-like effects), no advertising boards or hoardings, visual interest concentrated toward the right of the frame with the left side calmer, wide banner composition. no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

**この構図を選んだ理由**: 「両チームが向き合って整列する」瞬間は、対戦カード表・順位表という大会ハブの中身と意味的に合う。またハーフウェイラインを挟む構図は、北半球 vs 南半球という大会の骨格を暗示できる。

---

## KV-2. greatest-rivalry

**大会の性格**: ニュージーランド代表による南アフリカ遠征。ラグビー史上最も古く重い対戦カード。開催は南アフリカの高地スタジアム、8〜9月（南半球の冬から春）。**歴史の重さと乾いた土地**を出したい。

実在チームのブランドは使えないため、**黒 × 濃緑の2色**で暗示する（スキルの「キットは2色」ルールに従う）。

```
Historic southern-hemisphere test rivalry: a vast high-altitude South African stadium at dusk, the stands packed with a dense anonymous crowd as warm bokeh silhouettes, a scrum engaging at the centre of the frame with all players' faces turned down into the scrum or away from camera, exactly two teams only — one team in plain solid black kits and the opposing team in plain solid dark green kits, no third color, no referee in a differently colored kit visible, dry winter grass worn thin in patches, long low shadows raking across the pitch, deep gold and charcoal palette against a darkening violet sky, fine dust haze hanging in the air, weight and history in the atmosphere, natural dusk light only (no fire or lava-like glow effects), straight white pitch lines only, no advertising boards or hoardings, visual interest concentrated toward the right of the frame with the left side calmer, wide banner composition. no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

**注意**: 「黒いキット」は特定チームを強く連想させる。生成結果が実在ユニフォームに酷似した場合（襟の形・シルエットまで一致等）は不採用にして、色を `dark charcoal` に変えて再生成する。

---

## KV-3. lipovitan-challenge-cup

**大会の性格**: 日本代表のホームテストマッチ。8月〜10月、日本国内のスタジアム。蒸し暑い夏の夜から秋にかけて。**日本のスタジアムであること**が伝わるとよいが、実在の球場を再現する必要はない。

日本代表は赤白、対戦相手（豪州）は金。2色で組む。

```
Japanese home test match on a humid late-summer evening: a modern Japanese stadium with the stands packed by a dense anonymous crowd as bokeh silhouettes under white floodlights, an anonymous player driving forward through contact in the foreground with strong motion blur that blurs faces and bodies into streaks, exactly two teams only — one team in plain solid red kits and the opposing team in plain solid gold kits, no third color, no referee in a differently colored kit visible, humid evening haze softening the floodlight beams, deep indigo sky above with warm floodlight bloom below, red and warm white accent palette, energetic and close-up, realistic light glow and sweat only (no fire or lava-like glow effects), straight white pitch lines only, no hash marks, no yard crosses, no plus signs, no center circle, no advertising boards or hoardings, visual interest concentrated toward the right of the frame with the left side calmer, wide banner composition. no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

**この構図を選んだ理由**: 他8枚が引きの構図（スタジアム全景・整列・スクラム）に寄っているので、1枚は寄りの動きのある絵にして単調さを避ける。モーションブラーは顔を隠す手段としても機能する。

---

## 検品チェックリスト

Owner が画像を貼ってきたら以下を確認する。

- [ ] 観客がいる・密度が十分（無人だと練習風景に見える）
- [ ] 判別可能な顔が写っていないか
- [ ] キットが2色に収まっている・レフェリー混入なし
- [ ] 文字・ロゴ・スポンサー看板の写り込みなし
- [ ] 炎・溶岩状の発色アーティファクトなし
- [ ] ピッチのラインがラグビーとして破綻していない（アメフト風のハッシュマークが無いか）
- [ ] H ポールが写っている場合、2本の棒でなくクロスバーがあるか
- [ ] **左側にテキストを重ねても成立するか**（B2 のヒーロー要件）
- [ ] 既存9枚と並べたときに1枚だけ浮いていないか

## 採用後の配置

```bash
sips -s format jpeg -s formatOptions 90 <入力.png> --out public/visuals/<family>.jpg
```

ファイル名は family スラッグと完全一致させる。

- `public/visuals/nations-championship.jpg`
- `public/visuals/greatest-rivalry.jpg`
- `public/visuals/lipovitan-challenge-cup.jpg`

配置後、`lib/competition-hero-images.ts` の `COMPETITION_HERO_IMAGES` に3行追加する（Codex 作業。B2 実装 spec に含める）。**追加しない限りコードからは参照されず、フォールバック画像のままになる。**
