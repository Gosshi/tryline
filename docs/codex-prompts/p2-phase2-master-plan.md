# Phase 2 実装マスタープラン（Codex 向け指示）

## 基本ルール

各スペックを以下の手順で実装すること。

1. `main` から `feat/p2-<name>` ブランチを作成
2. スペックに従って実装
3. `pnpm tsc --noEmit` がパスすることを確認
4. `pnpm build` が成功することを確認
5. PR を作成する（PR タイトルは英語、本文に変更概要を記載）
6. **Owner が Supabase 作業を実施**（下記「Supabase 作業フロー」参照）
7. Owner が動作確認後マージ
8. 次のスペックに進む

スペックに「変更しないこと」セクションがある場合は厳守すること。

---

## Supabase 作業フロー

### マイグレーションがある PR（Step 4〜9）

Codex は `supabase/migrations/YYYYMMDD_<name>.sql` を PR に含める。
Owner は PR レビュー後、**マージ前に**以下を実行する:

```bash
# ローカル確認
supabase db push --local

# 本番反映
supabase db push
```

反映確認後にマージする。

### チームシードデータがある PR（Step 1〜3）

スキーマ変更はないが、`supabase/seed/teams-<name>.sql` を DB に流す必要がある。
Owner は PR マージ後に以下を実行する:

```bash
# 本番 Supabase の SQL エディタで seed ファイルを実行
# または psql で流す
psql "$DATABASE_URL" -f supabase/seed/teams-<name>.sql
```

その後、インポートスクリプトを実行する:

```bash
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/import-<competition>-results.ts 2025
```

### 各ステップのマイグレーション内容まとめ

| Step | 種別 | 内容 |
|---|---|---|
| 1-1〜3-2 | seed SQL | チームデータ挿入（スキーマ変更なし）|
| 4 Auth | migration | `user_profiles` テーブル新規作成 + RLS + trigger |
| 5 Stripe | migration | `user_profiles` に Stripe カラム追加 |
| 6 AI Chat | migration | `chat_sessions`, `chat_messages` テーブル新規作成 + RLS |
| 7 Push | migration | `push_subscriptions` テーブル新規作成 + RLS |
| 8 お気に入り | migration | `user_profiles` に `favorite_team_slugs text[]` 追加 |
| 9 RWC | migration | `competition_pools` テーブル新規作成 |

---

## 実施順序

### Step 1 — 競技拡張・国際試合（Priority A）

**スペック**: `specs/p2-multi-competition.md`

競技ごとに PR を分割して実装する。

#### PR 1-1: 国際チームシードデータ + team-identity 追加
- ブランチ: `feat/p2-teams-international`
- 対象: `new-zealand`, `south-africa`, `australia`, `argentina`, `fiji`, `samoa`, `tonga`, `japan`, `usa`, `canada`, `georgia`, `uruguay`, `namibia`, `portugal`, `spain`, `romania`
- `supabase/seed/teams-international.sql` 作成
- `lib/format/team-identity.ts` に TEAM_FLAGS / TEAM_IDENTITY / TEAM_STRIPES 追加（国旗は国コード絵文字）

#### PR 1-2: Rugby Championship
- ブランチ: `feat/p2-rugby-championship`
- `lib/scrapers/wikipedia-rugby-championship-results.ts` 作成
- `scripts/import-rugby-championship-results.ts` 作成（`import-six-nations-results.ts` と同構造）
- family slug: `rugby-championship`, シーズン形式: `"2025"`

#### PR 1-3: Autumn Nations Series
- ブランチ: `feat/p2-autumn-nations`
- `lib/scrapers/wikipedia-autumn-nations-results.ts` 作成
- `scripts/import-autumn-nations-results.ts` 作成
- family slug: `autumn-nations`, シーズン形式: `"2025"`

#### PR 1-4: Pacific Nations Cup
- ブランチ: `feat/p2-pacific-nations-cup`
- `lib/scrapers/wikipedia-pacific-nations-cup-results.ts` 作成
- `scripts/import-pacific-nations-cup-results.ts` 作成
- family slug: `pacific-nations-cup`, シーズン形式: `"2025"`

