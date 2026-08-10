# feat-ios-app-mvp: iOS アプリ本体（tryline-mobile）v1

## 背景

D014 で iOS アプリを正式プロダクトラインへ昇格。前提の p0（`feat-premium-entitlement-refactor` / `feat-mobile-api-v1`）は 2026-07-14 に本番稼働済みで、アプリが必要とする読み取り API・Bearer 認証・Premium ゲートは `/api/v1` に揃っている。

本 spec は Expo（React Native）による iOS アプリ v1 を定義する。目標は 9 月中〜下旬の App Store 公開（11月オータムインターナショナル前）。

> **【2026-08-10 追記・D015 で改訂】** 起票時は「v1 は IAP なし」（Netflix 型: Web 購入済み Premium をログインで解錠）としていたが、2026-08-06 の App Store 審査で **Guideline 3.1.1 によりリジェクト**された。Apple はアプリ外購入コンテンツへのアクセスを、同じものが IAP でも購入できることを条件に認める（Guideline 3.1.3(b)）。よって **v1 で IAP を実装する**。実装方式は RevenueCat。詳細は `specs/feat-ios-in-app-purchase.md`、判断の記録は `docs/decisions.md` の D015 を参照。本文中の「IAP なし」「IAP / StoreKit は v1.1 で判断」の記述はすべて D015 で上書きされている。

対象リポジトリは 2 つ:
- **tryline-mobile**（メイン）: アプリ本体。https://github.com/Gosshi/tryline-mobile（空リポジトリ作成済み）
- **tryline**（小さい追加のみ）: アカウント削除エンドポイント `DELETE /api/v1/me`

## スコープ

対象（tryline-mobile）:
- Expo プロジェクトの雛形生成（TypeScript strict、expo-router、CI: lint + tsc + test）
- 画面: 今週（カレンダー）/ 試合詳細（スコア・イベント・ラインナップ・プレビュー/レビュー閲覧）/ 大会（一覧・順位表）/ 設定（ログイン・お気に入り・ネタバレ防止・アカウント削除）
- `/api/v1` クライアント（型は tryline の `lib/api/v1/types.ts` をコピーして使用）
- Supabase Auth ログイン（email OTP）とセッション永続化
- お気に入りチーム（最大 3、Web と共有）
- ネタバレ防止（クライアント側スコアマスク）
- 日本の視聴先リンク（`broadcast_jp_url`）
- アカウント削除 UI（App Store 審査要件 5.1.1(v)）
- EAS Build 設定（TestFlight 配布可能な状態まで。App Store Connect への提出操作は Owner）

対象（tryline）:
- `DELETE /api/v1/me` エンドポイントの追加

対象外（v1 に含めない）:
- push 通知 / APNs / 試合前通知（次の spec。ただし expo-router の URL 設計は通知からの遷移を想定して固定的に定義する）
- Universal Links / AASA 配置（push spec とセットで対応）
- ~~IAP / StoreKit（v1.1 で判断）~~ → **D015 により v1 で実装。`specs/feat-ios-in-app-purchase.md` を参照**
- AI チャット
- ウィジェット / Live Activities
- Android ビルドの提出（コードは RN なので将来対応可能だが、v1 の成果物は iOS のみ）
- オフラインキャッシュの作り込み（TanStack Query の既定キャッシュで足りる範囲のみ）
- ニュースハブ、Web の SEO 専用ページ（h2h・選手ページ等）の移植

## データモデル変更

なし。アカウント削除は Supabase Admin API で `auth.users` の行を削除し、`user_profiles` は既存の `on delete cascade` で消える（`supabase/migrations/20260507100000_add_user_profiles.sql` 参照）。

## API サーフェス

### tryline 側の追加: `DELETE /api/v1/me`

- 認証必須（`getUserFromBearer`、`lib/auth/bearer.ts`）。未認証は 401
- service role クライアント（`supabase.auth.admin.deleteUser(userId)`）で auth ユーザーを削除
- 成功時は共通エンベロープで 200 `{ success: true, data: { deleted: true }, error: null }`、`Cache-Control: private, no-store`
- 既存の `app/api/v1/me/route.ts` と同ファイルに `DELETE` エクスポートを追加（新規ルート不要）
- 注意: Stripe 購読が残っているユーザーの削除では Stripe の解約は行わない（v1 の実ユーザーはゼロ。Stripe 連動解約は IAP spec と合わせて将来対応）。ただし `stripe_subscription_id` が非 null のユーザーが削除を実行した場合はサーバーログに warn を出す

### アプリからの API 利用

