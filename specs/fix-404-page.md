# サイト全体の404ページ未実装

## 背景

Taste Skill（OSSのフロントエンド品質監査フレームワーク）を使った本番サイト監査で判明した実装漏れ。`app/matches/[id]/not-found.tsx` は既に日本語ブランドUIで実装されているが、それ以外の未定義ルート（例: `/this-page-does-not-exist`）にアクセスすると Next.js のデフォルト404（英語、ブランドなし、ホームへの導線なし）が表示される。

`app/layout.tsx` の `RootLayout` は `<SiteHeader />` / `<SiteFooter />` を直接レンダリングしているため、`app/not-found.tsx` を追加すれば自動的にヘッダー・フッター付きで表示される（レイアウト変更は不要）。

## スコープ

対象:
- `app/not-found.tsx`（新規作成）

対象外:
- `app/matches/[id]/not-found.tsx`（実装済み、変更不要）
- 個別ルートセグメントごとのカスタム404（他に無いことを確認済み。必要になれば別spec）
- ロギング・エラートラッキングの追加

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

`app/matches/[id]/not-found.tsx` と同じパターンで実装する（参照: 該当ファイル）。

```tsx
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-start justify-center gap-4 px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Tryline</p>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">ページが見つかりません</h1>
      <p className="text-sm leading-6 text-slate-600">
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <Button asChild>
        <Link href="/">トップページに戻る</Link>
      </Button>
    </main>
  );
}
```

見出し・本文コピーは上記を叩き台とし、`app/matches/[id]/not-found.tsx` とのトーン一貫性を保てば文言の微調整は許容する。

## LLM 連携

なし（静的ページ）

## 受け入れ条件

1. `app/not-found.tsx` が存在し、存在しないパス（例: `/this-page-does-not-exist`）にアクセスすると当該コンポーネントがレンダリングされる
2. レンダリング結果に `SiteHeader` / `SiteFooter` が含まれる（ルートレイアウト経由、追加実装不要のはずだが目視確認する）
3. 日本語の見出し・本文が表示され、トップページ（`/`）へ戻るリンク／ボタンが機能する
4. HTTPステータスコードが `404` を返す（Next.jsの `not-found.tsx` の標準挙動を上書きしていないこと）
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 未解決の質問

なし。既存パターンの横展開のみで判断に迷う点はない。
