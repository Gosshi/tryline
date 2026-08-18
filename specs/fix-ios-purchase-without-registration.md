# iOS: ログインなしで購入できるようにする（Guideline 5.1.1(v) 対応）

> **2026-08-16 全面改稿。** 初版は「RevenueCat の匿名 App User ID で購入し、mobile 側だけを変更する」内容だったが、**Codex が実装中に矛盾を指摘して停止し、その指摘が正しいことを本番コードで確認した**ため方針を変更した。経緯は「初版が破綻した理由」参照。

## 背景

2026-08-15、App Store 審査でビルド 34 が **Guideline 5.1.1(v) - Legal - Data Collection and Storage** により却下された（Submission ID: `de177c19-d41a-4d2e-9135-a815f75d47a3`、レビュー端末 iPad Air 11-inch (M3)）。**4 回目の却下であり、iOS 公開（9 月目標）の唯一のブロッカー。**

> We noticed that the app requires users to register with personal information to purchase In-App Purchase products that are not account based.

指摘は正当で、`tryline-mobile/src/purchases/usePurchaseAction.ts:15-18` が未ログイン時に購入を中断してサインイン画面へ飛ばしている。

### 初版が破綻した理由

初版は「購入前のガードを外すだけ」としたが、**購入フロー全体とサーバー側の認可がログイン前提で組まれている**ことを見落としていた。本番コードで確認した事実:

| 箇所 | 実際の挙動 |
|---|---|
| `PurchasesProvider.tsx` `identifyCurrentUser` | `session?.user?.id` が無いと **throw** |
| `PurchasesProvider.tsx` `syncEntitlement` | `accessToken` が無いと **throw** |
| `app/api/v1/matches/[id]/content/route.ts:37-50` | Bearer → `getMobileUserProfile` → `premium_until` で判定。**user が無ければ必ず `locked`** |
| `specs/feat-ios-in-app-purchase.md` | 「購入前にログインし、Supabase ユーザー ID で RevenueCat を識別する」設計 |

つまり **RevenueCat の匿名 ID だけで購入しても、サーバーは本文を返さない。** クライアント側だけで解錠すれば Premium ゲートの不変条件を破ることになる。Codex が実装を止めたのは妥当な判断だった。

### 「購入後にログインすれば読める」では通らない

却下文にこう明記されている。

> although guideline 5.1.1 requires an app to make subscription content available to all the supported devices owned by a single user, **it is not appropriate to force user registration to meet this requirement**

**Apple は「アカウント同期を理由に登録を強制するな」と先回りして否定している。** 同じ理由で「Premium はアカウントベース機能だ」という反論も成立しにくい。求められているのは **登録せずに購入し、そのまま使える状態**である。

## 方針: Supabase の匿名サインインを使う

**ユーザーには何も入力させずに `session` と `user.id` を持たせる。** これにより上記の矛盾がすべて解消し、サーバー側に新しい認可経路を作る必要がなくなる。

| Codex の指摘 | 本方針での解決 |
|---|---|
| `purchase()` が未ログインで例外 | `session` が存在するため例外にならない |
| 未認証では `locked` のまま | 匿名ユーザーの JWT で既存の認可経路がそのまま通る |
| 既存 spec の「Supabase ユーザー ID で RevenueCat 識別」と両立しない | **その設計を変えずに維持できる** |

### なぜ Apple の要求を満たすか

匿名サインインは**個人情報を一切要求せず、UI にも登場しない**。ユーザーから見れば「登録せずに購入できる」状態そのものである。

### 後からの昇格で ID が変わらない

Supabase の匿名ユーザーは `supabase.auth.updateUser({ email })` によりメール確認を経て恒久アカウントへ昇格し、**`user.id` は保持される**。したがって:

- RevenueCat の識別子（`Purchases.logIn(user.id)`）が変わらない
- **`TRANSFER` による権利移管が発生しない**
- `premium_until` を持つ `profiles` 行がそのまま引き継がれる

### プロファイルは自動作成される

`supabase/migrations/20260507100000_add_user_profiles.sql:18-30` の `handle_new_user()` トリガーが `auth.users` への insert で発火する。**匿名ユーザーにもプロファイル行が作られる**ため、`premium_until` の書き込み先が存在する。

## スコープ

対象（`tryline-mobile`）:
- 匿名サインインの導入（`src/auth/AuthProvider.tsx` 相当）
- `src/purchases/usePurchaseAction.ts` — 未ログイン時の `router.push("/auth/sign-in")` を廃止
- `src/purchases/PurchasesProvider.tsx` — `identifyCurrentUser` / `syncEntitlement` が匿名セッションで動くこと
- `src/purchases/SubscriptionPurchaseBlock.tsx` — 「ログインが必要です」の削除
- 購入後の任意の登録案内、および匿名アカウントの昇格導線
- 上記に対応するテスト

