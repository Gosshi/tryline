# iOS: StoreKit 設定ファイルで課金 UI をローカル検証できるようにする

## 背景

2026-08-13、`fix-ios-subscription-disclosure`（PR #62）で実装したサブスクリプション必須表示を Simulator で確認しようとして、**一度も描画できなかった。**

必須表示は次の条件でのみ出る。

```tsx
{!me?.isPremium && isPurchaseAvailable && currentPackage ? <SubscriptionPurchaseBlock .../> : null}
```

ローカルでは両方とも満たせない。

| 条件 | ローカルの状態 |
|---|---|
| `isPurchaseAvailable` | `.env` が存在せず `EXPO_PUBLIC_REVENUECAT_IOS_KEY` が空 → `isRevenueCatAvailable()` が false |
| `currentPackage` | **`.storekit` 設定ファイルが無く、Simulator は App Store から商品を取得できない** → `getOfferings()` が空 |

実際に iPad Air 11-inch (M3) Simulator で設定画面を開いたところ、Premium カードには「契約状況の確認にはログインが必要です。」と「サブスクリプションを管理」しか出ず、**必須表示も購入ボタンも描画されなかった。**

### なぜ問題か

**App Store の審査を止めている UI を、ローカルで一度も目視できない。** 今回の 3.1.2(c) は「アプリ内に情報が無い」という指摘で、直し方が正しくても**実際に描画されるかを確認する手段が TestFlight しかない**。1往復ごとに EAS ビルドと審査待ちが発生する。

さらに、**描画されない原因がコード側とは限らない**。前回のサイクルでは RevenueCat の `default` offering の `$rc_monthly` に Test Store の商品しか入っておらず、購入 CTA が出ない状態だった。**コードの問題か設定の問題かをローカルで切り分けられない。**

## スコープ

対象:
- **StoreKit 設定ファイル**（`.storekit`）を追加し、Simulator で商品が解決できるようにする
- `expo prebuild` で消えないように**ローカル config plugin** で Xcode scheme に紐付ける
- `.env.example` と実行手順の追記

対象外:
- 課金ロジック・RevenueCat 連携・必須表示コンポーネントの変更（PR #62 でマージ済み。**触らない**）
- 実際の購入完了・レシート検証・エンタイトルメント付与の検証（StoreKit Testing はローカル完結で RevenueCat のサーバに届かない。**本 spec の目的は「購入前の画面が正しく描画されること」の確認まで**）
- Android
- CI への組み込み

## データモデル変更

**なし。**

## API サーフェス

**なし。**

## 実装詳細

### 1. `.storekit` 設定ファイル

`storekit/Tryline.storekit` に置く（`ios/` の中には置かない。理由は下記）。

- 自動更新サブスクリプショングループを1つ作る
- **プロダクト ID は App Store Connect の本番と一致させる**（Owner が提供。「未解決の質問」1）
- 価格は ¥980、期間は1か月
- 表示名は App Store Connect と揃える

### 2. ローカル config plugin（必須）

**`/ios/` は `.gitignore:3` で除外されており、`expo prebuild` が毎回生成する。** Xcode の scheme を手で編集しても `expo prebuild --clean` で消えるため、**plugin で注入しないと運用に乗らない。**

`plugins/withStoreKitConfiguration.js`（`plugins/` ディレクトリは現在無いので新設）で次を行う。

- `storekit/Tryline.storekit` を `ios/` 配下にコピーし、Xcode プロジェクトに追加する
- **scheme の LaunchAction に `StoreKitConfigurationFileReference` を設定する**
- `app.config.ts` の `plugins` 配列に追加する

### 3. 本番ビルドに影響させないこと（重要）

**StoreKit 設定ファイルが有効なままリリースビルドが作られると、実際の課金が行われない。**

- **plugin は環境変数で明示的に有効化したときだけ動く**ようにする（例: `EXPO_PUBLIC_STOREKIT_TESTING === "1"`）
- 既定は無効。EAS の production プロファイルでは有効にしない
- 有効時のみ scheme を書き換える。**無効時は `ios/` に一切変更を加えない**

### 4. `.env.example` と手順

現在 `.env.example` も README の環境変数記述も無い。次を追加する。

```
EXPO_PUBLIC_TRYLINE_API_BASE_URL=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_REVENUECAT_IOS_KEY=
EXPO_PUBLIC_STOREKIT_TESTING=0
```

**値は書かない。** `EXPO_PUBLIC_REVENUECAT_IOS_KEY` はアプリバイナリに同梱される publishable key だが、**リポジトリには入れない**。

手順を `docs/` に短く残す（prebuild → 起動 → 必須表示が出ることの確認まで）。

## UI サーフェス

**変更なし。** 既存の画面がローカルで描画できるようになるだけ。

## LLM 連携

なし。

## 受け入れ条件

1. `EXPO_PUBLIC_STOREKIT_TESTING=1` と RevenueCat のキーを設定した状態で Simulator を起動すると、**設定画面の Premium カードに必須表示6要素と購入ボタンが描画される。**
2. 同じ状態で、試合詳細のペイウォールにも同じ表示が出る。
3. **`EXPO_PUBLIC_STOREKIT_TESTING` が未設定または `0` のとき、plugin が `ios/` に何も変更を加えない。**
4. `expo prebuild --clean` の後も 1 が再現する（plugin で注入されており、手作業が要らない）。
5. `.env.example` が追加され、**実際のキーや URL の値が入っていない。**
6. 実行手順が `docs/` に記載されている。
7. 既存の課金ロジックと必須表示コンポーネント（`src/purchases/SubscriptionPurchaseBlock.tsx` / `usePurchaseAction.ts`）が**変更されていない。**
8. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` clean。

## 未解決の質問

1. **App Store Connect のプロダクト ID。** リポジトリのどこにも存在せず（`src/purchases/` は RevenueCat の offering 経由で取得するため ID を持たない）、ダッシュボードにしかない。**`.storekit` に書く ID は Owner が提供する必要がある。** ID が一致しないと RevenueCat が商品を解決できず、目的を達成しない。

2. **RevenueCat が StoreKit Testing 下で商品を解決できるか。** SDK は StoreKit から商品情報を取得するため理屈上は解決するはずだが、**実機で確認していない。** 解決しない場合は本 spec の手段では目的を達成できず、代替の調査が要る。**実装者はまずここを検証し、駄目なら停止して報告すること。**

3. **購入完了まで検証するか。** StoreKit Testing の購入は RevenueCat のサーバに届かないため、エンタイトルメント付与やレシート検証は確認できない。**本 spec は購入前の描画までを目的とする。** 購入完了まで見るには Sandbox アカウントでの実機テストが必要で、別途判断する。
