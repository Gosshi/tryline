# PR #114 — 試合ページを ISR 化して Google インデックスを改善

## 背景

`app/matches/[id]/page.tsx` と `/en/page.tsx` が `force-dynamic` になっているため、
Googlebot がクロールするたびにサーバーレンダリングが発生し、クロールバジェットを消耗している。
結果として Google がインデックスできているのが 9 ページのみ。

`force-dynamic` の原因は `getUser()` / `isPremium()` のサーバーサイド認証チェック。
これをページから除去し、プレミアムチェックをクライアントサイドに移すことで ISR が実現できる。

## スコープ

対象:
- `app/api/me/premium/route.ts` — 新規作成（プレミアム状態を返す API）
- `components/premium-recap-section.tsx` — 新規作成（クライアント側プレミアムゲート）
- `components/premium-upsell-banner.tsx` — 新規作成（クライアント側プレミアム誘導バナー）
- `app/matches/[id]/page.tsx` — ISR 化 + `generateStaticParams` 追加
- `app/matches/[id]/en/page.tsx` — 同上
- `app/c/[competition]/[season]/page.tsx` — ISR 化 + `generateStaticParams` 追加
- `lib/db/queries/matches.ts` — `listMatchIdsWithContent` 追加

対象外:
- `components/match-content-section.tsx` の変更なし
- `lib/auth/server.ts` の変更なし
- `app/c/[competition]/page.tsx` の変更なし（認証なし、問題なし）

---

## 変更仕様

### 1. `app/api/me/premium/route.ts` — 新規作成

```ts
import { NextResponse } from "next/server";
import { getUser, isPremium } from "@/lib/auth/server";

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ isPremium: false });
  }
  const premium = await isPremium(user.id);
  return NextResponse.json({ isPremium: premium });
}
```

### 2. `components/premium-recap-section.tsx` — 新規作成

レビューコンテンツのプレミアムゲートをクライアント側で処理するコンポーネント。

```tsx
"use client";

import { useEffect, useState } from "react";
import { MatchContentSection } from "@/components/match-content-section";

type Props = {
  content: React.ComponentProps<typeof MatchContentSection>["content"];
  match: React.ComponentProps<typeof MatchContentSection>["match"];
  language?: React.ComponentProps<typeof MatchContentSection>["language"];
};

export function PremiumRecapSection({ content, match, language }: Props) {
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    fetch("/api/me/premium")
      .then((res) => res.json())
      .then((data) => setIsPremium(data.isPremium ?? false))
      .catch(() => {});
  }, []);

  return (
    <MatchContentSection
      content={content}
      contentType="recap"
      isPremium={isPremium}
      match={match}
      language={language}
    />
  );
}
```

### 3. `lib/db/queries/matches.ts` — `listMatchIdsWithContent` を追加

```ts
export async function listMatchIdsWithContent(): Promise<{ id: string }[]> {
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("match_content")
    .select("match_id")
    .eq("status", "published");

  if (error) throw error;

  const unique = [...new Set((data ?? []).map((r) => r.match_id))];
  return unique.map((id) => ({ id }));
}
```

### 4. `app/matches/[id]/page.tsx` — ISR 化

#### 4-1. `force-dynamic` を削除し `revalidate` を更新

```ts
// Before
export const revalidate = 60;
export const dynamic = "force-dynamic";

// After
export const revalidate = 3600;
```

#### 4-2. `generateStaticParams` を追加

```ts
import { listMatchIdsWithContent } from "@/lib/db/queries/matches";

export async function generateStaticParams() {
  const matches = await listMatchIdsWithContent();
  return matches.map(({ id }) => ({ id }));
}
```

#### 4-3. ページ本体から認証コードを除去

```ts
// Before
const [match, publishedContent, events, lineups, user] = await Promise.all([
  getMatchById(id),
  getPublishedContentForMatch(id),
  getMatchEventsForMatch(id),
  getMatchLineupsForMatch(id),
  getUser(),
]);
const premium = user ? await isPremium(user.id) : false;

// After
const [match, publishedContent, events, lineups] = await Promise.all([
  getMatchById(id),
  getPublishedContentForMatch(id),
  getMatchEventsForMatch(id),
  getMatchLineupsForMatch(id),
]);
```

import から `getUser` と `isPremium` も削除する。

