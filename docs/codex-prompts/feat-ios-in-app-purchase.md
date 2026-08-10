`specs/feat-ios-in-app-purchase.md` の仕様を実装してください。

**この spec は2つのリポジトリにまたがります。Phase 1（web）と Phase 2（mobile）に分け、PR も分けてください。Phase 1 を先に完了・マージしてから Phase 2 に着手します**（mobile は Phase 1 で作る同期エンドポイントを呼ぶため）。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む。**D015（2026-08-10）が D014 決定4「v1 は IAP なし」を撤回済み**なので、決定記録との矛盾は無い。**この文書の更新は Owner / Claude 側で完了しており、Codex の作業対象ではない**（AGENTS.md:180-181 の通り `specs/*.md` と `docs/decisions.md` は書き換えない）
- 背景: 2026-08-06 の App Store 審査で Guideline 3.1.1 によりリジェクトされた。アプリ内に購入手段が無いことだけが問題で、外部購入への誘導（anti-steering）違反は無い
- **`user_profiles` のスキーマ変更・マイグレーションは不要**。`premium_until` / `premium_source` は既に存在し、`premium_source` の check 制約に `'apple'` が含まれている（`supabase/migrations/20260714084400_add_premium_entitlement_columns.sql`）

---

## Phase 1 — web リポジトリ（`tryline`）

作るもの:
1. `app/api/revenuecat/webhook/route.ts`（新規）
2. `app/api/v1/me/entitlement/sync/route.ts`（新規）
3. `lib/env.ts` に `REVENUECAT_WEBHOOK_SECRET` / `REVENUECAT_SECRET_API_KEY` を追加（どちらも `.optional()`）

**この3点だけが Phase 1 のコード変更範囲。** `docs/decisions.md` / `specs/*.md` の更新は 2026-08-10 に完了済みで、Codex は触らない。

参考にする既存パターン:
- **webhook の骨格**: `app/api/stripe/webhook/route.ts`。`runtime = "nodejs"` の宣言（6行目）、service role クライアントの作り方（8〜11行目）、`user_profiles` への書き込み（80〜89行目）、失効時の更新（92〜102行目）をそのまま踏襲する
- **ルート配置の規約**: webhook は `app/api/<provider>/webhook/route.ts`。`app/api/webhooks/` という別系統のディレクトリは作らない
- **Premium 判定**: `lib/auth/server.ts:67-75` の `isProfilePremium`。`premium_until` の期限比較のみで課金元を見ない。**この関数は変更しない**
- **ログイン必須ルートの認証**: `app/api/v1/me/route.ts`。同期エンドポイントの 401 の返し方をここに揃える
- **v1 配下のサブルート構成**: `app/api/v1/me/favorites/route.ts`、`app/api/v1/me/next-matches/route.ts`

エッジケース:
- **`subscription_status` カラムは書かない。** `not null default 'free'` かつ check 制約 `('free','premium','cancelled')` があり、現状 Stripe webhook だけが書いて**どこからも読まれていない**。Apple 由来の書き込みで触ると Stripe 固有の状態表現が壊れる。upsert で新規行が作られても default が効く
- **Stripe の権利を Apple のイベントで縮めない。** `premium_source = 'stripe'` かつ `premium_until` が未来の profile は、webhook・同期エンドポイントのどちらからも上書きせず、skip したことをログに残す
- `app_user_id` が Supabase の user_id として解決できない（RevenueCat の匿名 ID のまま等）場合は、**書き込まずに 200 を返す**。4xx/5xx を返すと RevenueCat が再送し続ける。回収は同期エンドポイント側で行う
- `Authorization` ヘッダの比較は**定数時間比較**にする。単純な `===` は使わない
- `REVENUECAT_WEBHOOK_SECRET` が未設定の環境で webhook が呼ばれた場合の挙動を決める（未設定なら常に 401 が安全）
- 同じイベントが2回届いても結果が変わらないこと。`premium_until` の上書きは冪等なので重複排除テーブルは作らない
- `EXPIRATION` / `REFUND` は `premium_until` を**当該時刻に設定**する（null にするのではなく、過去日時になることで自動的に非 Premium になる）
- 扱うイベント種別は spec の「扱うイベント種別」のリスト。リストに無い種別が来ても 200 で握って落とさない