---

### Step 2 — 競技拡張・ヨーロッパリーグ（Priority B）

#### PR 2-1: Premiership チームシードデータ + team-identity 追加
- ブランチ: `feat/p2-teams-premiership`
- `supabase/seed/teams-premiership.sql` 作成
- チーム: `bath`, `bristol-bears`, `exeter-chiefs`, `gloucester`, `harlequins`, `leicester-tigers`, `newcastle-falcons`, `northampton-saints`, `sale-sharks`, `saracens`
- `lib/format/team-identity.ts` に追加（クラブはプライマリカラー単色、縞なし）

#### PR 2-2: Premiership スクレイパー + インポートスクリプト
- ブランチ: `feat/p2-premiership`
- **対象: プレーオフのみ**（SF・決勝・入替戦 計 5〜6 試合）
- 通常シーズン全試合の一覧ページが Wikipedia に存在しないため
- Wikipedia ページ `2024-25_Premiership_Rugby_season` のプレーオフセクションをスクレイプ
- `lib/scrapers/wikipedia-premiership-results.ts` 作成
- `scripts/import-premiership-results.ts` 作成
- family slug: `premiership`, シーズン形式: `"2024-25"`

#### PR 2-3: Top 14
- ブランチ: `feat/p2-top-14`
- **対象: プレーオフのみ**（SF・決勝・入替戦 計 5〜6 試合）
- 通常シーズン 182 試合の一覧ページが Wikipedia に存在しないため
- Wikipedia ページ `2024-25_Top_14_season` のプレーオフセクションをスクレイプ
- `supabase/seed/teams-top-14.sql` 作成
- チーム: `bordeaux-begles`, `clermont`, `la-rochelle`, `lyon`, `montpellier`, `pau`, `racing-92`, `stade-francais`, `toulouse`, `toulon`, `perpignan`, `castres`, `bayonne`, `vannes`
- `lib/scrapers/wikipedia-top-14-results.ts` 作成
- `scripts/import-top-14-results.ts` 作成
- family slug: `top-14`, シーズン形式: `"2024-25"`

#### PR 2-4: URC（United Rugby Championship）
- ブランチ: `feat/p2-urc`
- **対象: プレーオフのみ**（QF・SF・決勝 計 7〜8 試合）
- Wikipedia ページ `2024-25_United_Rugby_Championship` のプレーオフセクションをスクレイプ
- `supabase/seed/teams-urc.sql` 作成
- チーム: `leinster`, `munster`, `connacht`, `ulster`, `glasgow-warriors`, `edinburgh`, `cardiff`, `ospreys`, `scarlets`, `dragons`, `benetton`, `zebre`, `bulls`, `lions`, `sharks`, `stormers`
- `lib/scrapers/wikipedia-urc-results.ts` 作成
- `scripts/import-urc-results.ts` 作成
- family slug: `urc`, シーズン形式: `"2024-25"`

---

### Step 3 — 競技拡張・南半球・日本（Priority C）

#### PR 3-1: Super Rugby Pacific
- ブランチ: `feat/p2-super-rugby-pacific`
- `supabase/seed/teams-super-rugby-pacific.sql` 作成
- チーム: `blues`, `chiefs`, `crusaders`, `highlanders`, `hurricanes`, `brumbies`, `force`, `reds`, `rebels`, `waratahs`, `fijian-drua`, `moana-pasifika`
- `lib/scrapers/wikipedia-super-rugby-pacific-results.ts` 作成
- `scripts/import-super-rugby-pacific-results.ts` 作成
- family slug: `super-rugby-pacific`, シーズン形式: `"2025"`

