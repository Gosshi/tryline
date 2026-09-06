---
name: image-gen
description: キービジュアル・サムネイル・OG 背景などの生成画像プロンプトを作る・案出しするときに使う。「画像のプロンプトを」「サムネ案を」「ビジュアルを作りたい」と言われたら起動。権利制約と失敗パターン別の対策句リスト。
---

# 画像生成プロンプト作成（サムネ・キービジュアル）

Tryline で使う生成画像の英語プロンプトを作る。**生成 API はこちらから呼ばない**（LLM コスト保護ルール）。Owner が外部ツール（Gemini / ChatGPT 等）で生成し、結果画像をこの会話に貼って検品→採用の流れ。

## 権威ドキュメント

- 確定済みプロンプト集: `docs/design-ui-growth-review-2026-07-03.md` D 章（D-1〜D-9、全て試し焼き検品済み）
- 配置済みアセット: `public/visuals/`（命名は `{family}.jpg`、family スラッグは `app/c/[competition]/page.tsx` の `COMPETITION_HERO_IMAGES` キーと一致させる）

## 必須の末尾制約（全プロンプトに必ず付与）

```
no text, no letters, no numbers, no logos, no real team branding, no official jerseys, no identifiable faces, no watermark
```

CLAUDE.md の権利方針（実在ロゴ・公式ユニフォーム・実在選手の顔・公式トロフィー酷似の禁止）に対応する。

## 失敗パターン別の対策句（2026-07-03 の試し焼きで実証済み）

| 失敗 | 対策句 |
|------|--------|
| 観客がいない・練習風景に見える | `a packed stadium crowd filling the stands as dense anonymous bokeh silhouettes under the lights` |
| 顔がはっきり写る（日中・順光） | スクラム構図＋`all players' faces turned down into the scrum or away from camera`、または `strong motion blur that blurs faces and bodies into streaks` |
| 顔がはっきり写る（夜） | 逆光シルエット構図なら自然に隠れる: `silhouetted against blinding stadium floodlights, faces obscured by shadow` |
| 光・水しぶきが炎・溶岩化する | `realistic water spray only (no fire or lava-like glow effects)` / `a clean lens-flare-style light trail, not fire or embers` |
| キットが3色以上になる | `exactly two teams only — one team in plain solid X kits and the opposing team in plain solid Y kits, no third color, no referee in a differently colored kit visible` |
| ピッチがアメフト/バスケ風になる | `arcs` という単語を使わない。`straight lines only` ＋ `no hash marks, no yard crosses, no plus signs, no center circle` を明示 |
| H ポールが2本の棒になる | `two vertical uprights connected by one clearly visible horizontal crossbar (forming a capital H shape), not two separate poles, no net` |
| スポンサー看板が写る | `no advertising boards or hoardings` / キットは `no chest graphics or sponsor patches` |

## 検品チェックリスト（Owner が画像を貼ってきたら）

- [ ] 観客の有無・密度は意図通りか
- [ ] 判別可能な顔が写っていないか（AI 生成でも「実在人物と誤認」リスクを避ける）
- [ ] キットは2色か・レフェリー混入なし
- [ ] 文字・ロゴ・看板の写り込みなし
- [ ] 炎・溶岩状の発色アーティファクトなし
- [ ] ラグビーの意匠として破綻がないか（ライン・ポール・ボール形状）

## 保存

採用が決まったら sips で JPEG 変換し配置（品質90）:

```bash
sips -s format jpeg -s formatOptions 90 <入力.png> --out <保存先>/<名前>.jpg
```

- **サイト（コード参照）用**（大会ヒーロー等）: `public/visuals/{family}.jpg`。family スラッグは `COMPETITION_HERO_IMAGES` のキーと一致させる。配置したら使い道の spec 化とセットで（コードから参照されない画像を置きっぱなしにしない）
- **note 記事の見出し画像用**（`note-weekly` スキル経由）: `docs/notes/assets/<下書きファイル名と同じ日付>-thumbnail.jpg`。コードから参照されないため `public/visuals/` には置かない
