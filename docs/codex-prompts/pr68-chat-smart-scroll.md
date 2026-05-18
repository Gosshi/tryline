# PR #68 — AI チャットのスクロール制御を smart scroll に変更

## 背景

`components/match-chat.tsx` の AI チャットは、ストリーミング完了後に
`bottomRef.current?.scrollIntoView({ behavior: "smooth" })` を呼んでいる。
`scrollIntoView` はページ全体を動かすため、ユーザーが手動でスクロールした状態でも
強制的に画面が下に飛ぶ。これが不快なので smart scroll に変更する。

**Smart scroll の定義**:
- ユーザーがチャットコンテナの最下部付近にいる → 自動スクロール継続
- ユーザーが手動でスクロールアップした → 自動スクロール停止
- ユーザーが最下部に戻ったら → 自動スクロール再開

## スコープ

対象:
- `components/match-chat.tsx` のみ

対象外:
- チャット機能・UI の変更なし
- API・ストリーミングロジックの変更なし

## 現在の実装（変更前）

```tsx
const bottomRef = useRef<HTMLDivElement>(null);

// finally ブロック
bottomRef.current?.scrollIntoView({ behavior: "smooth" });

// JSX
<div className="max-h-[420px] space-y-3 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-4">
  {messages.map(...)}
  <div ref={bottomRef} />
</div>
```

## 変更後

### 追加する ref

```tsx
const containerRef = useRef<HTMLDivElement>(null);
const isAtBottomRef = useRef(true); // ユーザーが最下部にいるかどうか
```

`useState` ではなく `useRef` を使う（再レンダリングを発生させないため）。

### コンテナに ref と onScroll を追加

```tsx
<div
  className="max-h-[420px] space-y-3 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-4"
  onScroll={() => {
    const el = containerRef.current;
    if (!el) return;
    // 40px の余裕を持たせる
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }}
  ref={containerRef}
>
  {messages.map(...)}
</div>
```

`<div ref={bottomRef} />` は不要になるため削除する。

### スクロールヘルパー（コンポーネント内に定義）

```tsx
function scrollToBottom() {
  const el = containerRef.current;
  if (!el || !isAtBottomRef.current) return;
  el.scrollTop = el.scrollHeight;
}
```

### ストリーミング中（delta 更新時）にスクロール

`setMessages` を呼ぶたびに `scrollToBottom()` を呼ぶ：

```tsx
if (data.delta) {
  assistantContent += data.delta;
  setMessages((previous) => {
    const next = [...previous];
    next[next.length - 1] = { content: assistantContent, role: "assistant" };
    return next;
  });
  scrollToBottom(); // 追加
}
```

### finally ブロックの scrollIntoView を削除

```tsx
} finally {
  setStreaming(false);
  // bottomRef.current?.scrollIntoView({ behavior: "smooth" }); ← 削除
  scrollToBottom(); // コンテナ内スクロールに変更
}
```

## 変更のポイント

- `scrollIntoView` をすべて排除し、ページスクロールを一切発生させない
- `isAtBottomRef`（ref）で追跡することでスクロールのたびに再レンダリングしない
- ストリーミング中も delta ごとにスクロール → レスポンス末尾が常に見える（最下部にいるとき）
- 手動でスクロールアップした瞬間に自動スクロールが止まる

## 完了の定義

- [ ] ストリーミング中にページ全体がスクロールしない
- [ ] ユーザーが最下部付近にいるとき、delta ごとにチャットコンテナ内が自動スクロールする
- [ ] ユーザーが手動でスクロールアップすると自動スクロールが止まる
- [ ] TypeScript エラーなし・`pnpm build` 通過
