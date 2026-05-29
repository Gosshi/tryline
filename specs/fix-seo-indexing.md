# SEO インデックス改善（canonical・meta description・JSON-LD・内部リンク）

## 背景

2026-05-29 の評価で確認した「クロール済み・インデックス未登録」の構造的原因を解消する。
Google Search Console: クリック2・表示11・インデックス9ページという状態。

確定した構造的欠陥（実測）:

1. **canonical が全ページ null** — Next.js の `alternates.canonical` が未設定。重複コンテンツシグナルを強める。
2. **試合ページの meta description がスコアゼロ** — `"Newcastle vs Gloucester の試合結果・AI日本語レビュー。"` という同一語尾が数百ページ並ぶ。固有情報がなく重複度が高い。recap があっても preview テキストを使うため「試合前」の文体になる。
3. **home・season ページに JSON-LD なし** — 試合ページに SportsEvent はあるが、home の `WebSite`（SearchAction）・`Organization`、season の `BreadcrumbList` が欠落。
4. **試合ページに Article JSON-LD なし** — recap を持つページが `NewsArticle` を出力していない。Google ニュース/Discover の入口を逃している。
5. **シーズンページの全試合 `<a>` が初期 HTML に含まれない** — `SeasonMatchGroups`（`"use client"`）が `{isOpen && <matches>}` で条件レンダリングしており、折りたたみ中のラウンドの試合リンクが初期 HTML に存在しない。内部リンクの PageRank が末端試合ページに流れない。Premiership 2024-25 の例では 18節×5試合≒90件のうち展開済み2節分しか Google がたどれない。

## スコープ

対象:
- `app/matches/[id]/page.tsx` — canonical・description 改善・`NewsArticle` JSON-LD 追加
- `app/c/[competition]/[season]/page.tsx` — canonical・`BreadcrumbList` JSON-LD 追加
- `app/page.tsx` — canonical・`WebSite` + `Organization` JSON-LD 追加
- `components/season-match-groups.tsx` — 全試合リンクを初期 HTML に出力
- `lib/match-content/description.ts` — `extractCoreSection` 関数追加

対象外:
- sitemap（実装済み）
- robots.txt
- 画像・パフォーマンス系 SEO
- `/c/[competition]`（大会トップ）・player・team ページ（優先度低）

## データモデル変更

なし

## API サーフェス

なし（内部関数の追加のみ）

## UI サーフェス

`SeasonMatchGroups` の見た目は変えない。折りたたみ状態の UI は現行どおり。
初期 HTML に全試合が含まれるだけ（CSS で非表示→表示を切り替える）。

## 変更詳細

---

### 変更1: canonical（全対象ページ）

`app/matches/[id]/page.tsx`、`app/c/[competition]/[season]/page.tsx`、`app/page.tsx` の `generateMetadata` / `metadata` に `alternates.canonical` を追加する。

```typescript
// 試合ページ
return {
  alternates: { canonical: `${SITE_URL}/matches/${id}` },
  description,
  openGraph: { ... },
  title,
};

// シーズンページ
return {
  alternates: { canonical: `${SITE_URL}/c/${competition}/${season}` },
  ...
};

// ホームページ
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
  ...
};
```

---

### 変更2: 試合ページ meta description 改善

`app/matches/[id]/page.tsx` の `generateMetadata` 内 `description` 生成ロジックを以下の優先順位に変更する。

**現状:**
```typescript
const description = content.preview
  ? extractDescription(content.preview.contentMdJa)
  : `${match.homeTeam.name} vs ${match.awayTeam.name} の試合結果・AI日本語レビュー。`;
```

**変更後（優先順位）:**

1. **終了試合 + recap あり** → recap の `# この試合の核心` セクション冒頭を使う。スコア含む結果要約になる。
   `extractCoreSection(content.recap.contentMdJa)` を呼ぶ（下記 `lib/match-content/description.ts` に追加）。
2. **終了試合 + recap なし + スコアあり** → スコアを含む固定文を生成する。
   ```typescript
   `${match.homeTeam.name} ${match.homeScore}–${match.awayScore} ${match.awayTeam.name}（${competitionTitle}）の試合結果・AI日本語レビュー。`
   ```
3. **予定試合 + preview あり** → `extractDescription(content.preview.contentMdJa)`（現行と同じ）
4. **それ以外** → 現行の固定文

`lib/match-content/description.ts` に `extractCoreSection` 関数を追加する:

```typescript
// "# この試合の核心" 見出し直後から次の "#" 見出しまでのテキストを抽出して description に使う。
// 見つからなければ extractDescription(markdown) にフォールバック。
export function extractCoreSection(markdown: string): string {
  const match = markdown.match(/^#[^#][^\n]*\n+([\s\S]*?)(?=^#|\z)/m);
  return match
    ? truncateAtSentenceBoundary(stripMarkdown(match[1].trim()), MAX_DESCRIPTION_LENGTH)
    : extractDescription(markdown);
}
```

