# インタラクティブ要素にアクティブ/プレス状態のフィードバックがない

## 背景

Taste Skill監査で判明。サイト内のホバー可能なカード・CTAは既に `hover:-translate-y-0.5` + `shadow` の組み合わせで「設計されたホバー状態」を持っている（`match-card.tsx`、`app/page.tsx` の複数箇所、`app/c/[competition]/page.tsx`、`match-header.tsx`、`match-chat.tsx`）。

一方で、クリック/タップ時の押し込みフィードバック（`active:scale-*` 等）はコードベース全体で**1箇所も使われていない**（`grep -rn "active:scale" app components` で確認済み）。ホバーで浮き上がる動きはあるのに、押した瞬間の物理的なフィードバックが無いため、実際に押せたのかが分かりにくい。

なお、監査でも疑われた「タイポグラフィのMedium/SemiBoldウェイト活用不足」「text-wrap: balanceの適用不足」は調査の結果、`font-medium`/`font-semibold` が全体で108箇所使用済みで既に十分だったため対象外とする。

## スコープ

対象（`transform` にactive状態を追加する。値は既存のhover translateと違和感のない `active:scale-[0.98]` に統一）:

- `components/ui/button.tsx` — `buttonVariants` の base クラス
- `components/match-card.tsx:34`
- `components/match-header.tsx:162`
- `components/match-chat.tsx:304`
- `app/page.tsx:458`
- `app/page.tsx:513`
- `app/page.tsx:551`
- `app/c/[competition]/page.tsx:135`

対象外:
- 上記以外の未確認箇所（本specの受け入れ条件で新規追加分のみ検証する。site全体の網羅的なaudit-fixではない）
- タイポグラフィ関連（Medium/SemiBoldウェイト、text-wrap: balance）— 上記の通り対象外と判断済み

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### `components/ui/button.tsx`

base クラス（8行目）に `active:scale-[0.98]` を追加し、`transition-colors` を `transition-all` に変更（scale変化もtransitionさせるため）。

```diff
- "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none ..."
+ "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all active:scale-[0.98] focus-visible:outline-none ..."
```

### その他7ファイル

各該当行の className に既存の `hover:-translate-y-0.5` 等と並べて `active:scale-[0.98]` を追加する。例（`match-card.tsx:34`）:

```diff
- className="relative h-full overflow-hidden rounded-xl border border-slate-200 p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_18px_rgb(15_23_42/0.10)]"
+ className="relative h-full overflow-hidden rounded-xl border border-slate-200 p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_18px_rgb(15_23_42/0.10)] active:scale-[0.98]"
```

他6箇所も同じ要領（既存の `hover:` クラス群の末尾に `active:scale-[0.98]` を追加するだけ）。

## LLM 連携

なし

## 受け入れ条件

1. 上記8ファイル全てに `active:scale-[0.98]` が追加されている
2. `components/ui/button.tsx` は `transition-colors` → `transition-all` に変更されている
3. 既存のホバー挙動（translate-y、shadow、border色変化）に regression がない
4. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
5. 実機またはブラウザDevToolsで対象要素をクリック/タップし、押し込み時にわずかな縮小が視認できる

## 未解決の質問

なし。
