# ホーム大会アーカイブの「最新シーズン」選定を試合データ優先に変更

## 背景

`feat-home-matchday-board.md`（PR #500）で、ホームに PNC 2026 を推す Featured Competition Card を追加した。しかし同じホームページの「大会アーカイブ」チップ（`app/page.tsx` の `homepageCompetitionLinks`）は、同じ「Pacific Nations Cup」で **2025** を指したままであることが、Codex の本番確認と実測（2026-07-08）で判明した。

原因は `lib/db/queries/competitions.ts:59` の `selectLatestSeasonWithMatches` が `publishedContentCount > 0`（公開済みレビュー・プレビューがある）を最優先条件にしているため。PNC 2026 は開幕が9月でまだ試合が行われておらず、レビューが1件も無いため、レビューがある PNC 2025 が選ばれてしまう。

この優先順位は `p6-dynamic-latest-season.md` で意図的に導入されたもの（空のページに誘導しないため）だが、以下の理由で見直す:

- Featured Competition Card が PNC 2026 を明示的に推している同じページ内で、大会アーカイブだけ2025を指すのは矛盾したシグナルになる
- GSC実測の検索需要は「PNC 2026」であり「PNC 2025」ではない（2026-07-07〜08 の集客レビュー参照）
- Tryline の設計不変条件「コンテンツは match_id に紐付く」より、`publishedContentCount > 0` の季節は必ず `matchCount > 0` でもある（レビューがあるということは対応する試合が存在する）。つまり `matchCount > 0` を優先条件にしても、現状より「悪い」シーズン（試合データが無いページ）に誘導することは起こり得ない

## スコープ

対象:
- `lib/db/queries/competitions.ts` の `selectLatestSeasonWithMatches` の優先順位を「試合データがあるか」に一本化する

対象外:
- `homepageCompetitionLinks` の表示レイアウト・チップデザイン（`feat-bento-card-redesign.md` の対象。本 spec は選定ロジックのみ）
- シーズンページ自体（`app/c/[competition]/[season]/page.tsx`）の存在しないシーズンへのリダイレクト処理（`listSeasonsByFamily(competition)[0]` を使う別ロジックで、`selectLatestSeasonWithMatches` とは無関係。触らない）
- `publishedContentCount` フィールド自体の削除（他の用途で参照されている可能性があるため残す。関数内での優先条件としてのみ使わなくする）

## データモデル変更

なし。

## API サーフェス

### `lib/db/queries/competitions.ts` の `selectLatestSeasonWithMatches`

現状:

```ts
export function selectLatestSeasonWithMatches(
  seasons: CompetitionRow[],
): CompetitionRow | null {
  const withContent = seasons.filter(
    (season) => season.publishedContentCount > 0,
  );

  if (withContent.length > 0) {
    return withContent[0] ?? null;
  }

  const withMatches = seasons.filter((season) => season.matchCount > 0);

  return withMatches[0] ?? seasons[0] ?? null;
}
```

変更後:

```ts
export function selectLatestSeasonWithMatches(
  seasons: CompetitionRow[],
): CompetitionRow | null {
  const withMatches = seasons.filter((season) => season.matchCount > 0);

  return withMatches[0] ?? seasons[0] ?? null;
}
```

`seasons` は呼び出し元（`listSeasonsByFamily`、`lib/db/queries/competitions.ts:102-111` で `order("season", { ascending: false })` 済み）で season 降順（最新が先頭）に取得されているため、`withMatches[0]` は「試合データがある最新シーズン」になる。試合データが1シーズンも無い大会（`withMatches.length === 0`）では、従来通り `seasons[0]`（単純に最新シーズン）にフォールバックする。

## UI サーフェス

なし（呼び出し元の `app/page.tsx` は関数のインターフェースを変更しないため無修正）。

## LLM 連携

なし。

## 受け入れ条件

1. `matchCount > 0` のシーズンが複数ある大会で、`publishedContentCount` の有無に関わらず、最も新しい season（`seasons` 配列の並び順で先頭）が返る
2. `matchCount === 0` のシーズンのみの大会では、従来通り最新シーズン（`seasons[0]`）にフォールバックする
3. `tests/competition-latest-season.test.ts` の「prefers the latest season that has published content」テストケース（`buildSeason("2026", 12, 0)`, `buildSeason("2025", 21, 3)`, `buildSeason("2024", 20, 8)` → 期待値 `"2025"`）を、新しい優先順位に合わせて期待値 `"2026"` に更新する（このテストケースの意図を「試合データがあれば公開コンテンツの有無を問わず最新シーズンを選ぶ」に書き換える）
4. 残り2つの既存テストケース（「prefers the latest season that has matches」「falls back to the latest season when no seasons have matches」）は変更なしでパスする
5. 本番相当のデータで `/`（ホーム）を表示したとき、大会アーカイブの Pacific Nations Cup チップが `/c/pnc/2026` を指す（`aria-label` に `2026` を含む）
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 未解決の質問

- なし
