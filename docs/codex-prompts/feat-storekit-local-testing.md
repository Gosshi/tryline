`specs/feat-storekit-local-testing.md` の仕様を実装してください。**作業対象は `tryline-mobile` リポジトリです**（web ではありません）。仕様書は同リポジトリの `docs/specs/feat-storekit-local-testing.md` にもあります。

コンテキスト:
- プロジェクト規約は `tryline-mobile/AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` の D014 / D015（iOS アプリと IAP）を読む
- 背景: 2026-08-12 に Guideline 3.1.2(c) でリジェクトされ、PR #62 で必須表示を実装した。**しかしその表示を Simulator で一度も描画できなかった**（RevenueCat のキーが無く、`.storekit` 設定ファイルも無いため `getOfferings()` が空を返す）。審査を止めている UI をローカルで目視できない状態を解消するのが目的

**最初に検証してほしいこと（ここが駄目なら以降は無意味）**:
- **RevenueCat SDK が StoreKit Testing 下で商品を解決できるか。** SDK は StoreKit から商品情報を取るため理屈上は解決するはずだが未確認。**解決しないなら実装を止めて報告してください。** 別の手段の検討が必要になります

参考にする既存パターン:
- **設定の読み込み**: `app.config.ts` の `extra`（`revenueCatIosKey` は `process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? ""`）
- **可用性の判定**: `src/purchases/revenueCat.ts` の `isRevenueCatAvailable()` と `getCurrentPackage()`
- **描画条件**: `app/(tabs)/settings.tsx` の `!me?.isPremium && isPurchaseAvailable && currentPackage`
- **プラグイン**: `app.config.ts:19-29` の `plugins` 配列。**現在は公式プラグインのみで、`plugins/` ディレクトリは存在しない**

エッジケース:
- **`/ios/` は `.gitignore:3` で除外されており `expo prebuild` が毎回生成する。** Xcode の scheme を手で編集しても `expo prebuild --clean` で消える。**必ず config plugin で注入すること。** 手順書に「Xcode で設定してください」と書くのは不可
- **本番ビルドに絶対に影響させないこと。** StoreKit 設定ファイルが有効なままリリースビルドが作られると実際の課金が行われない。`EXPO_PUBLIC_STOREKIT_TESTING === "1"` のときだけ plugin が動き、**未設定または `0` のときは `ios/` に一切変更を加えない**
- **`.env.example` に実際の値を書かない。** キーも URL も空にする。`EXPO_PUBLIC_REVENUECAT_IOS_KEY` はバイナリ同梱の publishable key だが、リポジトリには入れない
- **プロダクト ID はリポジトリのどこにも無い**（RevenueCat の offering 経由で取得するため）。**Owner から提供される ID を使う。** 分からない場合は推測せず停止して質問すること。ID が一致しないと商品が解決せず目的を達成しない
- 既存の `src/purchases/SubscriptionPurchaseBlock.tsx` と `usePurchaseAction.ts` は **PR #62 でマージ済み。変更しない**

やらないこと:
- 課金ロジック・RevenueCat 連携・必須表示コンポーネントの変更
- 購入完了・レシート検証・エンタイトルメント付与の検証（StoreKit Testing は RevenueCat のサーバに届かない。**購入前の描画までが目的**）
- Android
- CI への組み込み
- Web 側（`tryline` リポジトリ）の変更
- `docs/decisions.md` / `specs/*.md` / `CLAUDE.md` / `AGENTS.md` の変更

完了の定義:
- spec の受け入れ条件1〜8をすべて満たす
- **`EXPO_PUBLIC_STOREKIT_TESTING` が未設定・`0`・`1` の3通りで、`ios/` への影響を確認する**
- `expo prebuild --clean` の後に再現することを確認する
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **Simulator のスクリーンショットを添付する。** 設定画面の Premium カードと試合詳細のペイウォールの両方で、必須表示6要素と購入ボタンが出ているところ。**これが本 spec の唯一の成果物と言ってよい**
- **RevenueCat が StoreKit Testing 下で商品を解決したかどうかを明記する**
- `EXPO_PUBLIC_STOREKIT_TESTING=0` のときに `ios/` が変化しないことを、どう確認したか報告する
- spec の受け入れ条件を1項目ずつ、満たしたことをどう確認したかと合わせて報告する（「CI green」だけの報告は不可）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