- ベース URL は **`https://www.trylinerugby.com`**（apex は 307 リダイレクトのため使わない。Authorization ヘッダ付きリクエストをリダイレクトに通さない）
- 使用エンドポイント: `specs/feat-mobile-api-v1.md` の 7 本＋上記 DELETE
- レスポンス型は tryline の `lib/api/v1/types.ts` を `src/api/types.ts` としてコピー（同期は手動。乖離したら tryline 側が正）
- Supabase Auth は supabase-js を直接使用（URL / anon key は tryline の `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` と同値。アプリでは `app.config.ts` の `extra` で注入し、ハードコードしない）。セッションは expo-secure-store に保存

## UI サーフェス

### ナビゲーション構造（expo-router）

タブ 3 本＋モーダル。**push 通知からの遷移を想定し、試合詳細の URL を `matches/[id]` に固定する**（後続の push spec がこのパスに依存する）。

```
(tabs)/
  index          — 今週（カレンダー）
  competitions/  — 大会一覧 → [slug]（順位表）
  settings       — 設定
matches/[id]     — 試合詳細（どこからでも push 遷移可能なスタック画面）
auth/sign-in     — ログイン（モーダル）
```

### 画面仕様

**1. 今週（カレンダー）**
- `GET /api/v1/calendar`（パラメータなし＝JST 今週）を表示。日付ごとにグルーピング、大会名・両チーム・キックオフ（**端末タイムゾーンで表示、基準は JST**）・スコア・コンテンツ有無バッジ
- 週ナビゲーション（前週/翌週）: `from`/`to` を計算して再取得
- お気に入りチームの試合を先頭セクションに分離表示（`favorite_team_slugs` はログイン時のみ）
- 試合タップで `matches/[id]` へ

**2. 試合詳細**
- `GET /api/v1/matches/[id]` ＋ `GET /api/v1/matches/[id]/content`
- 上段: スコアボード（チーム名・スコア・ステータス・キックオフ）
- `broadcast_jp_url` が非 null なら「視聴する」ボタン → 外部ブラウザで開く（`Linking.openURL`）
- タブ or セクション: プレビュー / レビュー（Markdown 描画）/ イベント / ラインナップ
- **ペイウォール（審査上の最重要ルール）**: `locked: true` のとき、無料部分の下に「続きは Premium でお読みいただけます。Premium をお持ちの方はログインしてください」という案内＋ログインボタンのみを表示する。**購入への導線（「Web で購入」ボタン・価格表示・pricing ページへのリンク・購読を促す文言）は一切置かない**（IAP なしアプリからの外部購入誘導は App Store Review Guideline 3.1.1 違反。案内可能なのは既存契約者のログインのみ）

**3. 大会**
- `GET /api/v1/competitions` の一覧 → タップで `GET /api/v1/competitions/[slug]/standings` の順位表（pool 制は pool ごとに表示）

**4. 設定**
- ログイン/ログアウト（未ログイン時はサインイン導線）
- お気に入りチーム編集（最大 3。`PUT /api/v1/me/favorites`。チーム候補は competitions → standings のチームから選択でよい）
- ネタバレ防止トグル（下記）
- アカウント削除: 確認ダイアログ（「元に戻せません」）→ `DELETE /api/v1/me` → ローカルセッション破棄 → 未ログイン状態へ
- リンク: プライバシーポリシー `https://www.trylinerugby.com/legal/privacy`・利用規約 `https://www.trylinerugby.com/legal/terms`（外部ブラウザ）
- アプリバージョン表示

**5. ログイン（email OTP）**
- メールアドレス入力 → `signInWithOtp()` → 6 桁コード入力 → `verifyOtp()`。**magic link は使わない**（ネイティブでのリンクハンドリング不要にするため）
- Web と同じ Supabase プロジェクトなので、Web で登録済みのアカウント（Premium 含む）にそのままログインできる
- OAuth（Google）は v1 では入れない（入れる場合 Sign in with Apple の同時実装が審査必須になるため v1.1 以降で判断）

### ネタバレ防止（クライアント側）

- 設定 ON のとき: カレンダー・試合詳細のスコアを `●–●` にマスクし、勝敗が推測できる表示（順位表の直近結果等があれば同様）も隠す。試合単位で「スコアを表示」タップで開示（開示状態はアプリ内メモリのみ、永続化しない）
- コンテンツ有無バッジ（プレビュー/レビューあり）はマスク対象外
- レビュー本文は開示操作をしたときのみ表示（本文にスコアが含まれるため）
- 設定値は端末ローカル（AsyncStorage）。サーバー同期しない（push 通知のネタバレ設定は push spec で別途扱う）

### デザイン品質