`stripMarkdown` と `truncateAtSentenceBoundary` は既存の内部関数を再利用する。

---

### 変更3: ホームページ JSON-LD（`WebSite` + `Organization`）

`app/page.tsx` のデフォルトエクスポート関数内に `<script type="application/ld+json">` を追加する。

```json
[
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Tryline",
    "url": "https://www.trylinerugby.com",
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://www.trylinerugby.com/?q={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    }
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Tryline",
    "url": "https://www.trylinerugby.com",
    "logo": "https://www.trylinerugby.com/og-image.png",
    "sameAs": ["https://x.com/tryline_rugbyjp"]
  }
]
```

`SITE_URL` 定数を使うこと。sameAs の X URL はハードコードで可。

---

### 変更4: シーズンページ JSON-LD（`BreadcrumbList`）

`app/c/[competition]/[season]/page.tsx` のページコンポーネント内に `<script type="application/ld+json">` を追加する。

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Tryline",
      "item": "https://www.trylinerugby.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "{formatFamilyName(comp.family)}",
      "item": "https://www.trylinerugby.com/c/{competition}"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "{formatCompetitionTitle(comp.name, comp.season)}",
      "item": "https://www.trylinerugby.com/c/{competition}/{season}"
    }
  ]
}
```

`SITE_URL`・`formatFamilyName`・`formatCompetitionTitle` は既存のものを使う。

---

### 変更5: 試合ページ `NewsArticle` JSON-LD（recap あり時）

`app/matches/[id]/page.tsx` で `publishedContent.recap` が存在する場合、既存の `SportsEvent` JSON-LD に加えて `NewsArticle` を出力する。

```json
{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "{match.homeTeam.name} vs {match.awayTeam.name} — {competitionTitle}",
  "description": "{description}",
  "datePublished": "{publishedContent.recap.generatedAt}",
  "dateModified": "{publishedContent.recap.generatedAt}",
  "author": { "@type": "Organization", "name": "Tryline" },
  "publisher": {
    "@type": "Organization",
    "name": "Tryline",
    "logo": { "@type": "ImageObject", "url": "{SITE_URL}/og-image.png" }
  },
  "url": "{SITE_URL}/matches/{id}",
  "image": "{ogImageUrl}"
}
```

既存の `jsonLd` オブジェクトを配列 `[sportsEvent, newsArticle]` にするか、`<script>` タグを2つ出力するかは Codex の判断で可。

---

### 変更6: シーズンページの全試合リンクを初期 HTML に出力

`components/season-match-groups.tsx` の折りたたみレンダリングを **CSS トグル方式**に変更する。

**現状（問題）:**
```tsx
{isOpen && (
  <div className="...">
    {matches.map(...)}
  </div>
)}
```

**変更後:**
```tsx
<div className={isOpen ? "" : "hidden"}>
  {matches.map(...)}
</div>
```

- `hidden` は Tailwind の `display: none` ユーティリティ。
- 全ラウンドの試合カードが初期 HTML に含まれ、Google がクロールできるようになる。
- ユーザー体験は変わらない（折りたたみ UI はそのまま）。
- `aria-expanded` は現行どおり維持する。
- MatchCard が `<a href="/matches/{uuid}">` を出力していることは確認済み。

---

## 受け入れ条件

1. `curl https://www.trylinerugby.com/matches/{任意のid}` のレスポンス HTML に `<link rel="canonical" href="...">` が含まれる。
2. 終了試合かつ recap ありのページの meta description に試合結果の固有情報（スコアまたは結果文）が含まれ、`の試合結果・AI日本語レビュー。` という固定文が使われていない。
3. `curl https://www.trylinerugby.com/` のレスポンス HTML に `WebSite`・`Organization` の JSON-LD が含まれる。
4. `curl https://www.trylinerugby.com/c/premiership/2024-25` のレスポンス HTML に:
   - `<link rel="canonical">` が含まれる
   - `BreadcrumbList` JSON-LD が含まれる
   - 折りたたみ状態のラウンドの試合 `href="/matches/..."` リンクが HTML に含まれる（`hidden` クラス付きで可）
5. recap のある試合ページに `NewsArticle` JSON-LD が含まれる。
6. `tsc --noEmit` でビルドエラーなし。
7. 既存の `SeasonMatchGroups` のユニットテストがすべてパスする（折りたたみロジックの動作に変化なし）。

## 未解決の質問

- `WebSite.potentialAction` の `urlTemplate` は将来の検索機能実装まで `/?q=` のままでよいか。検索 URL パターンが決まったら差し替える。
- `NewsArticle.datePublished` に使うカラムは `match_content.generated_at` で確定してよいか（`updated_at` カラムが存在すれば使う）。