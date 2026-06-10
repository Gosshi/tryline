# fix-hero-cta-calendar

## 背景

PMF 監査（2026-06-10）で Hero セクションの第 2 CTA「今週の試合を見る」のリンク先が問題と指摘された。
現状は `reviewedFamilies[0]` の competition ページ（例: `/c/premiership/2025-26`）に遷移するため：
- 表示される大会が `sortHomepageCompetitionLinks` の順序に依存し、意図が不明
- 「今週の試合を見る」というコピーと不一致（大会ページは特定大会のアーカイブ）
- カレンダーページ（`/calendar`）が実装済みにも関わらず誘導されていない

## スコープ

対象:
- `app/page.tsx` Hero 内 `<Link>` （L214-223付近）の `href` を `/calendar` に変更

対象外:
- CTA のコピー変更（「今週の試合を見る」は適切）
- カレンダーページ自体の変更

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

### 変更前

```tsx
<Link
  href={
    reviewedFamilies[0]
      ? `/c/${reviewedFamilies[0].family}/${reviewedFamilies[0].competitionSeason}`
      : "/"
  }
>
  今週の試合を見る
</Link>
```

### 変更後

```tsx
<Link href="/calendar">
  今週の試合を見る
</Link>
```

`reviewedFamilies` を Hero CTA のためだけに参照している場合、他の箇所で使われているか確認し、不要なら変数・型・import を削除する。

## LLM 連携

なし。

## 受け入れ条件

1. Hero の「今週の試合を見る」をクリックすると `/calendar` に遷移する
2. ビルド・TypeScript エラーなし

## 未解決の質問

なし。