対象（`tryline` / web）:
- **コード変更は原則不要**（既存の Bearer → プロファイル → `premium_until` 経路がそのまま機能するため）
- ただし **RLS ポリシーが匿名ユーザーで正しく動くことの検証**が必要（受け入れ条件参照）。問題があった場合のみ最小限の修正を行う

対象外:
- サーバー側の新規認可 API の設計（**本方針では不要になった**）
- RevenueCat ダッシュボードの設定変更
- `app/api/revenuecat/webhook/route.ts` の変更
- `app/api/v1/me/entitlement/sync/route.ts` のロジック変更
- ログイン済みユーザーの購入フロー（現状のまま動くこと）
- 価格・商品構成・サブスク開示文言（`fix-ios-subscription-disclosure.md` の範囲）

## データモデル変更

**なし。** 匿名ユーザーも `auth.users` の 1 行として作られ、既存トリガーが `profiles` を作る。列は既存のまま（`premium_until` 等）。

## API サーフェス

**新規ルートなし。** 既存の `POST /api/v1/me/entitlement/sync` と `GET /api/v1/matches/[id]/content` を、匿名ユーザーの JWT で呼ぶ。

## UI サーフェス

### 匿名サインインのタイミング

**購入ボタンが押された時点で行う。** アプリ起動時ではない。

理由: 起動ごとに匿名ユーザーを作ると `auth.users` が急速に肥大する。無料コンテンツの閲覧に session は不要（現状も未ログインで読める）ため、**購入という意思表示があるまで作らない。**

既にセッションがある場合（匿名・恒久いずれも）は新規作成しない。**セッションは端末に永続化し、再起動で作り直さないこと。**

### 購入ボタン

- 未ログインでも押せる。「Premium への登録にはログインが必要です。」を削除する

### 購入完了後の登録案内

購入成功後に**任意**の案内を表示する。要件:

1. **スキップできること。** 閉じる／後で、が明確に選べる
2. **登録の利点を説明すること。** 「メールアドレスを登録すると、機種変更時や web でも Premium をご利用いただけます」に相当する内容
3. **後からいつでも登録できること。** 設定画面から同じ導線に到達できる

**「登録しないと購入内容が失われます」等、登録を事実上強制する文言は書かないこと。** 却下の再発につながる。

### 匿名状態の可視化

設定画面で、**現在が匿名アカウントであること**と、登録した場合の利点が分かるようにする。ユーザーが「機種変更したらどうなるか」を判断できることが目的。

## LLM 連携

**なし。** 追加コストはゼロ。

## 受け入れ条件

### 匿名サインイン

1. 未ログイン状態で購入ボタンを押すと、**サインイン画面へ遷移せず**、匿名サインインが行われたうえで購入フローが開始される
2. 匿名サインインの過程で、ユーザーに入力を求める画面が**一切表示されない**
3. アプリを再起動しても匿名セッションが保持され、**新しい匿名ユーザーが作られない**
4. アプリ起動しただけでは匿名ユーザーが作られない（購入操作が起点であること）

### 購入と権利反映

5. 匿名ユーザーで購入が完了し、`logInRevenueCat(user.id)` が呼ばれる
6. 購入後に `POST /api/v1/me/entitlement/sync` が匿名ユーザーの accessToken で成功する
7. 同期後、`GET /api/v1/matches/[id]/content` が `locked: false` を返し、**Premium 本文が読める**
8. ログイン済みユーザーの購入フローが従来どおり動作する（回帰なし）

### 昇格

9. 匿名アカウントからメールアドレスを登録でき、昇格後も **`user.id` が変わらない**
10. 昇格後、Premium 権利（`premium_until`）が維持される
11. 昇格の導線が設定画面から到達できる

### 登録案内

12. 購入成功後に登録案内が表示され、**スキップできる**
13. スキップしても Premium が利用できる
14. 案内に**登録を強制する文言・購入内容が失われるという表現が含まれていない**

### RLS の検証（Codex のタスクではない）

15. **この検証は Claude Code が本番で実施済みのため、Codex は実施しない。** 環境ファイルや別リポジトリの RLS 定義へのアクセスは `AGENTS.md` で禁止されており、Codex の権限を超える。

    **2026-08-16 の確認結果**: `pg_policies` を全件走査し、`auth.uid()` を使わないポリシー 21 件を目視確認した。**「`authenticated` ロールなら許可」という緩いポリシーは 1 件も存在しない。** 該当した 21 件はすべて元から `anon`（未認証）にも開いている公開データ（`competitions` / `matches` / `teams` / `players` / `match_events` 等）であり、匿名サインインの有効化で新たに開く経路はない。`profiles` を含む本人確認が必要なテーブルは `auth.uid()` で自分の行に限定されている。

    **既存の別問題として、`chat_sessions` / `chat_messages` が `public` ロールで `using = true`（誰でも全件読める）であることを発見した。これは匿名サインインとは無関係の既存の問題**であり、別 spec で対処する。本 spec のブロッカーではない。

