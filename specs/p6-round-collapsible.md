# ラウンドセクション 折り畳み対応

## 背景

ラウンド数が多い大会（Top 14 は 26 ラウンド、Premiership は 22 ラウンドなど）の
シーズンページでは、試合カードが縦に非常に長く並ぶ。
ユーザーが特定のラウンドを探すためにスクロールし続けなければならず、
UX として重い。

直近ラウンドをデフォルト展開し、過去のラウンドは折り畳むことで
ページの認知的負荷を下げる。

## スコープ

対象:
- `components/season-matches.tsx`（またはラウンドグルーピングコンポーネント）

対象外:
- ラウンド数が少ない大会（Six Nations は 5 節、Autumn Nations は 5 節など 10 未満）
- ラウンドラベルのスタイル変更

## 変更内容

### デフォルト展開ルール

| 状態 | 展開されるラウンド |
|------|------------------|
| シーズン進行中 | 直近の完了ラウンド + 1（次の未来ラウンド） |
| シーズン終了後 | 最終ラウンドのみ |
| シーズン未開始 | 第 1 ラウンドのみ |

ラウンド数が 10 以下の大会（Six Nations、Autumn Nations、Rugby Championship、
Nations Cup）はすべて展開したままにする（折り畳み不要）。

### UI

```tsx
// ラウンドセクションの見出しをクリックで展開/折り畳み
<button
  className="flex w-full items-center justify-between py-3"
  aria-expanded={isOpen}
  onClick={() => setIsOpen(!isOpen)}
>
  <h2>{getRoundLabel(round.roundNumber)}</h2>
  <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
</button>

{isOpen && (
  <ul>{/* 試合カード一覧 */}</ul>
)}
```

### 実装方針

- 各ラウンドセクションを `RoundSection` コンポーネントに分離する
- `defaultOpen` prop でデフォルト展開状態を制御する
- Client Component としてローカル state で管理する

```tsx
type RoundSectionProps = {
  round: Round;
  matches: Match[];
  defaultOpen?: boolean;
};
```

## 変更ファイル

- `components/season-matches.tsx`（ラウンドグルーピング・折り畳みロジック）
- `components/round-section.tsx`（新規コンポーネントとして分離する場合）

## 受け入れ条件

- [ ] ラウンド数 ≥ 10 の大会でラウンドセクションが折り畳み可能になる
- [ ] 直近ラウンド（または最終ラウンド）がデフォルト展開されている
- [ ] ラウンド見出しのクリックで展開/折り畳みが切り替わる
- [ ] `aria-expanded` が展開状態を正しく反映している
- [ ] ラウンド数 < 10 の大会はすべて展開のまま（折り畳みなし）
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

1. 「直近ラウンド」の判定は `kickoff_at <= now()` の最大 `round_number` でよいか
2. スクロール位置を直近ラウンドに自動スクロールするか（追加実装として別途評価）