#### 4-4. レビューセクションを `PremiumRecapSection` に置き換え

```tsx
// Before
<MatchContentSection
  content={publishedContent.recap}
  contentType="recap"
  isPremium={premium}
  match={match}
/>

// After
<PremiumRecapSection
  content={publishedContent.recap}
  match={match}
/>
```

プレビューセクションはそのまま（`isPremium={true}` で固定済み）。

### 5. `app/matches/[id]/en/page.tsx` — 同様の変更

JA ページと同じく:
- `force-dynamic` を削除、`revalidate = 3600`
- `generateStaticParams` を追加（`listMatchIdsWithContent` を使用。EN ページはコンテンツがある league-one の試合のみなので、既存の `listAllMatchIds` フィルタと合わせて対応）
- `getUser()` / `isPremium()` を除去
- レビューセクションを `PremiumRecapSection` に置き換え（`language="en"` を渡す）

---

### 6. `components/premium-upsell-banner.tsx` — 新規作成

大会シーズンページのプレミアム誘導バナーをクライアントコンポーネント化。

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function PremiumUpsellBanner() {
  const [isPremium, setIsPremium] = useState(true); // 初期値 true でフラッシュを防ぐ

  useEffect(() => {
    fetch("/api/me/premium")
      .then((res) => res.json())
      .then((data) => setIsPremium(data.isPremium ?? false))
      .catch(() => setIsPremium(false));
  }, []);

  if (isPremium) return null;

  return (
    <div className="rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 px-5 py-4">
      <p className="text-sm font-semibold text-[var(--color-ink)]">
        AI 日本語レビューを全文読むには Premium が必要です
      </p>
      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
        各試合の詳細分析・プレビュー・AI チャットが月額 ¥980 で読み放題。
      </p>
      <Link href="/pricing">
        {/* 既存の pricing リンク部分はそのまま移植する */}
      </Link>
    </div>
  );
}
```

初期値を `true`（非表示）にすることで、プレミアムユーザーに対してバナーがフラッシュしない。
非プレミアムユーザーは API レスポンス後にバナーが表示される。

既存の JSX 内のバナー部分（`{hasAnyContent && !isPremium && (<div>...</div>)}`）を
`{hasAnyContent && <PremiumUpsellBanner />}` に置き換える。

### 7. `app/c/[competition]/[season]/page.tsx` — ISR 化

#### 7-1. `revalidate` を更新し認証コードを除去

```ts
// Before
export const revalidate = 60;
// + getUser() / getUserProfile() / isPremium の計算あり

// After
export const revalidate = 3600;
// getUser / getUserProfile / isPremium をすべて削除
```

import から `getUser` と `getUserProfile` も削除する。

#### 7-2. `generateStaticParams` を追加

```ts
import { listFamilies, listSeasonsByFamily } from "@/lib/db/queries/competitions";

export async function generateStaticParams() {
  const families = await listFamilies();
  const params = (
    await Promise.all(
      families.map(async (competition) => {
        const seasons = await listSeasonsByFamily(competition);
        return seasons.map((s) => ({ competition, season: s.season }));
      }),
    )
  ).flat();
  return params;
}
```

#### 7-3. バナー部分を `PremiumUpsellBanner` に置き換え

```tsx
// Before
{hasAnyContent && !isPremium && (
  <div className="rounded-xl ...">...</div>
)}

// After
{hasAnyContent && <PremiumUpsellBanner />}
```

---

## 完了の定義

- [ ] `app/matches/[id]/page.tsx` から `dynamic = "force-dynamic"` が消えている
- [ ] `app/matches/[id]/en/page.tsx` から `dynamic = "force-dynamic"` が消えている
- [ ] `app/c/[competition]/[season]/page.tsx` の `getUser()` / `getUserProfile()` が除去されている
- [ ] `generateStaticParams` が試合ページ・大会シーズンページの全ページに存在する
- [ ] `PremiumRecapSection` がクライアントコンポーネントとして動作する
- [ ] `PremiumUpsellBanner` が初期値 `true`（非表示）でフラッシュを防いでいる
- [ ] `/api/me/premium` が未認証で `{ isPremium: false }` を返す
- [ ] `pnpm build` が通過し、試合・大会シーズンページが静的生成されている（build output に `○` が付く）
- [ ] TypeScript エラーなし
