# PR #67 — 料金ページにプロダクトデモ動画を追加

## 背景

料金ページ（`/pricing`）に YouTube のプロダクトデモ動画（`2kFHgiaI-NA`）を埋め込む。
訪問者がヒーローを読んだ直後に「実際の画面を見られる」ことで、
Premium の価値を具体的に伝えて有料転換を後押しする。

## スコープ

対象:
- `app/pricing/page.tsx` — デモ動画セクションを追加

対象外:
- ヒーロー・機能テーブル・スクリーンショットセクション・FAQ は変更しない

## 挿入位置

ヒーロー `<section>` の直後、機能テーブル `<section>` の直前。
`max-w-5xl` のコンテナ内の `space-y-14` の最初の要素として追加する。

## 実装仕様

```tsx
{/* デモ動画 */}
<section>
  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
    プロダクトデモ
  </p>
  <h2 className="mb-6 text-2xl font-black tracking-tight text-[var(--color-ink)] sm:text-3xl">
    実際の画面を見てみる
  </h2>
  <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
    <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
        src="https://www.youtube.com/embed/2kFHgiaI-NA?rel=0&modestbranding=1"
        title="Tryline プロダクトデモ"
      />
    </div>
  </div>
</section>
```

### ポイント

- `paddingTop: "56.25%"` — 16:9 のアスペクト比を維持するレスポンシブ埋め込み
- `rel=0` — 関連動画を非表示（他チャンネルの動画が出ないようにする）
- `modestbranding=1` — YouTube ロゴを最小化
- `allowFullScreen` — フルスクリーン再生を許可
- 角丸ボーダーは既存の `overflow-hidden rounded-2xl border border-slate-200 shadow-sm` で統一

## 完了の定義

- [ ] `/pricing` にデモ動画セクションがヒーローの直下に表示される
- [ ] 動画が 16:9 でレスポンシブ表示される
- [ ] モバイル（375px）でも動画が正しく表示される
- [ ] TypeScript エラーなし・`pnpm build` 通過