### テスト

16. 未ログイン時に `startPurchase` を呼んでも `router.push("/auth/sign-in")` が**呼ばれない**
17. 未ログイン時に匿名サインインが呼ばれ、その後 `purchase()` が呼ばれる
18. 既にセッションがある場合、匿名サインインが**呼ばれない**
19. 型チェックと既存テストが通る

### Owner の事前作業（実装前に必要）

20. **Supabase ダッシュボードで以下の 2 つを有効化する。** どちらか一方でも無効だと実装が完了しない。
    - **Anonymous Sign-Ins** — 匿名ユーザーの作成に必要
    - **Manual Linking** — **匿名ユーザーを恒久アカウントへ昇格させるために必要**（受け入れ条件 9〜11 の前提）

    公式ドキュメントに明記されている（[Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)）:

    > Converting an anonymous user to a permanent user requires linking an identity to the user. **This requires you to enable manual linking in your Supabase project.**

    **メール登録（`updateUser({ email })`）による昇格も Manual Linking が前提である。** 初版はこの前提を落としており、2026-08-16 に Codex が実装を停止して指摘した。指摘は正しい。

### 審査提出前の確認（Owner が実施）

21. **Sandbox で、一度もログイン画面を見ずに購入が完了し、Premium 本文が読めることを実機確認する。** 却下理由そのものなので必ず通しで検証する
22. 匿名購入 → メール登録 → web でも Premium が有効になることを確認する
23. 審査メモに「購入に登録は不要である」旨を明記する

## 公式ドキュメントで確認した運用上の注意（2026-08-16）

出典: [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)

**1. レート制限は既定で IP あたり 30 リクエスト/時。** CAPTCHA（invisible CAPTCHA / Cloudflare Turnstile）の有効化が「strongly recommended」とされている。**本 spec では CAPTCHA を導入しない**（購入操作を起点にするため正常利用では増えず、購入前に人間確認を挟むと Apple の要求と衝突するため）。ただし**これは公式推奨より緩い判断であることを明示しておく。** `auth.users` の件数を監視し、増加が見られたら導入を再検討する。

  **ベースライン（2026-08-16 実測）**: 全ユーザー 5 人、うち匿名 0 人。

**2. 匿名ユーザーの自動クリーンアップは提供されていない。** 公式は SQL での削除を案内している。

```sql
-- 30日以上前に作られた匿名ユーザーを削除
delete from auth.users
where is_anonymous is true and created_at < now() - interval '30 days';
```

**本 spec では実装しない。** ただし「購入せずに残った匿名アカウント」が溜まった場合の掃除手段として記録しておく。**実行する場合は購入済みユーザーを消さないよう条件を精査すること**（上記 SQL は購入の有無を見ていない）。

**3. Next.js の静的レンダリングで匿名ユーザーのメタデータがキャッシュされる報告がある。** 公式が dynamic rendering を推奨している。**本 spec では匿名サインインを mobile 側でのみ使うため直接の影響はない**が、将来 web 側に導入する場合は注意が必要。

## 未解決の質問

1. **匿名ユーザーの増加をどう抑えるか。** 購入操作を起点にすることで大半は防げるが、購入を途中でやめたユーザーの匿名アカウントは残る。上記の削除 SQL を定期実行するかは、実際に溜まってから判断する。**本 spec では実装しない**
2. **アプリ削除・再インストール時の扱い。** 匿名セッションは失われるため、新しい匿名ユーザーになる。RevenueCat の「購入を復元」で Apple ID 経由の復元は可能だが、その際に新匿名 ID へ `TRANSFER` が発生する。**この経路の実機確認が必要**（受け入れ条件 21・22 と合わせて Owner が実施）。ここは「だから登録を勧める」という案内の根拠にもなる
3. Supabase の匿名ユーザーが MAU 課金に与える影響。現在の実ユーザーは 28 日で 189 人規模のため当面問題にならないと見込むが、想定外の増加があれば再検討する
4. **登録案内をモーダルで出すか画面内に出すか。** Codex の判断でよいが、スキップの明確さを優先する。判断した形を PR 本文に書くこと
5. 今回の却下は iPad Air でレビューされている。再提出前に iPad サイズでの購入フロー表示を確認しておくとよい（本 spec のスコープ外だが実務上重要）
