# Codex プロンプト: AI チャット無料1問解放

仕様: `specs/feat-ai-chat-free-question.md` を参照（内容はインライン展開しない）。

## タスク

ログイン済み非 Premium ユーザーに「1試合1問まで無料」でチャット送信を許可し、使用済み後は Paywall に切り替える。
合わせてサンプル Q&A（3件・静的テキスト）を非 Premium ユーザーにも表示する。

## 変更ファイルと内容

### 1) `supabase/migrations/<timestamp>_create_chat_free_questions.sql`（新規）

タイムスタンプは既存マイグレーションの最大値より大きい値を使うこと。

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

### 2) `app/api/chat/[matchId]/route.ts`（変更）

現状の isPremium ハードゲート（「非 Premium なら 403」の行）を以下のロジックに置き換える。

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

ストリーム完了後（`done: true` 送信箇所）の直後に、非 Premium の場合のみ使用を記録する:

```typescript
if (!premium) {
  await supabase
    .from("chat_free_questions")
    .upsert({ match_id: matchId, user_id: user.id }, { ignoreDuplicates: true });
}
```

### 3) `app/api/me/chat-free/[matchId]/route.ts`（新規）

```typescript
// GET: 指定 match でユーザーが無料質問を使用済みかを返す
// - 未ログイン: { hasFreeQuestion: false }
// - ログイン済み & 未使用: { hasFreeQuestion: true }
// - ログイン済み & 使用済み: { hasFreeQuestion: false }
// - Premium ユーザー: { hasFreeQuestion: true }（制限対象外）
```

### 4) `components/premium-match-chat.tsx`（変更）

`isPremium` に加えて `hasFreeQuestion` を `/api/me/chat-free/[matchId]` から取得し、`MatchChat` に渡す。

```typescript
const [isPremium, setIsPremium] = useState(false);
const [hasFreeQuestion, setHasFreeQuestion] = useState(false);

// useEffect で両エンドポイントを並行フェッチ
// /api/me/premium → isPremium
// /api/me/chat-free/${matchId} → hasFreeQuestion

return <MatchChat isPremium={isPremium} hasFreeQuestion={hasFreeQuestion} matchId={matchId} />;
```

### 5) `components/match-chat.tsx`（変更）

`MatchChatProps` に `hasFreeQuestion: boolean` を追加し、以下の UI 分岐を実装する。

| 状態 | 表示 |
|------|------|
| `isPremium` | 既存の MatchChatPanel（変更なし） |
| `!isPremium && hasFreeQuestion` | MatchChatPanel（有効）＋「この試合1問まで無料」バッジ |
| `!isPremium && !hasFreeQuestion` | Paywall ＋「1問使用済み。続きは Premium で」メッセージ |

`free_question_used`（HTTP 403）を受信したら、フロントで `hasFreeQuestion` を `false` に即時切り替える。

**サンプル Q&A（3件）を非 Premium ユーザーに表示する**

Paywall または 1問許可チャットの下に静的テキストとして表示（LLM 呼び出しなし）:

```tsx
const SAMPLE_QA = [
  {
    q: "この試合のターニングポイントになったプレーを教えて",
    a: "後半に生まれた逆転トライと、それを引き出した前半の戦術的な積み重ねを、スコアの流れと選手の動きを絡めて説明します。",
  },
  {
    q: "両チームのセットピース（スクラム・ラインアウト）の出来は？",
    a: "スクラムとラインアウトそれぞれの優劣と、それが試合のどの局面でどう影響したかを具体的に解説します。",
  },
  {
    q: "次節への示唆を踏まえて、この試合の意味を教えて",
    a: "今節の結果が順位争いやプレーオフレースに与える影響と、両チームが次に向けて修正すべき点をまとめます。",
  },
];
```

## 受け入れ条件（完了の定義）

- `pnpm build` 相当のビルド・TypeScript エラーなし。
- ログイン済み非 Premium ユーザーが試合チャット欄に質問を 1 回送信できる。
- 1 回送信後、同じ試合ではチャット欄が Paywall に切り替わる。
- `chat_free_questions` テーブルに `(user_id, match_id)` が記録される。
- 異なる試合では再び 1 問送信できる。
- Premium ユーザーは `chat_free_questions` に影響されず、既存の daily_limit ロジックを継続する。
- サンプル Q&A 3 件が非 Premium ユーザーの試合ページに表示される。
- 未ログインユーザーは既存どおり 401 を返す。

## エッジケース・注意事項

- `ignoreDuplicates: true` で upsert しているため、ストリーム完了前後に重複 INSERT しても安全。
- ストリーム途中で接続が切れた場合は記録されない（許容）。
- `/api/me/chat-free/[matchId]` のフェッチは `premium-match-chat.tsx` の useEffect で `isPremium` と並行して行う。

## 参考パターン

- `/api/me/premium` の既存ルート構造を `/api/me/chat-free/[matchId]` の雛形として使う。
- `components/premium-match-chat.tsx` の既存 isPremium フェッチパターンを hasFreeQuestion フェッチに倣う。
- 既存の `app/api/chat/[matchId]/route.ts` の isPremium チェック箇所（L29-31 付近）を置き換え対象として特定する。
