# PR #63 — 料金ページに Premium 画面の実例を追加

## 背景

現在の料金ページ（`/pricing`）には機能比較テーブルと FAQ しかなく、
「Premium を契約するとどんな画面が見られるか」が視覚的に伝わらない。
有料転換の最大の障壁は「価値が想像できない」ことであり、
実際の画面スクリーンショットを1セクション追加することで解決する。

## スコープ

対象:
- `app/pricing/page.tsx` — 新しい「Premium の画面例」セクションを追加
- `public/pricing/` — スクリーンショット画像を格納するディレクトリ（Owner が準備）

対象外:
- ヒーロー・機能テーブル・FAQ の既存構造は変更しない
- Stripe 決済フローは変更しない

## 画像の準備

**この仕様書を Codex に渡す前に Owner が以下を `public/pricing/` に配置すること:**

| ファイル名 | 内容 |
|-----------|------|
| `review-full.png` | Premium ユーザーが見る試合レビュー全文（フルページスクショ） |
| `ai-chat.png` | AI チャット画面（質問と回答が見えている状態） |

画像サイズ: 幅 1200px 以上推奨（Next.js の `<Image>` で最適化される）

## 実装仕様

### 挿入位置

機能比較テーブルの直後、FAQ セクションの直前に新セクションを挿入する。

### セクション構造

```tsx
<section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:px-8">
  <h2 className="mb-2 text-2xl font-black tracking-tight text-[var(--color-ink)] sm:text-3xl">
    Premium ではこんな画面が読めます
  </h2>
  <p className="mb-10 text-sm text-[var(--color-ink-muted)]">
    AI が生成した詳細な日本語レビューと、試合について何でも聞ける AI チャット。
  </p>

  <div className="space-y-12">
    {/* レビュー全文 */}
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
        AI 日本語レビュー全文
      </p>
      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <Image
          alt="Premium 試合レビューの画面例"
          className="w-full"
          height={800}
          src="/pricing/review-full.png"
          width={1200}
        />
      </div>
    </div>

    {/* AI チャット */}
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
        試合 AI チャット
      </p>
      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <Image
          alt="AI チャットの画面例"
          className="w-full"
          height={600}
          src="/pricing/ai-chat.png"
          width={1200}
        />
      </div>
    </div>
  </div>
</section>
```

- `next/image` の `<Image>` コンポーネントを使用する
- `height` の値は実際の画像サイズに合わせて調整してよい
- `public/pricing/` ディレクトリが存在しない場合は作成する

## 完了の定義

- [ ] `/pricing` にアクセスして「Premium ではこんな画面が読めます」セクションが機能テーブルの後・FAQ の前に表示される
- [ ] 2枚の画像が角丸ボーダー付きカードで表示される
- [ ] モバイル（375px）でも画像が横幅いっぱいに表示される
- [ ] TypeScript エラーなし・`pnpm build` 通過
