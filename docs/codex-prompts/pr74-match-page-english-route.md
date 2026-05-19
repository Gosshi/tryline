# PR #74 — 試合ページに英語ルート `/matches/[id]/en` と切り替え UI を追加

## 前提

PR #72・#73 が完了していること（`language` カラムと英語コンテンツが存在する）。

## 背景

`/matches/[id]/en` で英語コンテンツを表示する。
試合ページ上部に日英切り替えボタンを設置し、相互に行き来できるようにする。

## スコープ

対象:
- `app/matches/[id]/en/page.tsx` — 新規作成
- `app/matches/[id]/page.tsx` — 切り替えボタンの追加
- `lib/db/queries/matches.ts` — 英語コンテンツ取得クエリを追加
- `components/lang-toggle.tsx` — 新規作成
- `app/sitemap.ts` — `/en` URL をサイトマップに追加

対象外:
- 日本語ページの既存ロジックは変更しない
- AI チャットは日本語版のみ（英語ページでは表示しない）

## DB クエリの追加

`lib/db/queries/matches.ts` に英語コンテンツ取得関数を追加:

```ts
export async function getMatchContentEn(matchId: string) {
  const db = getSupabaseServerClient();
  const { data } = await db
    .from("match_content")
    .select("content_type, content_md_ja, status")
    .eq("match_id", matchId)
    .eq("language", "en")
    .eq("status", "published")
    .in("content_type", ["recap", "preview"]);
  return data ?? [];
}
```

## 切り替え UI

`components/lang-toggle.tsx` を新規作成:

```tsx
import Link from "next/link";

export function LangToggle({
  matchId,
  currentLang,
}: {
  matchId: string;
  currentLang: "ja" | "en";
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-0.5 text-xs font-semibold">
      <Link
        aria-current={currentLang === "ja" ? "page" : undefined}
        className={[
          "rounded-full px-3 py-1 transition-colors",
          currentLang === "ja"
            ? "bg-[var(--color-ink)] text-white"
            : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
        ].join(" ")}
        href={`/matches/${matchId}`}
      >
        JP
      </Link>
      <Link
        aria-current={currentLang === "en" ? "page" : undefined}
        className={[
          "rounded-full px-3 py-1 transition-colors",
          currentLang === "en"
            ? "bg-[var(--color-ink)] text-white"
            : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
        ].join(" ")}
        href={`/matches/${matchId}/en`}
      >
        EN
      </Link>
    </div>
  );
}
```

## 日本語ページへのトグル追加

`app/matches/[id]/page.tsx` の `<MatchHeader>` 直後に追加。
英語コンテンツが存在する場合のみ表示する:

```tsx
import { LangToggle } from "@/components/lang-toggle";

// MatchHeader の直後
{hasEnglishContent && (
  <div className="flex items-center justify-end">
    <LangToggle currentLang="ja" matchId={match.id} />
  </div>
)}
```

`hasEnglishContent` は `getMatchContentEn(id)` の結果が空でないかどうかで判定する。

## 英語ページ（`app/matches/[id]/en/page.tsx`）

日本語ページを参考に作成。以下の点が異なる:

- `getMatchContentEn(id)` で英語コンテンツを取得
- コンテンツが空なら `notFound()` を返す
- `<LangToggle currentLang="en" matchId={match.id} />` を表示
- AI チャットセクションは表示しない
- metadata:
  ```ts
  title: `${homeTeam.name} vs ${awayTeam.name} — ${competitionName} | Tryline`
  alternates: { canonical: `/matches/${id}/en` }
  ```
- `hreflang` を head に追加（Next.js の `alternates.languages` を使う）:
  ```ts
  alternates: {
    canonical: `/matches/${id}/en`,
    languages: {
      ja: `/matches/${id}`,
      en: `/matches/${id}/en`,
    },
  }
  ```

## サイトマップ

`app/sitemap.ts` にリーグワン試合の英語 URL を追加する。
`listAllMatchIds` でコンペティションの family が取れない場合は返すよう修正する。

```ts
const enMatchPages = leagueOneMatchIds.map((id) => ({
  url: `${base}/matches/${id}/en`,
  lastModified: new Date(),
  changeFrequency: "weekly" as const,
  priority: 0.7,
}));
```

## 完了の定義

- [ ] `/matches/[id]/en` でリーグワンの英語コンテンツが表示される
- [ ] 日英ページ双方に JP/EN トグルが表示される
- [ ] リーグワン以外の試合ではトグルが表示されない
- [ ] 英語コンテンツが存在しない URL は 404 になる
- [ ] AI チャットは英語ページに表示されない
- [ ] `hreflang` タグが正しく設定されている
- [ ] サイトマップにリーグワン試合の `/en` URL が含まれる
- [ ] TypeScript エラーなし・`pnpm build` 通過
