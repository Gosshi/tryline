# iOS: サブスクリプションの必須表示を購入フローに追加（App Store 3.1.2(c) 対応）

## 背景

2026-08-12 の審査（ビルド32、レビュー端末 iPad Air 11-inch (M3)）で **Guideline 3.1.2(c) - Business - Payments - Subscriptions** によりリジェクト。

> The following information needs to be included within the app: **length of subscription (time period and content or services provided during each subscription period).**

自動更新サブスクを提供するアプリは、**アプリ内に**次の4点をすべて表示する必要がある。

1. サブスクリプションのタイトル
2. **サブスクリプションの期間**
3. 価格（必要なら単位あたり価格も）
4. プライバシーポリシーと利用規約（EULA）への**機能するリンク**

**`specs/feat-ios-in-app-purchase.md` はこの要件を扱っていなかった。** 同 spec は「価格は `priceString` をそのまま表示する」（122行）までしか定めておらず、期間・タイトル・提供内容・購入フロー内のリンクに触れていない。その欠落がそのまま今回の指摘になっている。

### 現状

購入導線は `src/matches/ContentSection.tsx` のペイウォール1か所のみ。表示しているのは**価格文字列だけ**（`src/matches/MatchDetailScreen.tsx:206` が `currentPackage?.product.priceString` を渡す）。

```tsx
<Text style={styles.price}>{purchasePrice}</Text>
<Button ... title="Premium に登録" />
```

| 要件 | 現状 |
|---|---|
| タイトル | **なし** |
| 期間 | **なし** ← Apple が名指しした欠落 |
| 各期間に提供される内容 | **なし** ← 同上 |
| 価格 | あり |
| プライバシーポリシー / 利用規約リンク | **購入フロー内には無い**（設定画面 `app/(tabs)/settings.tsx:199-207` にはあり、両 URL とも 200 を確認済み） |

## スコープ

対象:
- 購入フロー内に必須要素を表示する**再利用可能なコンポーネントを新設**する
- `ContentSection.tsx` のペイウォールに組み込む
- 設定画面の Premium カードにも同じ表示を出し、**購入ボタンも置く**（2026-08-13 Owner 判断。現在は「未契約」と出るだけで購入導線が無く、レビュアーが購入フローに到達できない）

対象外:
- 課金ロジック・RevenueCat 連携・エンタイトルメント判定（すべて稼働中。変更しない）
- Web 側の課金 UI
- 価格や商品構成の変更
- App Store Connect のメタデータ設定（Owner 作業。下記参照）

## データモデル変更

**なし。**

## API サーフェス

**なし。** 表示する値はすべて RevenueCat SDK が返す `PurchasesPackage` から取る。

## UI サーフェス

### 新規コンポーネント: サブスクリプション表示ブロック

購入ボタンの**直近**に置く。ボタンより下や、スクロールしないと見えない位置にしない。

| 項目 | 出所 |
|---|---|
| タイトル | `package.product.title`。空なら `"Tryline Premium"` にフォールバック |
| 期間 | `package.product.subscriptionPeriod`（ISO 8601。月額なら `"P1M"`）。null なら `package.packageType` から導出 |
| 価格 | `package.product.priceString` |
| 単位あたり価格 | `package.product.pricePerMonthString`。**月額商品では価格と重複するため出さない**（年額を追加したときに効く） |
| 提供内容 | 固定文言（下記） |
| リンク | 固定 URL（下記） |

いずれも `@revenuecat/purchases-typescript-internal` の `PurchasesStoreProduct` に存在するフィールド（`subscriptionPeriod: string | null` / `pricePerMonthString: string | null`）。**SDK は `react-native-purchases@^10.7.0`。**

**期間の変換規則**:

- `P1M` → `1か月`
- `P1Y` → `1年`
- `P1W` → `1週間`
- `P3M` → `3か月`
- 解釈できない場合は `packageType`（`MONTHLY` / `ANNUAL` 等）にフォールバック
- **それも不明なら、ブロックごと出さず購入ボタンも出さない**（必須表示を欠いたまま購入させないため）

**文言**（Apple が求める「各期間に提供される内容」を満たすこと）:

```
Tryline Premium
1か月ごとの自動更新　¥980/月

購読期間中、すべての試合のプレビュー・レビュー全文と
お読みいただけます。

・購読は期間終了の24時間前までに解約されない限り自動更新されます
・お支払いは購入確定時に Apple ID アカウントに請求されます
・解約は iOS の「設定 > Apple ID > サブスクリプション」から行えます

［プライバシーポリシー］［利用規約（EULA）］
```

- **価格と期間はハードコードしない。** `¥980` は `priceString`、`月` は `subscriptionPeriod` 由来の値から組み立てる
- 提供内容の文言は実際に Premium で解放される範囲と一致させる。**誇張しない**
- リンクは `Linking.openURL` で `https://www.trylinerugby.com/legal/privacy` と `https://www.trylinerugby.com/legal/terms`（設定画面と同一 URL）

