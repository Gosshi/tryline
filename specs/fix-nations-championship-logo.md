# Nations Championship のロゴがプレースホルダーのまま

## 背景

Taste Skillによる本番サイト監査で判明。ホームページの大会リスト（`app/page.tsx`）は `COMPETITION_LOGO_FAMILIES` セット（`app/page.tsx:44-55`）に含まれる大会のみ専用ロゴ（`/logos/<family>.svg`）を表示し、含まれない場合は `/logos/default-competition.svg`（汎用プレースホルダー）にフォールバックする（`getCompetitionLogoSrc`, `app/page.tsx:57-61`）。

2026年新設の "Nations Championship"（`family = "nations-championship"`、`supabase/migrations/20260618010001_seed_nations_championship_2026.sql`）はこのセットに未登録のため、現在最も試合数の多い大会の1つがプレースホルダーアイコンのまま表示されている。

関連仕様: `fix-home-competition-logos.md`（大会ロゴ表示の初期実装）。

**訂正（2026-07-06）**: 当初「ロゴ素材の調達はOwner側タスク」としていたが、既存の `public/logos/*.svg` 10点を実際に確認したところ、いずれも公式トレードマークの複製ではなく、角丸64×64・ブランドカラー・簡易アイコンまたは略称テキストで構成された**自作の簡易バッジ**だった（例: `six-nations.svg` = 紺地に "6N"、`urc.svg` = 緑地に "URC" とシールド風シルエット、`top-14.svg` = 黒地に "14"）。著作権上の懸念は無く、Codexがこの仕様書内で完結して新規作成できる。

## スコープ

対象:
- `app/page.tsx:44-55` の `COMPETITION_LOGO_FAMILIES` に `"nations-championship"` を追加
- `public/logos/nations-championship.svg`（既存10点と同じ形式で新規作成。`viewBox="0 0 64 64"`、角丸背景に `lib/format/competition.ts` の `COMPETITION_FAMILY_COLORS["nations-championship"]`（`#1A3A5C`）を使い、白文字で "NC" 等の短い略称を配置する。デザインの細部は既存ファイルのトーンに揃えれば裁量でよい）

対象外:
- 公式エンブレムの再現・トレードマーク付き素材の使用（既存の慣習どおり、自作の簡易バッジに留める）
- 大会ページ（`/c/[competition]`）ヘッダーの配色（`p3-competition-color-accent.md` の対象）

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

`app/page.tsx` の `COMPETITION_LOGO_FAMILIES` に1行追加するのみ。他の大会（`six-nations`, `urc` 等）と同じ扱いになる。

```diff
 const COMPETITION_LOGO_FAMILIES = new Set([
   "autumn-nations",
   "league-one",
+  "nations-championship",
   "pnc",
   "premiership",
   ...
```

## LLM 連携

なし

## 受け入れ条件

1. `public/logos/nations-championship.svg` が配置されている
2. `COMPETITION_LOGO_FAMILIES` に `"nations-championship"` が含まれる
3. ホームページの大会リストで Nations Championship のロゴが `default-competition.svg` ではなく専用ロゴで表示される
4. 他大会のロゴ表示に regression がない
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 未解決の質問

なし。既存パターンの横展開のみで判断に迷う点はない。
