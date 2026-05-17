# PR39: RWC URL 404 修正 + レビュー準備中レイアウトバグ修正

## 背景

2つの独立したバグを修正する。

1. `/c/rwc/rwc-2023` や `/c/rwc/rwc-2027` にアクセスすると 404 になる。
   正しい URL は `/c/rwc/2023`・`/c/rwc/2027` だが、外部から誤形式でリンクされると
   ユーザーが到達できず、SEO にも悪影響を与える。

2. レビューが未生成（「準備中」）の試合ページで、AI チャットの Premium ゲート
   （「続きは Premium でご覧いただけます」＋ブラー）がレビューセクションの直下に
   セクションヘッダーなしで表示されるため、ユーザーがレビューの続きと誤認しやすい。
   実際には AI チャットの Premium ゲートである。

## スコープ

**バグ1（URL）**:
- `next.config.ts`（または `next.config.js`）への permanent redirect 追加

**バグ2（レイアウト）**:
- `components/match-chat.tsx`

対象外:
- データベース変更
- ルーティング全体の見直し
- Premium ゲートのデザイン変更

## 変更詳細

### 1. RWC URL リダイレクト（`next.config.ts`）

`/c/rwc/rwc-:season*` → `/c/rwc/:season*` の permanent redirect を追加する。

```typescript
// next.config.ts の redirects に追加
{
  source: '/c/rwc/rwc-:season*',
  destination: '/c/rwc/:season*',
  permanent: true,
}
```

これにより以下がリダイレクトされる:
- `/c/rwc/rwc-2023` → `/c/rwc/2023`
- `/c/rwc/rwc-2027` → `/c/rwc/2027`

他の競技には影響しない。

### 2. AI チャットセクションヘッダーの追加（`components/match-chat.tsx`）

`MatchChat` コンポーネント（premium/非 premium いずれの状態も）を `<section>` でラップし、
「AI CHAT / AI チャット」の見出しを **常に** 表示する。

現状は `Paywall` を直接 return しており、ブラーの前に何のコンテキストもない。

変更後の構造（非 premium 時）:
```
<section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
  <div className="mb-4 border-b border-slate-100 pb-4">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">AI CHAT</p>
    <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">AI チャット</h2>
  </div>
  <Paywall isPremium={false}>
    <MatchChatPanel disabled matchId={matchId} />
  </Paywall>
</section>
```

変更後の構造（premium 時）:
```
<section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
  <div className="mb-4 border-b border-slate-100 pb-4">
    <p ...>AI CHAT</p>
    <h2 ...>AI チャット</h2>
  </div>
  <MatchChatPanel matchId={matchId} />
</section>
```

`MatchChatPanel` 内部にある重複する見出し（現在の line 131-135 付近）は削除する。

## 受け入れ条件

**URL バグ**:
- `https://tryline-six.vercel.app/c/rwc/rwc-2023` にアクセスすると
  `https://tryline-six.vercel.app/c/rwc/2023` に 301 リダイレクトされる
- `https://tryline-six.vercel.app/c/rwc/rwc-2027` → `/c/rwc/2027` に 301 リダイレクト
- 他競技の URL は変わらない

**レイアウトバグ**:
- 未ログイン状態で `https://tryline-six.vercel.app/matches/d31077ee-92c6-480e-bbef-87f955e6bc1d`
  （RWC 2023 決勝、レビュー未生成）を開いたとき:
  - レビューセクション: 「⏳ レビューを準備中です」が表示される
  - AI チャットセクション: ブラーの外に「AI CHAT / AI チャット」見出しが表示され、
    その下に Premium ゲートが続く
  - 2 セクションが視覚的に別物と判別できる
- レビューが生成済みの試合ページでも AI チャット見出しは正しく表示される
- `pnpm build` でエラーなし

## 未解決の質問

なし。
