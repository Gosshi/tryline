# スコアグラフ: 軸ラベルの fontSize を拡大してモバイルで読みやすくする

## 背景

`components/score-graph.tsx` の X 軸・Y 軸ラベルに `fontSize={9}` が設定されており
（77行目・140行目付近）、モバイル（375px 幅）では **肉眼で読めないほど小さい**。

ラグビーのスコア推移グラフはプレビュー・レビューページの主要データ可視化であり、
モバイルファーストの PWA では特に可読性が重要。

## スコープ

対象:
- `components/score-graph.tsx` — X 軸・Y 軸の `fontSize` を拡大

対象外:
- グラフのレイアウト・サイズ・色の変更
- 軸ラベルの内容変更（試合時間・スコア値）
- `recharts` ライブラリの変更

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### `components/score-graph.tsx`

```tsx
// 変更前（約 77 行目・140 行目）
<XAxis tick={{ fontSize: 9 }} ... />
<YAxis tick={{ fontSize: 9 }} ... />

// 変更後
<XAxis tick={{ fontSize: 11 }} ... />
<YAxis tick={{ fontSize: 11 }} ... />
```

`fontSize={11}` は最小推奨サイズ。モバイルで視認できるか Playwright で確認し、
必要であれば `fontSize={12}` まで上げること。

モバイル幅（375px）でラベルが重なる場合は `interval="preserveStartEnd"` または
`angle={-45}` で斜め表示を追加すること。

## LLM 連携

なし

## 受け入れ条件

1. `score-graph.tsx` の `fontSize` が 11 以上になっている
2. Playwright で 375px 幅のスクリーンショットを撮り、軸ラベルが読めることを確認
3. PC 幅（1440px）でラベルが重ならないことを確認
4. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- `fontSize` の最終値（11 か 12 か）は Playwright のスクリーンショットを見てから
  Codex が判断すること