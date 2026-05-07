# p2-premium-access-control: コンテンツ paywall + AI チャット日次上限

## 参照仕様書

`specs/p2-premium-access-control.md` を読んでから実装してください。

## 実装する機能

### 機能 A: recap/preview 300 字 paywall

**変更ファイルと手順:**

1. `app/matches/[id]/page.tsx`
   - `<MatchContentSection>` に `isPremium={premium}` prop を追加（2 箇所: preview と recap）

2. `components/match-content-section.tsx`
   - `MatchContentSectionProps` に `isPremium: boolean` を追加
   - `<MatchContent>` に `isPremium={isPremium}` を渡す

3. `components/match-content.tsx`
   - `MatchContentProps` に `isPremium: boolean` を追加
   - `isPremium=false` のとき:
     - 本文を冒頭 300 字で切る（マークダウンパース前に `content.contentMdJa.slice(0, 300)` でも可）
     - 目次（TOC nav）を非表示
     - 本文コンテナに `relative` を追加
     - 末尾グラデーション: `<div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent" />`
     - CTA:
       ```tsx
       <div className="mt-4 flex flex-col items-center gap-3 text-center">
         <p className="text-sm font-semibold text-slate-800">
           続きは Premium でご覧いただけます
         </p>
         <a
           className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
           href="/pricing"
         >
           Premium を始める - ¥980/月
         </a>
       </div>
       ```

### 機能 B: AI チャット日次メッセージ上限

**手順:**

1. マイグレーションファイルを新規作成
   - ファイル名: `supabase/migrations/20260507110000_add_chat_rate_limit.sql`
   ```sql
   alter table user_profiles
     add column if not exists chat_daily_count int not null default 0,
     add column if not exists chat_daily_reset_date date not null default current_date;
   ```

2. `app/api/chat/[matchId]/route.ts`
   - 定数: `const DAILY_MESSAGE_LIMIT = 30`
   - `isPremium` チェックの直後に以下を追加:
     ```ts
     const profile = await getUserProfile(user.id);
     const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
     const resetNeeded = !profile?.chat_daily_reset_date ||
       profile.chat_daily_reset_date < today;
     const dailyCount = resetNeeded ? 0 : (profile?.chat_daily_count ?? 0);

     if (resetNeeded) {
       await supabase
         .from("user_profiles")
         .update({ chat_daily_count: 0, chat_daily_reset_date: today, updated_at: new Date().toISOString() })
         .eq("id", user.id);
     }

     if (dailyCount >= DAILY_MESSAGE_LIMIT) {
       return Response.json({ error: "daily_limit_exceeded" }, { status: 429 });
     }
     ```
   - ストリーム完了後（`saveChatMessage` の後）にカウントをインクリメント:
     ```ts
     await supabase
       .from("user_profiles")
       .update({ chat_daily_count: dailyCount + 1, updated_at: new Date().toISOString() })
       .eq("id", user.id);
     ```
   - `getUserProfile` は `lib/auth/server.ts` に既存。import して使う

3. `components/match-chat.tsx`
   - `daily_limit_exceeded` エラー時のメッセージを追加:
     ```ts
     data.error === "token_limit_exceeded"
       ? "トークン上限に達しました。ページを更新して新しいセッションを開始してください。"
       : data.error === "daily_limit_exceeded"
         ? "1 日のメッセージ上限（30 件）に達しました。明日またご利用ください。"
         : "エラーが発生しました。"
     ```

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- ログアウト状態で試合ページを開くと recap/preview が 300 字 + フェードアウト + CTA になること
- Premium ログイン状態では全文が表示されること
- AI チャットで 30 件送信後に上限メッセージが表示されること

## ブランチ・PR

- ブランチ: `feat/premium-access-control`
- PR タイトル: `Feat: content paywall (300字) and AI chat daily limit`
