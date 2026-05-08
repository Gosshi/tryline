# p2-ai-chat-session-only: AI チャットをセッション完結型に変更

## 背景

現在の `app/api/chat/[matchId]/route.ts` はチャット履歴を `chat_sessions` / `chat_messages` テーブルに保存しているが、個人情報保護の観点からサーバー側での履歴保存を廃止する。

会話履歴はクライアントの React state のみで管理し、ページリロードで消える設計に変更する。

**このプロンプトは `specs/p2-ai-chat.md` の「セッション・メッセージの DB 保存」仕様を上書きする。**

---

## 変更対象

1. `app/api/chat/[matchId]/route.ts` — DB 保存ロジックを削除、会話履歴をリクエストボディで受け取る
2. `components/match-chat.tsx` — `sessionId` state を削除、会話履歴をリクエストに含める

変更しないもの:
- Premium ガード（`isPremium` チェック）
- 1 日あたりのメッセージ数制限（`chat_daily_count` / `DAILY_MESSAGE_LIMIT = 30`）
- SSE ストリーミング
- システムプロンプト組み立て（`assembleMatchContext`）

---

## Task 1 — API Route の変更

### ファイル: `app/api/chat/[matchId]/route.ts`

#### 削除するインポート

```ts
// 以下を削除
import {
  createChatSession,
  getChatMessages,
  getSessionTokenTotal,
  saveChatMessage,
} from "@/lib/db/queries/chat";
```

#### リクエストボディの変更

**変更前:**
```ts
const body = (await request.json()) as {
  message?: string;
  sessionId?: string;
};
const userMessage = body.message?.trim();
const sessionId = body.sessionId ?? (await createChatSession(matchId));
const totalTokens = await getSessionTokenTotal(sessionId);

if (totalTokens >= TOKEN_LIMIT) {
  return Response.json({ error: "token_limit_exceeded" }, { status: 429 });
}

const [history, systemPrompt] = await Promise.all([
  getChatMessages(sessionId),
  assembleMatchContext(matchId),
]);
```

**変更後:**
```ts
const body = (await request.json()) as {
  message?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};
const userMessage = body.message?.trim();
const history = body.history ?? [];

const systemPrompt = await assembleMatchContext(matchId);
```

`TOKEN_LIMIT` 定数は削除する。

#### OpenAI へ渡すメッセージリスト

```ts
const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "system", content: systemPrompt },
  ...history,
  { role: "user", content: userMessage! },
];
```

#### DB 保存ロジックの削除

ストリーミング完了後の `saveChatMessage` 呼び出しを削除し、`chat_daily_count` のインクリメントのみ残す:

```ts
// 残す
await supabase
  .from("user_profiles")
  .update({
    chat_daily_count: dailyCount + 1,
    updated_at: new Date().toISOString(),
  })
  .eq("id", user.id);

// 削除
// await saveChatMessage(sessionId, "user", userMessage, ...);
// await saveChatMessage(sessionId, "assistant", fullText, ...);
```

#### SSE の `done` イベント

**変更前:**
```ts
controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, sessionId })}\n\n`));
```

**変更後:**
```ts
controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
```

---

## Task 2 — `components/match-chat.tsx` の変更

#### `sessionId` state を削除

```ts
// 削除
const [sessionId, setSessionId] = useState<string | undefined>();
```

#### リクエストボディの変更

**変更前:**
```ts
body: JSON.stringify({ message, sessionId }),
```

**変更後:**
```ts
// messages は現在の state。末尾2件（今送ったuser + 空のassistant）を除く
body: JSON.stringify({
  message,
  history: messages
    .slice(0, -2)
    .map(({ role, content }) => ({ role, content })),
}),
```

#### `sessionId` 受け取り処理を削除

**変更前:**
```ts
if (data.done && data.sessionId) {
  setSessionId(data.sessionId);
}
```

**変更後:**
```ts
if (data.done) {
  // no-op
}
```

---

## Task 3 — 不要ファイルの確認

`lib/db/queries/chat.ts` が `createChatSession` / `getChatMessages` / `getSessionTokenTotal` / `saveChatMessage` のみを定義している場合は削除してよい。

削除前に `grep -r "from.*queries/chat"` で他からの参照がないことを確認すること。

**DB マイグレーションは不要。** `chat_sessions` / `chat_messages` テーブルは DROP せず放置する（Owner が別途判断）。

---

## 完了条件

- [ ] Premium ユーザーが試合ページでメッセージを送るとストリーミングで回答が返る
- [ ] 同一ページ滞在中は複数ターンの文脈が引き継がれる
- [ ] ページリロードで会話履歴がリセットされる（意図した動作）
- [ ] Free ユーザーには paywall が表示される（変更なし）
- [ ] 1 日 30 件の制限が引き続き機能する
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス

## 変更しないこと

- Premium チェック（`isPremium`）
- 1 日あたりのメッセージ数制限（`DAILY_MESSAGE_LIMIT = 30` と `chat_daily_count` カウント）
- SSE ストリーミングの仕組み
- システムプロンプト組み立て（`assembleMatchContext`）
- paywall UI（`components/paywall.tsx`）
