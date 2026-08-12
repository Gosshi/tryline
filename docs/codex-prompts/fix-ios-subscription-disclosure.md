`specs/fix-ios-subscription-disclosure.md` の仕様を実装してください。**作業対象は `tryline-mobile` リポジトリです**（web ではありません）。

コンテキスト:
- プロジェクト規約は `tryline-mobile/AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` の D014 / D015（iOS アプリと IAP）を読む
- 背景: 2026-08-12 の審査（ビルド32、レビュー端末 **iPad Air 11-inch (M3)**）で **Guideline 3.1.2(c)** によりリジェクト。「**length of subscription（期間と、各期間に提供される内容）**がアプリ内に無い」と名指しされた
- 現状の購入導線は `src/matches/ContentSection.tsx` のペイウォール1か所だけで、**価格文字列しか出していない**（`src/matches/MatchDetailScreen.tsx:206` が `currentPackage?.product.priceString` を渡す）

参考にする既存パターン:
- **ペイウォール本体**: `src/matches/ContentSection.tsx` の `showPaywall` / `showPurchase` ブロック。`showPurchase` は `!content.isPremium && Boolean(onPurchase && purchasePrice)`
- **package の取得**: `src/purchases/revenueCat.ts` の `offerings.current?.availablePackages[0]`
- **リンクの開き方**: `app/(tabs)/settings.tsx:199-207` の `Linking.openURL`。**同じ URL を使う**（`/legal/privacy` と `/legal/terms`。両方 200 を確認済み）
- **設定画面の Premium カード**: `app/(tabs)/settings.tsx:115-128`
- **スタイル**: `src/theme/tokens.ts`

SDK の型（`react-native-purchases@^10.7.0`）:
- `package.product.title` / `priceString` / `subscriptionPeriod: string | null`（ISO 8601、月額は `"P1M"`）/ `pricePerMonthString: string | null`
- `package.packageType`（`MONTHLY` / `ANNUAL` 等）

エッジケース:
- **期間はハードコードしない。** `subscriptionPeriod` から導出する。`P1M`→`1か月` / `P1Y`→`1年` / `P1W`→`1週間` / `P3M`→`3か月`
- **`subscriptionPeriod` が null のときは `packageType` にフォールバックする**
- **どちらでも判定できない場合は、表示ブロックごと出さず購入ボタンも出さない。** 必須表示を欠いたまま購入させないため（ここを「とりあえず購入させる」に倒さないこと）
- **価格もハードコードしない。** `priceString` をそのまま使う（地域・通貨・改定に追従するため。`specs/feat-ios-in-app-purchase.md` 122行の既存方針）
- **`pricePerMonthString` は月額商品では出さない。** 価格と重複して冗長になる。年額を追加したときだけ効く
- **未ログインでも表示は見える**こと。購入にログインが必要という既存の分岐（`requiresLoginToPurchase`）は変えない
- **表示は購入ボタンの直近に置く。** ボタンより下や、スクロールしないと見えない位置にしない
- **iPad の横幅**で文字が伸びきらないこと。折り返しと最大幅、リンクのタップ領域を確認する（レビューは iPad Air 11-inch で行われた）
- **設定画面にも購入ボタンを置く（2026-08-13 Owner 判断で確定）。** ただし**分岐規則を新しく作らないこと**。ペイウォールと同じにする:
  - `isPremium` が true のときは購入 CTA を出さない（`specs/feat-ios-in-app-purchase.md` 158行。Web の Stripe 契約者に二重課金させないため）
  - 未ログイン時の案内と挙動はペイウォールと同一にする（`requiresLoginToPurchase`）
  - 既存の「購入を復元」ボタンは残す

文言（spec の「文言」節が正。ここは要点のみ）:
- タイトル / 「1か月ごとの自動更新　¥980/月」 / 提供内容 / 自動更新・課金・解約の3点 / 2つのリンク
- 提供内容は「購読期間中、すべての試合のプレビュー・レビュー全文と AI チャットをご利用いただけます。」
- **誇張しないこと。** 実際に Premium で解放される範囲と一致させる

やらないこと:
- 課金ロジック・RevenueCat 連携・エンタイトルメント判定の変更（すべて稼働中）
- Web 側（`tryline` リポジトリ）の変更
- 価格・商品構成の変更
- `SubscriptionStoreView` への置き換え（StoreKit 2 の SwiftUI コンポーネントで現構成に組み込めない。必要情報が表示されていれば要件は満たす）
- `docs/decisions.md` / `specs/*.md` / `CLAUDE.md` / `AGENTS.md` の変更

完了の定義:
- spec の受け入れ条件1〜10（6-b を含む）をすべて満たす
- テストを追加する。最低限、次の7ケース
  1. `subscriptionPeriod: "P1M"` で `1か月` が表示される
  2. `subscriptionPeriod: null` かつ `packageType: MONTHLY` でフォールバックする
  3. **どちらも不明なとき、購入ボタンごと表示されない**
  4. 価格が `priceString` の値で表示される（ハードコードされていない）
  5. 2つのリンクが正しい URL で `Linking.openURL` を呼ぶ
  6. **設定画面で `isPremium` が true のとき購入ボタンが出ない**
  7. **設定画面の未ログイン時の挙動がペイウォールと同じ**
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **ペイウォールと設定画面のスクリーンショットを、iPhone と iPad の両方で撮って添付する。** Apple に画面収録を提出する必要があり、6要素が1画面に収まって見えるかを Owner が確認する
- spec の受け入れ条件を1項目ずつ、満たしたことをどう確認したかと合わせて報告する（「CI green」だけの報告は不可）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