- **Web とブランドを揃える**: アクセント `#c93a40`（`--color-accent`）、紙 `#f5f6f8`（`--color-paper`）、インク `#1f2530` / muted `#767d8b`（tryline の `app/globals.css` が正。実装時に最新値を転記し、トークンファイル `src/theme/tokens.ts` に集約する）
- スタイル方向: Web の試合詳細ページと同じ「新聞・エディトリアル」系。紙背景＋インク文字＋アクセント最小限。ダークモードは v1 では対応しない（`userInterfaceStyle: "light"` 固定）
- タイポグラフィ: 本文はシステムフォント（ヒラギノ）。見出しのウェイト・サイズ階層で紙面感を出す
- 避けること: デフォルト UI キットそのままの均一カード羅列、意味のないグラデーション、Web と無関係な配色
- **Owner による目視評価を受け入れ条件に含む**（シミュレータのスクリーンショット提出。機械的条件だけで完了としない）

### 技術スタック（tryline-mobile）

- Expo SDK 最新安定版＋expo-router、TypeScript strict
- サーバー状態: TanStack Query（お気に入り更新は楽観更新＋失敗時ロールバック）
- Supabase: supabase-js＋expo-secure-store セッション
- Markdown 描画: RN 向け既存ライブラリから実装時に選定（自作しない）
- テスト: jest-expo＋React Native Testing Library
- リポジトリ初期化に含める: `AGENTS.md`（tryline の規約から移植・アプリ向けに調整）、GitHub Actions CI（lint / tsc / test）、`eas.json`（development / preview / production プロファイル）

## LLM 連携

なし。アプリは公開済みコンテンツを `/api/v1` から表示するだけで、LLM 呼び出しの追加はゼロ。Web と iOS は同一コンテンツを配信する（設計不変条件）。

## 受け入れ条件

### tryline 側（DELETE /api/v1/me）

1. Bearer なし・不正 Bearer で 401
2. 正しい Bearer で 200 を返し、`auth.users` の該当行と `user_profiles` の該当行が削除されている（統合テスト）
3. 既存の `GET /api/v1/me` の挙動に変更がない

### tryline-mobile 側

4. `npx expo start` で iOS シミュレータ起動、クラッシュなしで 4 画面すべて遷移できる
5. カレンダー: API レスポンスの試合が日付グルーピングで表示され、週ナビで `from`/`to` 付きリクエストが飛ぶ（API クライアントの単体テストで URL を検証）
6. 試合詳細: `locked: true` のレスポンスで、画面に locked 部分の本文が表示されず、ログイン案内が表示される。**購入導線・価格・pricing への遷移が UI 上に存在しない**（テキスト検索テスト＋Owner 目視）
7. Premium アカウントでログイン後、同じ試合で全文が表示される
8. email OTP: 正しいコードでセッションが確立し、アプリ再起動後もログイン状態が維持される（expo-secure-store）
9. お気に入り: 3 件まで選択でき、`PUT /api/v1/me/favorites` が飛び、カレンダーの先頭セクションに反映される。4 件目の選択は UI でブロック
10. ネタバレ防止 ON でカレンダー・試合詳細のスコアが `●–●` になり、試合単位のタップで開示される。レビュー本文が開示操作前に表示されない（コンポーネントテスト）
11. アカウント削除: 確認ダイアログ → 実行 → セッション破棄・未ログイン状態へ。削除後に同メールで再サインアップできる（手動確認手順として記載）
12. `broadcast_jp_url` 非 null の試合で「視聴する」が表示され、null では表示されない
13. TypeScript strict でエラーゼロ、CI（lint / tsc / test）が green
14. **Owner 目視評価**: 4 画面のスクリーンショット（iPhone 15 相当）を提出し、デザイン品質セクションの基準（Web とのブランド一貫性・テンプレ感の排除）で Owner が承認する

## 未解決の質問

1. **Bundle ID とアプリ表示名**: `com.trylinerugby.app` / 「Tryline」を仮とする。App Store Connect 登録前に Owner が確定
2. **認証を email OTP のみとする判断の確認**: Web は magic link＋Google だが、アプリ v1 は OTP のみ（Google を入れると Sign in with Apple が審査必須になり工数増）。Web で Google ログインしたユーザーは、同じメールアドレスでも OTP ログインで別扱いになる可能性があるため、実装時に Supabase の identity linking 設定を確認し、問題があれば Owner に報告
3. **Supabase の OTP メールテンプレート**: 既定だと magic link 形式のメールになる場合がある。OTP コードがメールに含まれる設定になっているか実装時に確認（Supabase ダッシュボード設定、Owner 作業の可能性）
4. **EAS のビルドクレジット**: 無料枠で足りる想定。超える場合は Owner 判断
