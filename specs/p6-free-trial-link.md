# 「無料で試す」ボタン リンク修正

## 背景

料金ページ（`/pricing`）に「無料で試す」ボタンが存在するが、
href が `/`（ホーム）になっており、クリックするとホームに遷移するだけで
何も体験できない。

「無料で試す」は「ログインなしで読める試合記事を読んでみる」という意図と考えられるため、
実際に無料コンテンツが存在するページに遷移させる必要がある。

## スコープ

対象:
- 料金ページの「無料で試す」ボタン

対象外:
- 認証ロジック
- 無料枠の閲覧制限ロジック

## 変更内容

### 現状

```tsx
// href が "/" になっている
<Link href="/">無料で試す</Link>
```

### 修正後

**方針 A: 試合一覧ページ（ホーム）へ（最小変更）**

```tsx
<Link href="/">試合記事を読む</Link>
```

ボタンのラベルを「試合記事を読む」に変更し、ホームで試合一覧を見せる。

**方針 B: 直近の完了試合の詳細ページへ（推奨）**

サーバーサイドで最近終了した試合 ID を取得し、その詳細ページへリンクする。

```tsx
// app/pricing/page.tsx
const latestMatch = await getLatestCompletedMatch();
const trialUrl = latestMatch ? `/matches/${latestMatch.id}` : '/';

<Link href={trialUrl}>無料で記事を読む</Link>
```

`getLatestCompletedMatch` を `lib/db/matches.ts` に追加する:

```ts
export async function getLatestCompletedMatch() {
  const { data } = await supabase
    .from('matches')
    .select('id')
    .lt('kickoff_at', new Date().toISOString())
    .order('kickoff_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}
```

方針 B を推奨する。ユーザーが実際のコンテンツに到達できるため体験価値が高い。

## 変更ファイル

- `app/pricing/page.tsx`（「無料で試す」ボタンの href とラベル）
- `lib/db/matches.ts`（方針 B の場合、`getLatestCompletedMatch` を追加）

## 受け入れ条件

- [ ] 「無料で試す」ボタンのクリックがホーム以外のコンテンツページへ遷移する
- [ ] 遷移先のページに無料で閲覧できる試合コンテンツが存在する
- [ ] 方針 B の場合、試合データが 0 件のとき `/` にフォールバックする
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

1. 「無料で試す」のコンセプト：ログイン不要で読める記事なのか、
   無料アカウント登録が必要なのか Owner に確認
2. 無料枠で試合詳細の全文が読めるか paywall が出るか（体験が変わる）
