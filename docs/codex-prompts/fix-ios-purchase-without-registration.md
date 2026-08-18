# Codex 指示: iOS でログインなしに購入できるようにする（Guideline 5.1.1(v)）

> **2026-08-16 改稿。** 前版で実装を停止した判断は正しかった。指摘 3 点はすべて本番コードで裏が取れている。**方針を変えたので、前版の内容は破棄して本書に従うこと。**

## 仕様書

`specs/fix-ios-purchase-without-registration.md`（**全面改稿済み**）を読んでから着手すること。

## 前回停止した理由と、その解決

前回の指摘はすべて正しかった。

| 指摘 | 本方針での解決 |
|---|---|
| `PurchasesProvider.purchase()` も未ログインで例外を出す | **Supabase の匿名サインイン**で `session` を持たせるため例外にならない |
| `matchContent(id, accessToken)` は未認証で `locked` のまま | 匿名ユーザーの JWT で既存の認可経路がそのまま通る |
| `feat-ios-in-app-purchase.md` の「Supabase ユーザー ID で RevenueCat 識別」と両立しない | **その設計を維持する。** 匿名ユーザーも `user.id` を持つ |

**サーバー側に新しい認可 API は作らない。** クライアント側だけで解錠することもしない。Premium ゲートの不変条件は維持される。

## 中心となる変更

**購入ボタンが押された時点で Supabase の匿名サインインを行う。**

```
購入ボタン
  → session が無ければ匿名サインイン（ユーザーへの入力要求は一切なし）
  → logInRevenueCat(user.id)
  → purchase()
  → POST /api/v1/me/entitlement/sync（匿名ユーザーの accessToken で）
  → GET /api/v1/matches/[id]/content が locked: false を返す
  → 「メールを登録すると機種変更時や web でも使えます」の案内（スキップ可）
```

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `src/auth/AuthProvider.tsx` | セッション管理。**匿名セッションを永続化する場所** |
| `src/purchases/usePurchaseAction.ts:13-28` | `if (!session) router.push(...)` のガード |
| `src/purchases/PurchasesProvider.tsx` の `identifyCurrentUser` / `syncEntitlement` | いずれも `session` / `accessToken` 必須。**匿名セッションで通るようにする** |
| `src/purchases/SubscriptionPurchaseBlock.tsx:58` | 「ログインが必要です」の表示 |
| `app/(tabs)/settings.tsx` | 昇格導線と匿名状態の表示先 |

web 側（`tryline`）で参考に読むもの（**変更はしない**）:

| ファイル | 何を確認するか |
|---|---|
| `app/api/v1/matches/[id]/content/route.ts:37-50` | Premium ゲートの判定経路。匿名ユーザーでも通ることを理解する |
| `supabase/migrations/20260507100000_add_user_profiles.sql:18-30` | `handle_new_user()` トリガー。**匿名ユーザーにもプロファイルが自動作成される** |

## タイミングが重要

**アプリ起動時に匿名サインインしないこと。** 起動ごとに作ると `auth.users` が肥大する。無料コンテンツは現状どおり未ログインで読めるので、**購入という意思表示があるまで作らない。**

既にセッションがあれば（匿名・恒久どちらでも）新規作成しない。**再起動でセッションが作り直されないよう永続化すること。**

## 絶対にやってはいけないこと

1. **クライアント側だけで Premium を解錠しない。** 必ずサーバーの `premium_until` を経由する
2. **サーバー側に新規の認可 API を作らない。** 本方針では不要
3. **web 側リポジトリのコードを変更しない。** 唯一の例外は受け入れ条件 15 の RLS 検証で問題が見つかった場合で、その際は実装前に PR で報告すること
4. **`logInRevenueCat` を削除・変更しない**
5. **登録を実質的に強制する文言を書かない。** 「登録しないと購入内容が失われます」は却下の再発につながる
6. **スキップできない案内にしない**
7. **アプリ起動時に匿名サインインしない**（上記参照）
8. **ログイン済みユーザーの購入フローを壊さない**

## RLS の検証は diff で済ませない

受け入れ条件 15 は、**実際に匿名ユーザーの JWT でクエリを実行して確認する**こと。過去に「diff レビューだけでは RLS の穴を見落とし、本番監査で発覚した」事例がある。

- 自分の `profiles` 行が読める
- **他人の `profiles` 行が読めない**
- お気に入り・通知設定などが自分の行のみ操作できる

## テストで押さえる点

**「呼ばれないこと」と「二重に作らないこと」が核心。**

- 未ログインで `startPurchase` → `router.push("/auth/sign-in")` が**呼ばれない**
- 未ログインで `startPurchase` → 匿名サインインが呼ばれ、その後 `purchase()` が呼ばれる
- **既にセッションがある場合、匿名サインインが呼ばれない**
- ログイン済みの既存挙動が変わっていない

## Owner の事前作業（実装の前提）

**Supabase ダッシュボードで 2 つを有効化する必要がある**（受け入れ条件 20）。

- **Anonymous Sign-Ins** — 匿名ユーザーの作成
- **Manual Linking** — **恒久アカウントへの昇格に必要**（メール登録による昇格も含む）

**2026-08-16 の指摘を反映済み。** 初版は Manual Linking を落としており、Codex の停止判断は正しかった。公式ドキュメントで裏を取っている（[Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)「Converting an anonymous user to a permanent user … requires you to enable manual linking」）。

どちらかが無効だとテストが落ちる。**その場合は実装ミスと決めつけず Owner に確認すること。**

## RLS 検証はやらなくてよい（前版から変更）

前版の受け入れ条件 15 は「匿名 JWT で実際に RLS を検証する」だったが、**`AGENTS.md` の制約でこれは Codex には実行できない。指摘は正しい。**

**この検証は Claude Code が本番で実施済み**（2026-08-16、`pg_policies` 全件走査）。緩いポリシーは 1 件も無く、匿名サインインで新たに開く経路はないことを確認した。**Codex は RLS に触れる必要がない。**

## expo-router の型について

`router` 周辺を触る際に `as never` を使う必要が生じたら、`.expo/types/router.d.ts` を実際に開いて本当に必要か確認すること。過去に不要な `as never` が混入した経緯がある。

## 完了の定義

- `specs/fix-ios-purchase-without-registration.md` の受け入れ条件 1〜19 を満たす
- コード変更は `tryline-mobile` 内のみ（web 側は RLS 検証で問題が出た場合のみ、事前報告のうえ）
- 型チェックと既存テストが green
- **EAS ビルド・TestFlight 提出はしない。** Owner が手動で行う
- **Sandbox 実機確認（受け入れ条件 21〜23）はしない。** Owner が行う
- PR 本文に以下を書くこと:
  - 匿名サインインをどこで発火させたか
  - セッションをどう永続化したか
  - RLS 検証の結果（実行したクエリと結果）
  - 登録案内をモーダル / 画面内のどちらにしたかと理由