### 表示位置

1. **`ContentSection.tsx` のペイウォール**（必須）。`showPurchase` が真のとき、現在の価格表示を本ブロックに置き換える
2. **設定画面の Premium カード**（`app/(tabs)/settings.tsx`）。現在は「未契約」と表示するだけで購入導線が無い。**表示ブロックと購入ボタンの両方を置く**

設定画面の購入ボタンは、**ペイウォールと同じ分岐規則に従う**こと。新しい規則を作らない。

- `isPremium` が true のときは購入 CTA を出さない（`specs/feat-ios-in-app-purchase.md` 158行。Web の Stripe で契約済みのユーザーに二重課金させないため）
- 購入にはログインが必要。未ログイン時の案内は既存のペイウォールと同じ文言・同じ挙動にする
- 既存の「購入を復元」ボタンはそのまま残す

### レイアウト

**レビューは iPad Air 11-inch (M3) で行われた。** 大画面で文字が横に伸びきったり、リンクが押しにくくならないこと。折り返しと最大幅を確認する。

## LLM 連携

なし。

## 受け入れ条件

1. ペイウォールに**タイトル・期間・価格・提供内容・プライバシーポリシーリンク・利用規約リンク**の6要素がすべて表示される。
2. **期間が `subscriptionPeriod` から導出されている**（`"1か月"` 等）。ハードコードしていない。
3. 価格が `priceString` から取られており、ハードコードしていない。
4. `subscriptionPeriod` も `packageType` も解釈できない場合、**購入ボタンごと非表示になる**。
5. 2つのリンクが `Linking.openURL` で実際に開く。URL は設定画面と同一。
6. 設定画面の Premium カードに同じ表示が出て、**購入ボタンからペイウォールと同じ購入フローに入れる**。
6-b. 設定画面の購入ボタンが、**`isPremium` が true のときは表示されない**。未ログイン時の挙動がペイウォールと同一である。既存の「購入を復元」ボタンが残っている。
7. **iPad の横幅で表示崩れがない**（折り返し・最大幅・タップ領域）。
8. 未ログイン状態でもこの表示が見える（購入にログインが必要という既存の導線は変えない）。
9. 既存の購入・復元・エンタイトルメント判定の挙動が変わっていない。
10. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` clean。

## Owner 側の作業（実装では解決しない）

1. **App Store Connect のメタデータ確認**
   - Privacy Policy フィールドに URL が入っていること
   - **利用規約（EULA）が App Description または EULA フィールドに入っていること**。Apple はこの2か所を明示している
2. **App Review Information の Notes** に、必須表示がどの画面にあるかを記載する（Apple が「future submissions のために書け」と指示）
3. **画面収録の提出。** Apple は「reply to this message with a screen recording to confirm」と要求している。ペイウォールを開いて6要素が見えるところを録画する
4. 新ビルド（33）の作成と提出

## 未解決の質問

1. **`SubscriptionStoreView` を使うか。** Apple は推奨しているが、これは StoreKit 2 のネイティブ SwiftUI コンポーネントで、RevenueCat 経由の現構成にそのまま組み込めない。**必須ではない**（必要情報が表示されていればよい）ため、本 spec では自前実装とする。

## 決定済み（2026-08-13、Owner 確認）

- ~~提供内容の文言は「すべての試合のプレビュー・レビュー全文と AI チャット」~~ → **2026-08-14 訂正: 「AI チャット」を削除する。**

## 2026-08-14 追補: 提供内容の文言から「AI チャット」を外す

**理由**: 2026-08-13 の審査（Guideline 2.1・情報要求）に回答するにあたり、**`tryline-mobile` に chat 機能が1ファイルも存在しない**ことが判明した（`grep -rln "chat" src/ app/` が0件）。Apple の質問8は「IAP で何が買えるか、アプリ内のどこで購入するか」であり、**アプリ内に無い機能を提供内容として挙げると次のラウンドを生む。**

Premium が実際に解放するのは**プレビューとレビューの全文**のみ（`ContentSection.tsx` の `content.locked` 分岐）。

**変更後の文言**:

```
購読期間中、すべての試合のプレビュー・レビュー全文をお読みいただけます。
```

**UI 文言から「AI」を外す既存方針**（`docs/decisions.md` の AI 表記方針）とも一致する。適用漏れだった。

**追加の受け入れ条件**:

11. ペイウォールと設定画面の提供内容の文言が「購読期間中、すべての試合のプレビュー・レビュー全文をお読みいただけます。」になっており、**「AI チャット」の語がアプリ内のどこにも残っていない。**
- **設定画面に購入ボタンを置く。** 上記「表示位置」2 を参照
