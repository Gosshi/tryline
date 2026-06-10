# Codex プロンプト: AI チャット匿名ユーザーバグ修正

仕様: `specs/fix-chat-free-question-anon-bug.md` を参照。

## タスク

未ログインユーザーが試合ページを開いたとき「1問使用済み。続きは Premium で」と誤表示されるバグを修正する。
あわせてページ表示直後のフラッシュ（ローディング中に "使用済み" が一瞬見える問題）も解消する。

## 変更ファイルと内容

### 1) `app/api/me/chat-free/[matchId]/route.ts`

`isLoggedIn: boolean` フィールドをすべてのレスポンスに追加する。

```typescript
// 未認証
return NextResponse.json({ hasFreeQuestion: false, isLoggedIn: false });

// Premium
return NextResponse.json({ hasFreeQuestion: true, isLoggedIn: true });

// 無料ユーザー
return NextResponse.json({ hasFreeQuestion: !data, isLoggedIn: true });
```

### 2) `components/premium-match-chat.tsx`

初期 state を `null`（ローディング）に変更し、`isLoggedIn` state を追加する。

```typescript
const [isPremium, setIsPremium] = useState<boolean | null>(null);
const [hasFreeQuestion, setHasFreeQuestion] = useState<boolean | null>(null);
const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
```

fetch の型アノテーションも更新:
```typescript
[
  { isPremium?: boolean },
  { hasFreeQuestion?: boolean | null; isLoggedIn?: boolean | null },
]
```

fetch 結果を set:
```typescript
setIsPremium(premiumData.isPremium ?? false);
setHasFreeQuestion(freeQuestionData.hasFreeQuestion ?? null);
setIsLoggedIn(freeQuestionData.isLoggedIn ?? null);
```

catch でエラー時は `null` のまま維持（`false` にしない）:
```typescript
.catch(() => ({ hasFreeQuestion: null as boolean | null, isLoggedIn: null as boolean | null }))
```

`MatchChat` に `isLoggedIn` を渡す:
```typescript
<MatchChat
  hasFreeQuestion={hasFreeQuestion}
  isLoggedIn={isLoggedIn}
  isPremium={isPremium}
  matchId={matchId}
/>
```

### 3) `components/match-chat.tsx`

`MatchChatProps` に `isLoggedIn: boolean | null` を追加し、型を更新:

```typescript
type MatchChatProps = {
  hasFreeQuestion: boolean | null;
  isLoggedIn: boolean | null;
  isPremium: boolean | null;
  matchId: string;
};
```

`useState` の初期値と `useEffect` も `boolean | null` 対応:
```typescript
const [hasFreeQuestion, setHasFreeQuestion] = useState<boolean | null>(
  initialHasFreeQuestion,
);
```

`MatchChat` の JSX 描画部分を以下のロジックに置き換える（既存の3分岐を5分岐に拡張）:

```typescript
// 1. Premium → フルチャット（変更なし）
isPremium ? (
  <MatchChatPanel matchId={matchId} />
// 2. ローディング → スケルトン（新規）
) : isPremium === null || hasFreeQuestion === null ? (
  <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
// 3. 未ログイン → ログインCTA（新規）
) : !isLoggedIn ? (
  <>
    <p className="mb-3 text-sm text-slate-600">
      ログインすると1問まで無料で試せます
    </p>
    <a
      className="inline-block rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
      href="/auth/login"
    >
      ログインして試す
    </a>
    {showSamples && <SampleQaList />}
  </>
// 4. 無料未使用 → 既存の free question UI（変更なし）
) : hasFreeQuestion ? (
  <>
    ...（既存コード）
  </>
// 5. 使用済み → 既存の paywall UI（変更なし）
) : (
  <>
    ...（既存コード）
  </>
)
```

## 完了の定義

- TypeScript strict エラーがない（`pnpm tsc --noEmit` が通る）
- `pnpm test` が通る
- 変更ファイル: 上記3ファイルのみ（マイグレーションなし）
