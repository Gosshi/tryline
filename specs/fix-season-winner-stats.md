# シーズン一覧: 優勝チーム・総試合数をカードに表示

## 背景

`app/c/[competition]/page.tsx` のシーズン一覧カードには
現在シーズン名（「2024-25」など）のみ表示され、
優勝チームや総試合数などの見どころ情報がない。

ユーザーが過去シーズンに興味を持てないため、アーカイブページへの
回遊が発生せず、SEO 的にもコンテンツが薄い状態が続いている。

## スコープ

対象:
- `lib/db/queries/matches.ts` — シーズン一覧に `matchCount` と `champion` を追加
- `app/c/[competition]/page.tsx` — シーズンカードに統計を表示

対象外:
- champion データの自動収集・スクレイピング（手動シードのみ）
- 順位表ページへの変更

## データモデル変更

### `competitions` テーブルへのカラム追加（マイグレーション必要）

```sql
ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS champion TEXT;        -- 優勝チーム名（例: 「アイルランド」）
```

既存データには NULL を許容し、初期値なし。
シードは `supabase/seed/` 以下の SQL ファイルで手動追加。

### マイグレーションファイル

`supabase/migrations/<timestamp>_add_champion_to_competitions.sql`

## API サーフェス

### `getCompetitionSeasons` 拡張（`lib/db/queries/matches.ts`）

```typescript
// 変更後の返却型に追加
type SeasonInfo = {
  season: string;
  matchCount: number;   // 追加
  champion: string | null;  // 追加
};
```

クエリ変更:
- `matches` テーブルと JOIN して `COUNT(*)` を `matchCount` として返す
- `competitions.champion` を JOIN して返す

## UI サーフェス

### シーズンカード（`app/c/[competition]/page.tsx`）

```tsx
// 変更前
<div>{season.season}</div>

// 変更後
<div>
  <span>{season.season}</span>
  <span className="text-sm text-muted">{season.matchCount} 試合</span>
  {season.champion && (
    <span className="text-sm font-semibold">🏆 {season.champion}</span>
  )}
</div>
```

`champion` が NULL のシーズンは優勝欄を非表示にする。

## LLM 連携

なし

## 受け入れ条件

1. シーズン一覧カードに「X 試合」の試合数が表示される
2. `champion` が登録済みのシーズンに「🏆 チーム名」が表示される
3. `champion` が NULL のシーズンで優勝欄が表示されない
4. マイグレーション適用後に `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- `champion` 初期シードデータ（各大会の主要シーズン優勝チーム）は Owner が用意すること
- 「優勝チーム」の表示有無をシーズン開催中・終了後で切り替えるかは Owner が判断すること