#### PR 3-2: Japan League One（Division 1）
- ブランチ: `feat/p2-league-one`
- **対象: プレーオフ・決勝のみ**（Wikipedia に全試合一覧なし。European 国内リーグと同方針）
- Wikipedia ページ `2024-25_Japan_Rugby_League_One_–_Division_1` のプレーオフ・決勝セクションをスクレイプ
- `supabase/seed/teams-league-one.sql` 作成（チーム名は英語表記をメインに）
- チーム（2024-25 D1 実参加）: `saitama-wild-knights`, `kubota-spears`, `toyota-verblitz`, `tokyo-suntory-sungoliath`, `kobelco-kobe-steelers`, `toshiba-brave-lupus`, `ntt-black-storms`, `canon-eagles`, `mitsubishi-dynaboars`, `ricoh-black-rams`, `shizuoka-blue-revs`, `honda-heat`
- ※ `red-hurricanes-osaka`, `shimizu-blue-sharks`, `urayasu-d-rocks` は 2024-25 は D2 のため除外
- `lib/scrapers/wikipedia-league-one-results.ts` 作成
- `scripts/import-league-one-results.ts` 作成
- family slug: `league-one`, シーズン形式: `"2024-25"`

---

### Step 4 — ユーザー認証

**スペック**: `specs/p2-auth.md`

- ブランチ: `feat/p2-auth`
- Supabase マイグレーション: `user_profiles` テーブル + RLS + `handle_new_user` trigger
- `app/auth/callback/route.ts` 作成
- `lib/auth/server.ts`, `lib/auth/client.ts` 作成
- `components/auth-modal.tsx`, `components/user-menu.tsx` 作成
- `components/site-header.tsx` にユーザーメニュー追加

---

### Step 5 — Stripe 課金

**スペック**: `specs/p2-stripe-subscription.md`

- ブランチ: `feat/p2-stripe`
- Supabase マイグレーション: `user_profiles` に Stripe カラム追加
- `app/api/stripe/checkout/route.ts` 作成
- `app/api/stripe/webhook/route.ts` 作成（署名検証必須）
- `app/api/stripe/portal/route.ts` 作成
- `app/pricing/page.tsx` 作成
- `components/paywall.tsx` 作成
- 環境変数: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PREMIUM_PRICE_ID`

---

### Step 6 — AI チャット

**スペック**: `specs/p2-ai-chat.md`

- ブランチ: `feat/p2-ai-chat`
- Supabase マイグレーション: `chat_sessions`, `chat_messages` テーブル + RLS
- `app/api/chat/[matchId]/route.ts` 作成（SSE streaming）
- `components/match-chat.tsx` 作成
- `app/matches/[id]/page.tsx` に `<MatchChat />` 追加（Free ユーザーは paywall）

---

### Step 7 — プッシュ通知

**スペック**: `specs/p2-push-notifications.md`

- ブランチ: `feat/p2-push-notifications`
- Supabase マイグレーション: `push_subscriptions` テーブル + RLS
- `public/sw.js` 作成（Service Worker）
- `app/api/push/subscribe/route.ts`, `unsubscribe/route.ts`, `send/route.ts` 作成
- `components/notification-settings.tsx` 作成
- 環境変数: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

---

### Step 8 — お気に入りチーム

**スペック**: `specs/p2-favorite-teams.md`

- ブランチ: `feat/p2-favorite-teams`
- Supabase マイグレーション: `user_profiles` に `favorite_team_slugs text[]` 追加
- `app/api/user/profile/route.ts` 作成（PATCH）
- `components/team-picker.tsx` 作成
- トップページにお気に入りチームの試合をピン表示
- 未設定ユーザーへの登録バナー追加

---

### Step 9 — RWC 2027（2027 Q2 以降に着手）

**スペック**: `specs/p2-rwc-2027.md`

- ブランチ: `feat/p2-rwc-2027`
- RWC 出場全チームのシードデータ追加
- Supabase マイグレーション: `competition_pools` テーブル追加
- `app/c/rwc/2027/bracket/page.tsx` 作成
- `components/knockout-bracket.tsx` 作成

---

## 各 PR 共通チェックリスト

- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` 成功
- [ ] PR の説明に変更内容・動作確認方法を記載
- [ ] secrets / credentials がコードに含まれていない
- [ ] 新規テーブルには RLS が設定されている
- [ ] `import-six-nations-results.ts` と同じパターンで実装されている（Step 1〜3）
