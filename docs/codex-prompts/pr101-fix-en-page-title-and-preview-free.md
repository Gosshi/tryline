# PR #101 — ENページのタイトル二重表示修正 & プレビュー無料化

## 背景

英語版試合ページ（`/matches/:id/en`）に 2 つのバグがある。

1. **B1: タイトルに "Tryline" が二重に出る**  
   `title` 定数に `| Tryline` を手動で含めているが、Next.js の layout テンプレートがさらに `| Tryline` を付加するため、`"Chiefs vs Highlanders — Super Rugby Pacific 2025 | Tryline | Tryline"` のように二重になる。

2. **W5: ENプレビューがペイウォールされている**  
   日本語ページ（PR #100）ではプレビューを `isPremium={true}` で常時全文表示にしたが、英語ページは `isPremium={premium}` のまま未修正。方針「プレビュー無料・レビューはPremium」に反する。

## スコープ

対象:
- `app/matches/[id]/en/page.tsx`

対象外:
- 他ファイルの変更なし
- レビュー（recap）のペイウォール挙動は変更しない

---

## 変更仕様

### B1: タイトルから `| Tryline` を削除（line 49）

```ts
// Before
const title = `${match.homeTeam.name} vs ${match.awayTeam.name} — ${competition} | Tryline`;

// After
const title = `${match.homeTeam.name} vs ${match.awayTeam.name} — ${competition}`;
```

### W5: プレビューを常時全文表示（lines 159–168）

```tsx
// Before
{englishContent.preview && (
  <MatchContentSection
    content={englishContent.preview}
    contentType="preview"
    isPremium={premium}
    language="en"
    match={match}
    showCta={englishContent.recap === null}
  />
)}

// After
{englishContent.preview && (
  <MatchContentSection
    content={englishContent.preview}
    contentType="preview"
    isPremium={true}
    language="en"
    match={match}
    showCta={false}
  />
)}
```

- `isPremium={true}` にすることで `isLocked` が常に `false` になり全文表示
- `showCta={false}` にすることで不要な「Premium で読む」CTAを非表示

---

## 完了の定義

- [ ] ENページのタイトルが `"… | Tryline"` 一つだけになる（二重にならない）
- [ ] ENページのプレビューが非会員でも全文表示される
- [ ] ENページのレビューのペイウォール挙動は変わらない
- [ ] TypeScript エラーなし・`pnpm build` 通過
