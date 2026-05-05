# feat: 終了済み試合に YouTube ハイライト検索リンクを追加

## 目的

試合詳細ページの終了済み試合に「YouTube でハイライトを検索」ボタンを追加し、
ユーザーが公式ハイライト動画に素早くアクセスできるようにする。
データモデル変更なし・YouTube API 不要の最小実装。

## 実装の流れ

### 変更するファイル

`components/match-header.tsx` のみ変更する。

### YouTube 検索 URL の生成

```ts
function buildYouTubeSearchUrl(
  homeTeamName: string,
  awayTeamName: string,
  kickoffAt: string,
): string {
  const year = new Date(kickoffAt).getFullYear();
  const query = `${homeTeamName} vs ${awayTeamName} ${year} highlights`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
```

### MatchHeader への追加

既存のメタ行（JST / 現地 / 会場）の `<div className="mt-7 flex flex-wrap ...">` の直後、
`</section>` の直前に追加する。`match.status === "finished"` のときのみ表示。

```tsx
{match.status === "finished" && (
  <div className="mt-3 border-t border-slate-100 pt-3 px-5 pb-4 sm:px-6">
    <a
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
      href={buildYouTubeSearchUrl(
        match.homeTeam.name,
        match.awayTeam.name,
        match.kickoffAt,
      )}
      rel="noreferrer noopener"
      target="_blank"
    >
      <svg
        aria-hidden
        className="h-3.5 w-3.5 text-red-500"
        fill="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
      YouTube でハイライトを検索
    </a>
  </div>
)}
```

既存の `px-5 py-7 sm:px-6 sm:py-8` の div 内に追加する場合は padding 調整に注意。
メタ行 div の `</div>` の後、アウターの `</div>` を閉じる前に挿入すること。

## 変更するファイル

- `components/match-header.tsx` のみ
  - `buildYouTubeSearchUrl` 関数を追加
  - `MatchHeader` の JSX に YouTube リンクブロックを追加

## 変更しないこと

- データクエリ・型定義
- 他のコンポーネント・ページ

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- 終了済み試合の詳細ページにハイライト検索ボタンが表示されること
- ボタンをクリックすると YouTube 検索が新しいタブで開くこと
- scheduled / in_progress の試合ではボタンが表示されないこと

## ブランチ・PR

- ブランチ: `feat/youtube-highlight-link`
- PR タイトル: `Feat: add YouTube highlight search link to finished match pages`
