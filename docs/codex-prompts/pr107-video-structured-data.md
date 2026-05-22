# PR #107 — Pricing ページの動画に VideoObject 構造化データを追加

## 背景

Google Search Console から「動画のサムネイル URL が未指定でインデックス未登録」の警告が来ている。
`app/pricing/page.tsx` に YouTube iframe 埋め込み（動画 ID: `2kFHgiaI-NA`）があるが、
`VideoObject` の JSON-LD が存在しないため、Google がサムネイルを取得できていない。

## スコープ

対象:
- `app/pricing/page.tsx` のみ

対象外:
- 他ページの変更なし

---

## 変更仕様

`app/pricing/page.tsx` の JSX 冒頭（`<>` の直後）に `VideoObject` JSON-LD を追加する。

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: "Tryline — AI ラグビー解説サービス紹介",
      description:
        "海外ラグビーの試合を AI が日本語で解説。プレビュー・レビュー・AI チャットが使える Tryline の紹介動画です。",
      thumbnailUrl: "https://img.youtube.com/vi/2kFHgiaI-NA/maxresdefault.jpg",
      embedUrl: "https://www.youtube.com/embed/2kFHgiaI-NA",
      uploadDate: "2025-01-01",
    }),
  }}
/>
```

`uploadDate` は動画の実際の公開日に合わせて修正すること（不明な場合は `"2025-01-01"` のまま可）。

---

## 完了の定義

- [ ] `pricing` ページのソースに `application/ld+json` の `VideoObject` が出力される
- [ ] `thumbnailUrl` フィールドが含まれている
- [ ] TypeScript エラーなし・`pnpm build` 通過
