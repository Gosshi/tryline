# PR #92 — X 投稿：キックオフ済みプレビューのスキップ

## 背景

`post-to-x` は `x_posted_at = null` のプレビュー・レビューをまとめて投稿する。
クレジット切れなどで投稿できなかったプレビューが `x_posted_at = null` のまま残ると、
試合終了後に `post-to-x` が実行されたとき、
**「プレビュー」ラベルなのに試合結果スコアが表示される** 投稿が生成される。

原因: `post-to-x` は現在の `matches.home_score / away_score` を取得するため、
試合後に投稿すると結果スコアが入ってしまう。

## スコープ

対象:
- `app/api/cron/post-to-x/route.ts`

---

## 変更仕様

### キックオフ済みプレビューは投稿せず `x_posted_at` を埋める

`for (const content of data)` ループ内、`const match = firstRelation(content.matches)` の
直後に以下の分岐を追加する:

```ts
const now = new Date().toISOString();

if (content.content_type === "preview" && match.kickoff_at < now) {
  await db
    .from("match_content")
    .update({ x_posted_at: now })
    .eq("id", content.id);
  continue;
}
```

`x_posted_at` を埋めることで次回以降の cron 実行でも同じレコードを拾わない。

---

## 完了の定義

- [ ] キックオフ後に `post-to-x` を実行しても、プレビューは投稿されない
- [ ] スキップされたプレビューは `x_posted_at` が埋まり次回以降も拾われない
- [ ] キックオフ前のプレビューは引き続き正常に投稿される
- [ ] レビュー（recap）の投稿は影響を受けない
- [ ] TypeScript エラーなし・`pnpm build` 通過
