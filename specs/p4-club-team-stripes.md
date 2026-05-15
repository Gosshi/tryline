# クラブチーム縦ストライプバッジ

## 背景

`components/team-badge.tsx` のフォールバックSVGは現在、上→下のグラデーションで塗られている。
`TEAM_STRIPES` に複数カラーが登録されていても水平帯になるため、チーム識別に役立ちにくい。
Premiership/URC の主要クラブは2色以上の縦縞ユニフォームを持つため、
グラデーション方向を「左→右（縦ストライプ表示）」に変更し、
合わせて未登録・単色クラブへ実際のチームカラーを2〜3色追加する。

## スコープ

対象:
- `lib/format/team-identity.ts` — `TEAM_STRIPES` への色追加
- `components/team-badge.tsx` — `linearGradient` の方向変更

対象外:
- 国旗SVGを持つ代表チーム（変更なし）
- 絵文字フラグを使うチーム（変更なし）

## 変更内容

### 1. `lib/format/team-identity.ts` — TEAM_STRIPES 更新

以下のクラブエントリを追加・更新する（既存の単色エントリを2〜3色に拡張）:

```ts
// Premiership
bath:                ["#002F6C", "#F7C600"],          // navy / gold
"bristol-bears":     ["#0B1F3A", "#A7192D"],          // dark navy / burgundy
"exeter-chiefs":     ["#111111", "#D50032"],          // black / red
gloucester:          ["#C8102E", "#FFFFFF"],          // cherry / white
harlequins:          ["#1E7F3B", "#003087", "#FFD100", "#E91E8F"], // 4-quad
"leicester-tigers":  ["#006B3F", "#FFD100"],          // green / yellow
"newcastle-falcons": ["#111111", "#F0B429"],          // black / gold
"northampton-saints":["#006747", "#000000"],          // green / black
"sale-sharks":       ["#003DA5", "#FFFFFF"],          // blue / white
saracens:            ["#000000", "#EF3340"],          // black / red

// URC
benetton:            ["#00843D", "#FFFFFF"],          // green / white
cardiff:             ["#72B7E8", "#000000"],          // blue / black
connacht:            ["#00843D", "#FFFFFF"],          // green / white
dragons:             ["#C8102E", "#000000"],          // red / black
edinburgh:           ["#003A70", "#FFFFFF"],          // navy / white
"glasgow-warriors":  ["#111111", "#FFFFFF"],          // black / white
leinster:            ["#0032A0", "#009A44"],          // blue / green
munster:             ["#C8102E", "#FFFFFF"],          // red / white
ospreys:             ["#111111", "#FFD100"],          // black / gold
scarlets:            ["#C8102E", "#000000"],          // red / black
ulster:              ["#D71920", "#FFFFFF"],          // red / white
zebre:               ["#111111", "#C8102E"],          // black / red
```

### 2. `components/team-badge.tsx` — グラデーション方向変更

`linearGradient` の属性を変更して左→右方向（縦ストライプ表示）にする:

```tsx
// 変更前
<linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">

// 変更後
<linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
```

これにより複数カラーが縦帯として表示される。
単色チームは変わらず単色塗りのまま。

## 変更ファイル

- `lib/format/team-identity.ts`
- `components/team-badge.tsx`

## 受け入れ条件

- [ ] Harlequins のバッジが緑/紺/黄/ピンクの4分割縦ストライプで表示される
- [ ] Bath が navy/gold の2色縦ストライプで表示される
- [ ] Six Nations など既存の代表チームバッジ・国旗に変化なし
- [ ] 単色チームは引き続き単色シールドで表示される
- [ ] `size` prop（20/32/48px）でスケールが正しく機能する
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
