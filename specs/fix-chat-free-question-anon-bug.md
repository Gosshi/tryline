# fix-chat-free-question-anon-bug

## 背景

`feat-ai-chat-free-question`（#401）実装後、未ログインで試合ページを開くと「1問使用済み。続きは Premium で」が表示される本番バグが確認されている。

原因は2点:
1. `PremiumMatchChat` の初期 state が `hasFreeQuestion=false` → fetch 完了前（ローディング中）も "使用済み" 扱いになる
2. `/api/me/chat-free/[matchId]` が未認証時に `{ hasFreeQuestion: false }` を返す → ログイン済みで使用済みのレスポンスと区別できない

加えて fetch 失敗時の `catch(() => ({}))` が `hasFreeQuestion: undefined → false` にフォールバックするため、DBエラーでも誤表示が起きる。

## スコープ

対象:
- `app/api/me/chat-free/[matchId]/route.ts`: レスポンスに `isLoggedIn: boolean` を追加
- `components/premium-match-chat.tsx`: 初期 state を `null`（ローディング）に変更
- `components/match-chat.tsx`: ローディング状態・未ログイン状態の描画を追加

対象外:
- Premium API (`/api/me/premium`) の変更
- チャット送信ロジック (`/api/chat/[matchId]/route.ts`) の変更
- UIデザインの変更（既存の Paywall コンポーネントを流用）

## API サーフェス

### GET `/api/me/chat-free/[matchId]`

レスポンス型変更:

```typescript
// Before
{ hasFreeQuestion: boolean }

// After
{ hasFreeQuestion: boolean; isLoggedIn: boolean }
```

| ケース | hasFreeQuestion | isLoggedIn |
|--------|-----------------|------------|
| 未認証 | false | false |
| Premium ユーザー | true | true |
| 無料ユーザー（未使用） | true | true |
| 無料ユーザー（使用済み） | false | true |

## 変更詳細

### 1. `app/api/me/chat-free/[matchId]/route.ts`

```typescript
// 未認証の場合
if (!user) {
  return NextResponse.json({ hasFreeQuestion: false, isLoggedIn: false });
}

// Premium の場合
if (premium) {
  return NextResponse.json({ hasFreeQuestion: true, isLoggedIn: true });
}

// 無料ユーザー
return NextResponse.json({ hasFreeQuestion: !data, isLoggedIn: true });
```

### 2. `components/premium-match-chat.tsx`

state の初期値を `null`（ローディング）に変更:

```typescript
const [isPremium, setIsPremium] = useState<boolean | null>(null);
const [hasFreeQuestion, setHasFreeQuestion] = useState<boolean | null>(null);
const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
```

fetch 完了後に set:
```typescript
setIsPremium(premiumData.isPremium ?? false);
setHasFreeQuestion(freeQuestionData.hasFreeQuestion ?? null);
setIsLoggedIn(freeQuestionData.isLoggedIn ?? null);
```

catch はエラー時も `null` を維持（フォールバックで `false` にしない）:
```typescript
.catch(() => ({ hasFreeQuestion: null, isLoggedIn: null }))
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

### 3. `components/match-chat.tsx`

`MatchChatProps` に `isLoggedIn` を追加:

```typescript
type MatchChatProps = {
  hasFreeQuestion: boolean | null;
  isLoggedIn: boolean | null;
  isPremium: boolean | null;
  matchId: string;
};
```

描画ロジック（優先順位順）:

```typescript
// 1. Premium → フルチャット
if (isPremium) {
  return <MatchChatPanel matchId={matchId} />;
}

// 2. ローディング（null の間）→ スケルトン
if (isPremium === null || hasFreeQuestion === null) {
  return <div className="h-32 animate-pulse rounded-lg bg-slate-100" />;
}

// 3. 未ログイン → ログインCTA + サンプル
if (!isLoggedIn) {
  return (
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
      <SampleQaList />
    </>
  );
}

// 4. ログイン済み・未使用 → 無料チャット
if (hasFreeQuestion) {
  return (
    <>
      <div className="mb-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        この試合1問まで無料
      </div>
      <MatchChatPanel
        matchId={matchId}
        onFreeQuestionUsed={() => setHasFreeQuestion(false)}
      />
      <SampleQaList />
    </>
  );
}

// 5. ログイン済み・使用済み → ペイウォール
return (
  <>
    <p className="mb-3 text-sm font-semibold text-slate-700">
      1問使用済み。続きは Premium で
    </p>
    <Paywall isPremium={false}>
      <MatchChatPanel disabled matchId={matchId} />
    </Paywall>
    <SampleQaList />
  </>
);
```

`useEffect` での `initialHasFreeQuestion` 同期も `null` 対応:
```typescript
const [hasFreeQuestion, setHasFreeQuestion] = useState<boolean | null>(
  initialHasFreeQuestion,
);
```

## 受け入れ条件

1. 未ログインで `/matches/:id` を開くと「ログインすると1問まで無料で試せます」＋ログインリンクが表示される（「1問使用済み」は表示されない）
2. ログイン済み・未使用ユーザーで開くとチャット入力欄が使える
3. ログイン済み・使用済みユーザーで開くと「1問使用済み。続きは Premium で」が表示される
4. Premium ユーザーで開くとフルチャットが使える
5. ページ表示直後（fetch 完了前）はローディングスケルトンが表示され、「1問使用済み」は表示されない
6. TypeScript strict エラーなし

## 未解決の質問

なし（実装開始可能）
