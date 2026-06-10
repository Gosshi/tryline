# feat-ai-chat-free-question

## 背景

PMF 監査（2026-06-10）で「AI チャットの無料体験がゼロ。入力欄が disabled なだけで、何ができるかの実例がない。pricing のスクショだけでは弱い」と指摘された。

現状: 非 Premium ユーザーには `<MatchChatPanel disabled />` が Paywall の裏に表示されるだけで、AI チャットの価値を体験できない。

**方針**: ログイン済み非 Premium ユーザーに「1試合1問まで無料」で送信を許可し、実物を触らせる。合わせてサンプル Q&A（3例）を非 Premium ユーザーにも表示し、チャットの品質・用途を具体的に示す。

## スコープ

対象:
- `supabase/migrations/`: `chat_free_questions` テーブル追加
- `app/api/chat/[matchId]/route.ts`: 非 Premium ユーザーに 1 問許可
- `app/api/me/chat-free/[matchId]/route.ts`: 新規 — 無料質問使用済みかを返す
- `components/premium-match-chat.tsx`: 無料質問状態を取得し `MatchChat` に渡す
- `components/match-chat.tsx`: 非 Premium 向けの UI 分岐追加（1問許可 / 使用済み / サンプル Q&A 表示）

対象外:
- 未ログインユーザーへの無料質問（ログイン必須のまま）
- 無料問数の変更（1問が前提）

## データモデル変更

### 新テーブル `chat_free_questions`

```sql
create table if not exists chat_free_questions (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

alter table chat_free_questions enable row level security;

create policy "own chat free questions" on chat_free_questions
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

## API サーフェス

### 変更: `app/api/chat/[matchId]/route.ts`

現状の isPremium ハードゲート（L29-31）を以下のロジックに置き換える:

```typescript
const premium = await isPremium(user.id);

if (!premium) {
  const { data: freeUsage } = await supabase
    .from("chat_free_questions")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("match_id", matchId)
    .maybeSingle();

  if (freeUsage) {
    return Response.json({ error: "free_question_used" }, { status: 403 });
  }
}
```

ストリーム完了後（`done: true` 送信箇所）、非 Premium の場合に無料使用を記録する:

```typescript
if (!premium) {
  await supabase
    .from("chat_free_questions")
    .upsert({ match_id: matchId, user_id: user.id }, { ignoreDuplicates: true });
}
```

### 新規: `app/api/me/chat-free/[matchId]/route.ts`

```typescript
// GET: 指定 match でユーザーが無料質問を使用済みかを返す
// 未ログイン: { hasFreeQuestion: false }
// ログイン済み & 未使用: { hasFreeQuestion: true }
// ログイン済み & 使用済み: { hasFreeQuestion: false }
// Premium ユーザー: { hasFreeQuestion: true }（Premium は制限対象外）
```

## UI サーフェス

### `components/premium-match-chat.tsx`

`isPremium` に加えて `hasFreeQuestion` を `/api/me/chat-free/[matchId]` から取得し、`MatchChat` に渡す。

### `components/match-chat.tsx`

非 Premium の分岐（現状 `<Paywall> + <MatchChatPanel disabled>`）を以下に変更する:

| 状態 | 表示 |
|------|------|
| `isPremium` | 既存の MatchChatPanel（変更なし） |
| `!isPremium && hasFreeQuestion` | MatchChatPanel（有効）+「この試合1問まで無料」バッジ |
| `!isPremium && !hasFreeQuestion` | Paywall +「1問使用済み。続きは Premium で」メッセージ |

`free_question_used` (HTTP 403) を受信したら、フロントで Paywall に即時切り替える。

### サンプル Q&A

非 Premium ユーザーの試合ページで Paywall（または 1問許可チャット）の下にサンプル 3 件を表示する。
内容はコンポーネント内の静的テキストとして持つ（LLM 呼び出しなし）:

```
Q: この試合のターニングポイントになったプレーを教えて
A: 後半のトライと逆転の流れを含む、具体的な得点経緯と局面転換を説明します。
   実際の試合では「◯分のトライで〜」という形で回答します。

Q: 両チームのセットピース（スクラム・ラインアウト）の出来は？
A: スクラム・ラインアウトそれぞれの優劣と、それが試合結果にどう影響したかを
   具体的に説明します。

Q: 次節への示唆を踏まえて、この試合の意味を教えて
A: 今節の結果が順位・プレーオフレースに与える影響と、両チームへの示唆を
   まとめます。
```

Codex は上記の説明文をより自然な日本語の例示回答（汎用的・試合データを含まない）に整えること。

## 受け入れ条件

1. ログイン済み非 Premium ユーザーが試合チャット欄に質問を 1 回送信できる
2. 1 回送信後、同じ試合ではチャット欄が Paywall に切り替わる
3. `chat_free_questions` テーブルに `(user_id, match_id)` が記録される
4. 異なる試合では再び 1 問送信できる
5. Premium ユーザーは `chat_free_questions` に影響されず、既存の daily_limit ロジックを継続する
6. サンプル Q&A 3 件が非 Premium ユーザーの試合ページに表示される
7. 未ログインユーザーは既存どおり 401 で返し、ログイン促進メッセージが表示される
8. ビルド・TypeScript エラーなし

## 未解決の質問

なし。
