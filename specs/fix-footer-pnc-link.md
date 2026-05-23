# フッター: PNC（Pacific Nations Cup）リンクの追加

## 背景

`components/site-footer.tsx` の `competitionLinks` に Pacific Nations Cup（PNC）が
含まれていない。

PNC は日本代表が必ず出場する大会であり、日本人ラグビーファン（ターゲットユーザー）に
とって重要な大会への導線が完全に欠如している。

## スコープ

対象:
- `components/site-footer.tsx` — `competitionLinks` への PNC エントリ追加

対象外:
- フッターのレイアウト・デザイン変更
- ナビゲーションヘッダーへの追加（別仕様書で対応）

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### 変更箇所

```typescript
// 変更前（PNC がない）
const competitionLinks = [
  { href: "/c/six-nations", label: "Six Nations" },
  // ... 9 件
];

// 変更後
const competitionLinks = [
  { href: "/c/six-nations", label: "Six Nations" },
  // ... 既存 9 件 ...
  { href: "/c/pnc", label: "Pacific Nations Cup" },  // ← 追加
];
```

## LLM 連携

なし

## 受け入れ条件

1. フッターの「大会」リストに「Pacific Nations Cup」が表示される
2. リンクをクリックすると `/c/pnc` に遷移し、大会ページが表示される
3. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- DB の `competitions.family` カラムで `pnc` というスラッグが実際に使われているかを
  確認してから実装すること（`fix-competition-hero-images.md` でも同様の確認が必要）
