# コンテンツ待ち文言から「自動生成されます」を除去

## 背景

2026-07-03 のデザイン・UI・集客横断レビュー（`docs/design-ui-growth-review-2026-07-03.md` B-7）で、プレビュー/レビュー未公開時のプレースホルダーに「コンテンツは自動生成されます。しばらくお待ちください。」という補助文言が表示されていることが判明した。

`components/content-placeholder.tsx` の主ラベル（例:「レビューは試合終了 1 時間後に公開予定」）自体は既に時間約束型の良い文言になっている。問題はその下に常に添えられる補助文言だけであり、これは 2026-06-07 の UI 方針決定（`specs/fix-ai-copy-labels.md` 冒頭のメモ、[[project-ai-labeling]]）「生成手段をわざわざ強調せず、コンテンツ品質で勝負する」と矛盾する。`fix-ai-copy-labels.md` はこのコンポーネントを変更対象に含めていない（対象ファイル一覧に `content-placeholder.tsx` は無い）ため、本 spec が担当する。

## 根本原因

`components/content-placeholder.tsx:39-43`:

```tsx
{state !== "unavailable" && (
  <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
    コンテンツは自動生成されます。しばらくお待ちください。
  </p>
)}
```

`pre_window`（試合開始/終了前で未公開）・`preparing`（生成中）の両状態で無条件にこの文言が付く。特に `pre_window` 状態は主ラベルの「◯時間後に公開予定」だけで十分に意味が伝わっており、この補助文言は「AI が自動で書く」ことを強調するだけで読者にとっての追加情報価値がない。

## スコープ

**対象:** `components/content-placeholder.tsx` のみ（コピー変更のみ、ロジック変更なし）

**対象外:**
- 主ラベル文言（`COPY` オブジェクトの `pre_window` / `preparing` / `unavailable`）は変更しない。既に時間約束型になっており方針に合致している
- `lib/match-content/state.ts` の `deriveContentState` ロジック（状態判定自体は変更不要）
- `components/match-content-section.tsx`（呼び出し元。呼び出し方は変更不要）

## データモデル変更

なし。

## API サーフェス

なし。

## UI / コピー変更詳細

`components/content-placeholder.tsx:39-43` を以下のいずれかに変更する:

**案A（補助文言を削除）:**
```tsx
{/* 削除: 補助文言ブロック全体 */}
```

**案B（自動生成に触れない内容に置き換え、状態別に出し分け）:**
```tsx
{state === "preparing" && (
  <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
    公開までしばらくお待ちください。
  </p>
)}
```
（`pre_window` では補助文言なし。主ラベルの時間予告だけで十分なため）

いずれの案でも「自動生成」「AI」という語をこの補助文言から除去することが必須。案A・案Bのどちらを採用するかは実装時に判断してよい（見た目のバランスを見て選択）。

## 受け入れ条件

1. `components/content-placeholder.tsx` に「自動生成」という文言が残っていない
2. `pre_window` / `preparing` の主ラベル文言（`COPY` オブジェクト）は変更されていない
3. `unavailable` 状態の表示（補助文言なし）は変更されない
4. プレビュー未公開・レビュー未公開の両方の試合ページで表示を目視確認する
5. `pnpm tsc --noEmit` / `pnpm build` が通る

## 未解決の質問

- 案A（削除のみ）と案B（`preparing` のみ短い文言を残す）のどちらが良いかは Owner の好み次第。デフォルトは案A（シンプルに削除）を推奨するが、実装時に両方のスクリーンショットを見て決めてもよい
