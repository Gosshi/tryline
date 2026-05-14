# チームバッジ シールド化：円形バッジをシールド形状に変更

## 背景

`components/team-badge.tsx` はクラブチームのバッジを「色付き円 + 略称テキスト」で表現している。
円形は汎用的すぎてスポーツアプリとしての「本気度」が伝わらない。
サッカー・ラグビーのクラブバッジは伝統的にシールド（盾）形状であり、
この形に変えるだけで視覚的な説得力が大きく向上する。

## スコープ

- 対象: `components/team-badge.tsx` — フォールバックの SVG バッジ（円形グラデーション部分）
- 対象外:
  - `getTeamFlagSvg(slug)` が返す国旗 SVG（既に適切な形状）
  - `getTeamFlag(slug)` が返す絵文字フラグ（変更なし）

## 変更内容

### フォールバック SVG の形状変更

`<circle cx="16" cy="16" r="15" />` をシールド形状のパスに置き換える。

viewBox は `0 0 32 32` を維持。シールドパス（例）:
```
M16 2 L29 7 L29 19 Q29 27 16 31 Q3 27 3 19 L3 7 Z
```

上部が水平・下部が V 字にすぼまる伝統的なシールド形状。
Codex は視覚的に自然なパスに自由に調整してよい。

完成後の SVG 構造:

```tsx
<svg viewBox="0 0 32 32" width={size} height={size} ...>
  <defs>
    <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
      {/* 既存のグラデーションストップを流用 */}
    </linearGradient>
  </defs>
  <path
    d="M16 2 L29 7 L29 19 Q29 27 16 31 Q3 27 3 19 L3 7 Z"
    fill={`url(#${gradientId})`}
  />
  <text
    x="16"
    y="17"
    textAnchor="middle"
    dominantBaseline="central"
    fill={isLightColor(primaryColor) ? "#111111" : "#FFFFFF"}
    fontSize={shortCode.length <= 2 ? "11" : "9"}
    fontWeight="bold"
    fontFamily="system-ui, sans-serif"
    letterSpacing="0"
  >
    {shortCode}
  </text>
</svg>
```

テキストの `y` 座標はシールドの視覚的中心に合わせて微調整してよい（`16` → `17` 程度）。

## 変更ファイル

- `components/team-badge.tsx`

## 受け入れ条件

- 国旗 SVG・絵文字フォールバックは変更なし
- クラブチームのバッジがシールド形状で表示される
- チームカラーのグラデーションは維持される
- 略称テキストがシールド内に収まって読める
- `size` prop（20px・32px など）でスケールが正しく機能する
- `isLightColor` によるテキスト色の自動切り替えは維持される