やらないこと:
- `user_profiles` のマイグレーション作成
- Stripe 側のコード変更（`app/api/stripe/**` は触らない）
- `isProfilePremium` / `lib/auth/server.ts` の変更
- Android / Google Play 課金への対応
- RevenueCat の SDK を web に入れること（web は REST API と webhook のみ）
- `REVENUECAT_SECRET_API_KEY` をクライアントに露出させること（`NEXT_PUBLIC_` を付けない）
- **`docs/decisions.md` / `specs/*.md` / `CLAUDE.md` / `AGENTS.md` の変更**（AGENTS.md:180-181 で禁止。更新は完了済み）

完了の定義:
- spec の受け入れ条件 5・6・7・8・9 を満たす（残りは Phase 2 で満たす）
- webhook と同期エンドポイントの単体テストを書く。最低限、認証失敗401 / Stripe 権利の非上書き / 解決不能な `app_user_id` で200 / 冪等性 の4ケース
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

---

## Phase 2 — mobile リポジトリ（`tryline-mobile`）

**Phase 1 のマージ後に着手すること。**

作るもの:
1. RevenueCat SDK（`react-native-purchases`）の導入と初期化
2. `src/matches/ContentSection.tsx` の paywall に購入 CTA
3. `app/(tabs)/settings.tsx` に契約状態表示・購入を復元・サブスクリプション管理
4. `src/auth/AuthProvider.tsx` でのログイン時 alias

参考にする既存パターン:
- **paywall の現状**: `src/matches/ContentSection.tsx:108-114`。`showPaywall` の分岐内に「続きは Premium でお読みいただけます。」「Premium をお持ちの方はログインしてください」と `ログイン` ボタンがある。ここに購入 CTA を足す
- **設定画面の現状**: `app/(tabs)/settings.tsx:50-70`。`Card` / `Text` / `Button` の組み方と `me?.isPremium` の参照の仕方をそのまま踏襲する。61行目の「Premium をお持ちの方はログインするとコンテンツを閲覧できます。」を見直す
- **ログイン状態の変化を拾う場所**: `src/auth/AuthProvider.tsx:75` の `supabase.auth.onAuthStateChange`。ここが `Purchases.logIn(supabaseUserId)` の呼び出し点
- **API 呼び出し**: `src/api/client.ts`。同期エンドポイントの呼び出しもこのクライアント経由に揃える
- SDK キーは `EXPO_PUBLIC_REVENUECAT_IOS_KEY`。`app.config.ts` の `extra` 経由で読む既存の Supabase 設定の作法に合わせる

エッジケース:
- **未ログインでも購入できること。** RevenueCat の匿名 ID のまま購入させ、ログイン成功時に `Purchases.logIn` で alias する
- 同期エンドポイントは**購入完了時とログイン完了時の両方**で呼ぶ
- `/api/v1/me` の `isPremium` が true のとき（= Stripe 契約者を含む）は購入 CTA を出さない。表示は「ご利用中」とし、解約導線は出さない
- **価格は RevenueCat の offering から取った `priceString` をそのまま表示する。** アプリ内に `¥980` 等をハードコードしない
- 「購入を復元」は Apple の必須要件。省略できない
- **アプリ内に外部決済ページへのリンク・Web で購入を促す文言を一切入れない**（anti-steering 違反になる）。既存文言の見直しでもこの制約を破らない
- SDK キー未設定の開発環境でアプリがクラッシュしないこと。購入 UI を出さずに動作を続ける
- Expo 57 / React Native 0.86 系。**`react-native-purchases` は native module を含むため Expo Go では動かない。development build / EAS build が要る**。この前提が崩れる場合は実装を止めて報告する

やらないこと:
- Android 対応
- 無料トライアル・イントロ価格・オファーコード・家族共有の実装
- 価格やプラン構成の変更（Free / Premium の2層のまま）
- App Store Connect / RevenueCat ダッシュボードの設定（Owner の作業）
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY` を EAS に登録すること（Owner の作業。過去に登録漏れの事故があるため、実装側では未設定を前提に防御する）

完了の定義:
- spec の受け入れ条件 1・2・3・4・10・11 を満たす
- テストを書く。最低限、Stripe 契約者に CTA が出ない / 価格がハードコードされていない / SDK キー未設定でクラッシュしない の3ケース
- lint / 型チェック / テストが clean
- 変更ファイル一覧を報告する

---

完了時（各 Phase 共通）:
- 実装内容を要約する
- Phase 2 は、購入 CTA と設定画面のスクリーンショットを添えて報告する
- **spec の受け入れ条件を1項目ずつ、満たしたことをどう確認したかと合わせて報告する**（「CI green」だけの報告は不可）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
