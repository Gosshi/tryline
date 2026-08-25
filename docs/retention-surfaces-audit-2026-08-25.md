# 再訪手段の実装状況 2026-08-25

## サマリ

- **Web Push:** 登録 UI の実体は 1 箇所だけで、ログアウト中は描画されない。ホームの「通知設定を開く」も試合空白期だけの条件付き導線で、未ログイン利用者にはログイン UI しか見せない。さらにクライアントは、仕様・環境スキーマに無い `NEXT_PUBLIC_VAPID_PUBLIC_KEY` を参照し、登録 API の失敗も成功扱いするため、「導線が届かない」と「届いても失敗を検知できない」の両方がある。
- **メール購読:** ログイン不要のフォームはトップ・カレンダー・大会シーズンハブの 3 箇所にあり、登録 → 確認 → DB 保存の経路も完結している。与えられた「1 件、うち confirmed 1 件」は経路が少なくとも 1 回完走した証拠であり、低登録数をコード故障だけでは説明できない。一方、週次配信 cron は Vercel が `GET` で呼ぶのにルートが `POST` しか持たず、自動配信はコード上成立していない。
- **iOS Push:** このリポジトリ内の登録 API、DB、Expo 送信、毎時・30 分ごとの GitHub Actions は接続済みである。与えられた 2 トークンも登録経路が動いた証拠。ただし `push_notification_log` は送信対象トークン 0 件でも行を作るため、37 行は「37 通届いた」証拠ではなく、モバイル側の入口と現在の許可 UX は別リポジトリのため本監査では確認できない。

## 調査範囲と前提

- 本番 DB には接続せず、依頼文で与えられた `email_subscribers = 1（confirmed 1）`、`push_subscriptions = 0`、`expo_push_tokens = 2`、`push_notification_log = 37` を事実として使用した。
- 環境変数は `lib/env.ts` の**定義名だけ**を読み、値および `.env*` は読んでいない。
- Web 側リポジトリのコード、マイグレーション、workflow、テスト、仕様書を静的に追跡した。iOS クライアントは別リポジトリ `tryline-mobile` であり、本リポジトリのアクセス境界外なので実装を読んでいない（`specs/feat-ios-push-notifications.md:13-15`）。
- 「何回スクロールした先か」は画面高、動的コンテンツ、レスポンシブ状態で変わるため、実スクロール回数は静的解析だけでは確定できない。代わりに、ページ内の DOM 順序とヘッダー／ヒーロー内外を記録した。

## Web Push

### 入口

#### 所見 W-1: 設定 UI はログイン済みのヘッダーメニュー内にしか描画されない

- 確信度: **確実**
- 根拠: `components/user-menu.tsx:59-72,74-92,130-141`、`components/header-user-controls.tsx:50-74`、`components/mobile-header-menu.tsx:246-266`
- 実測: `<NotificationSettings` の本番コード上の呼び出しは **1 箇所**。
- 検索コマンド: `rg -n '<NotificationSettings' app components -g '*.tsx'`
- 結果: `components/user-menu.tsx:137` の 1 件。
- 到達条件:
  1. どのページでも sticky header には到達できるためスクロールは不要（`components/site-header.tsx:12-17`）。
  2. デスクトップはログイン済みユーザー名を押してメニューを開く。未ログイン時の `UserMenu` は「ログイン」ボタンだけを返す（`components/user-menu.tsx:59-72`）。
  3. モバイルも未ログイン時はメニュー末尾が「ログイン」だけで、`UserMenu` 自体を描画しない（`components/mobile-header-menu.tsx:246-266`）。
- 判定: API とテーブルは匿名購読を想定しているが、匿名ユーザーが登録 UI に到達する通常導線は無い。

#### 所見 W-2: 公開ページ上の通知 CTA はホームの試合空白期に限られ、未ログインでは設定まで到達しない

- 確信度: **確実**
- 根拠: `components/home-matchday-board.tsx:123-143,207-230`、`components/user-menu.tsx:24-37,59-78`、`components/mobile-header-menu.tsx:63-76,110-135,246-266`
- 実測: `notifications=open` の本番 UI リンクは **1 箇所**で、`matches.length === 0` かつ `nextUpcomingMatch` がある分岐にだけ存在する。
- 検索コマンド: `rg -n 'notifications=open' app components -g '*.tsx'`
- 結果: `components/home-matchday-board.tsx:222` の 1 件。
- 動作:
  - ログイン済みデスクトップでは `/?notifications=open` がユーザーメニューを開き、設定を表示する。
  - 未ログインデスクトップでは `UserMenu` が query 監視より前に early return するため、ログインボタンしか出ない。
  - 未ログインモバイルでは外側メニューは開くが、末尾はログインボタンだけである。
- 判定: 「ページ側の入口が完全に 0」ではないが、153 人の大半と想定される未ログイン訪問者に対しては実質的にログイン導線である。また、試合のある週はこの CTA 自体が消える。

### 登録処理の経路

#### 所見 W-3: Service Worker と subscribe API、DB insert までは接続されている

- 確信度: **確実**
- 根拠: `components/notification-settings.tsx:58-97`、`public/sw.js:1-19`、`app/api/push/subscribe/route.ts:9-58`、`supabase/migrations/20260507110002_add_push_subscriptions.sql:1-19`
- 経路: UI mount → `/sw.js` 登録 → `pushManager.subscribe()` → `/api/push/subscribe` → `push_subscriptions` upsert。
- 認証: API は `getUser()` が null でも `user_id: null` で保存する（`app/api/push/subscribe/route.ts:9-10,41-50`）。マイグレーションも insert を全員に許可している（`supabase/migrations/20260507110002_add_push_subscriptions.sql:18-19`）。
- 判定: 「API はあるが一度も呼ばれない」「Service Worker の登録コードが無い」は誤り。ただし UI mount 自体がログイン内側なので、未ログインではこの経路が開始しない。

#### 所見 W-4: ブラウザが必要とする公開鍵の名前が、仕様と環境スキーマの契約から外れている

- 確信度: **確実（コード上の不一致）／本番値の有無は要確認**
- 根拠: `components/notification-settings.tsx:72-79`、`lib/env.ts:3-6,8-24`、`specs/p2-push-notifications.md:80-86`
- 実測: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` はリポジトリ内で使用箇所 1 件、定義箇所 0 件。サーバー側には別名 `VAPID_PUBLIC_KEY` が必須定義されている。
- 検索コマンド: `rg -n 'NEXT_PUBLIC_VAPID_PUBLIC_KEY' app components lib public specs -g '!*.env*'`
- 結果: `components/notification-settings.tsx:76` の 1 件のみ。
- 影響: 本番で `NEXT_PUBLIC_VAPID_PUBLIC_KEY` を別途手動設定していなければ、UI は空文字を `applicationServerKey` に渡し、ブラウザ購読を完了できない。環境変数の実値は本監査では未確認。

#### 所見 W-5: 登録・解除 API の失敗を UI が確認せず、失敗しても「オン」に見える

- 確信度: **確実**
- 根拠: `components/notification-settings.tsx:43-55,83-97,114-128`、`app/api/push/subscribe/route.ts:54-58`、`app/api/push/unsubscribe/route.ts:24-28`
- 検索コマンド: `rg -n 'response\.(ok|status)' components/notification-settings.tsx`
- 結果: **0 件**。
- 影響: `/api/push/subscribe` が 4xx/5xx でも `setSubscribed(true)` と `trackPushPermissionGranted()` が実行される。解除も API が失敗してもブラウザ側 subscription を解除して「オフ」にするため、DB と UI が乖離しうる。

#### 所見 W-6: 匿名購読は初回 insert だけ許可され、同じ endpoint の更新・解除は RLS と整合しない

- 確信度: **確実**
- 根拠: `app/api/push/subscribe/route.ts:41-52`、`app/api/push/unsubscribe/route.ts:18-28`、`lib/auth/server.ts:12-32`、`supabase/migrations/20260507110002_add_push_subscriptions.sql:13-19`
- 実測: API は service role ではなく anon key＋任意 cookie のクライアントを使う。RLS は匿名 insert を許すが、update/delete は `auth.uid() = user_id` の本人ポリシーだけである。
- 影響: `user_id = null` の匿名行は `auth.uid() = user_id` が真にならないため、同 endpoint の upsert 更新と解除が許可されない。現在 UI は匿名に露出していないため表面化しにくいが、単に UI を公開するだけでは匿名フローが完結しない。

### 送信側

#### 所見 W-7: recap 生成後の送信呼び出しは接続済みだが、Web Push 専用の送信履歴は残らない

- 確信度: **確実**
- 根拠: `app/api/cron/orchestrate/route.ts:53-70,72-84`、`lib/cron/orchestrate.ts:164-209,282-307`、`app/api/push/send/route.ts:38-105`
- 実測: `/api/push/send` の本番コード上の呼び出し元は `app/api/cron/orchestrate/route.ts:58` の 1 件。recap 生成後にのみ呼ばれる。
- 検索コマンド: `rg -n '/api/push/send|api/push/send|push/send' app components lib scripts .github -g '!*.env*'`
- 配送: CRON 認証 → 全 `push_subscriptions` 取得 → team filter → VAPID 送信、まで実装済み。
- 履歴: `push_notification_log` は iOS 経路専用で、Web sender は書かない。`push_subscriptions.last_used_at` も sender から更新されない。
- 検索コマンド: `rg -n 'last_used_at' app/api/push lib components public | rg 'push|notification'`
- 結果: **0 件**。
- 判定: 与えられた `push_notification_log = 37` は Web Push の送信形跡ではない。Web Push について、コード・与えられた DB 件数から過去送信の成否は確認できない。

#### 所見 W-8: 期限切れ endpoint を握り潰し、削除も失敗集計もしない

- 確信度: **確実**
- 根拠: `app/api/push/send/route.ts:91-105`
- 実測: `webpush.sendNotification` の例外は catch 本文で何も記録せず、レスポンスは成功件数だけを返す。
- 影響: 登録 0 件の直接原因ではないが、登録後の失効・配送失敗を運用から判別できない。

### ゼロである原因（確信度つき）

1. **最も可能性が高い: 未ログイン訪問者に登録 UI が届かない。** 確信度: **要確認**。UI 制約自体は確実だが、153 人の認証状態・操作はコードから確認できない（所見 W-1/W-2）。
2. **次点: クライアント用 VAPID 公開鍵が本番に無く購読開始時に失敗する。** 確信度: **要確認**。名前の不一致は確実だが、本番に未定義の変数を追加設定している可能性は残る（所見 W-4）。
3. **失敗が観測されないため、Owner が壊れた導線を正常と認識しうる。** 確信度: **確実**。API response 未確認、SW 登録 catch の空処理、Web 配送ログなしが重なる（所見 W-5/W-7/W-8）。

### 動く状態にするための最小の変更（規模感・触るファイル）

- 規模感: **M**。
- 最小範囲:
  - 匿名でも見える高滞在面から `NotificationSettings` を開けるようにする: `components/user-menu.tsx` と配置先（候補は `app/calendar/page.tsx`、`app/c/[competition]/[season]/page.tsx`、または既存ホーム CTA）。
  - 公開鍵の契約を 1 つに統一する: `components/notification-settings.tsx`、`lib/env.ts`。本番値の設定は Owner 作業。
  - fetch と SW/Push 例外を UI に表示し、成功レスポンス後だけオンにする: `components/notification-settings.tsx`。
  - 匿名 upsert/解除を完結させるサーバー経路を決める: `app/api/push/subscribe/route.ts`、`app/api/push/unsubscribe/route.ts`。RLS 変更が必要なら別途仕様化が必要。
  - 関連テスト: `tests/components/notification-settings.test.tsx` と push API テスト。

## メール購読

### 入口

#### 所見 M-1: ログイン不要の入口は 3 ページに実装され、頻度・内容・ダブルオプトインを明示している

- 確信度: **確実**
- 根拠: `components/newsletter-signup.tsx:5-9,43-75`、`app/page.tsx:315-329`、`app/calendar/page.tsx:220-245`、`app/c/[competition]/[season]/page.tsx:715-740`
- 実測: `<NewsletterSignup` の呼び出しは **3 箇所**。
- 検索コマンド: `rg -n '<NewsletterSignup' app components -g '*.tsx'`
- 結果: `/`、`/calendar`、`/c/[competition]/[season]` に各 1 件。
- 到達位置:
  - `/calendar`: ページ上部の説明・カレンダー購読・iOS CTA と同じ 3 列ブロック内。DOM 上は主コンテンツより前。
  - `/c/[competition]/[season]`: ヒーロー内の iCal 導線直下。順位・試合一覧より前。
  - `/`: ヒーローと `HomepageFavoriteTeams` の後、注目大会より前。3 面中では最も下にある。
- 判定: Web Push と違い、入口の認証壁はない。「メールフォームが露出していない」は誤り。

### 登録処理の経路

#### 所見 M-2: 登録 → 確認メール → 24 時間以内の確認 → confirmed 保存は完結している

- 確信度: **確実**
- 根拠: `components/newsletter-signup.tsx:14-40`、`app/api/newsletter/subscribe/route.ts:29-97`、`lib/newsletter.ts:34-87`、`app/api/newsletter/confirm/route.ts:5-51`、`supabase/migrations/20260810090000_create_email_subscribers.sql:1-17`
- 経路: ログイン不要フォーム → server-side validation/rate limit → service role upsert (`pending`) → Resend 確認メール → token 検証 → `confirmed`。
- 与えられた「全 1 件、confirmed 1 件」は、少なくとも 1 人についてこの経路が最後まで動いたことを示す。
- 配信停止も subscriber ID を含む全メールフッターから service role 更新まで接続されている（`lib/newsletter.ts:20-31`、`app/api/newsletter/unsubscribe/route.ts:9-41`）。

#### 所見 M-3: フォーム露出から confirmed までの離脱点を計測するイベントが無い

- 確信度: **確実**
- 根拠: `components/newsletter-signup.tsx:9-40`、`lib/analytics.ts:17-46`
- 検索コマンド: `rg -n 'trackNewsletter|newsletter_(submit|subscribe|confirm)|track(Event|CtaClick)\([^\n]*newsletter' app components lib -g '*.ts' -g '*.tsx'`
- 結果: **0 件**。
- 影響: 表示数、入力開始、送信成功、確認完了を分離できない。登録 1 件が「文言」「位置」「信頼」「フォーム/API エラー」のどこで決まったか、コードと GA4 の一般セッション数だけでは断定できない。

### 送信側

#### 所見 M-4: メール送信関数は confirmed のみを対象にし、個別失敗を集計する

- 確信度: **確実**
- 根拠: `lib/newsletter.ts:89-140`、`app/api/cron/weekly-digest/route.ts:222-243`、`lib/llm/notify.ts:258-268`
- 経路: 週次原稿生成 → Discord 投稿 → `status = confirmed` の購読者取得 → Resend → 成功/失敗件数のログと ops 通知。
- `RESEND_API_KEY` が無い場合は `skipped: true` で正常終了する（`lib/newsletter.ts:92-97`）。本番設定の有無はコードから判断できない。

#### 所見 M-5: 週次 cron は Vercel の GET とルートの POST が不一致で、自動実行できない

- 確信度: **確実**
- 根拠: `vercel.json:1-5`、`app/api/cron/weekly-digest/route.ts:164-171`
- 実測: `vercel.json` は `/api/cron/weekly-digest` を毎週月曜 12:00 UTC に登録するが、route export は `POST` だけで `GET` が無い。
- 検索コマンド: `rg -n '^export async function GET' app/api/cron/weekly-digest/route.ts`
- 結果: **0 件**。
- 検索コマンド: `rg --files .github/workflows | rg 'weekly-digest'`
- 結果: **0 件**。POST で代替実行する GitHub Actions workflow も無い。
- 外部仕様確認: Vercel Cron は設定された path へ HTTP GET を送る（[Vercel Cron Jobs 公式ドキュメント](https://vercel.com/docs/cron-jobs)）。したがって現行 route は scheduled GET を処理せず、2026-08-17/24 の自動メール配信が成功したとはコード上判断できない。むしろ手動 POST が無い限り未実行となる。

#### 所見 M-6: Discord webhook が無いとメール処理にも到達しない

- 確信度: **確実（分岐）／本番設定は要確認**
- 根拠: `app/api/cron/weekly-digest/route.ts:164-171,222-236`、`tests/api/weekly-digest.test.ts:148-161`
- 影響: `DISCORD_WEBHOOK_WEEKLY_DIGEST` 未設定時は、Resend が設定済みでも原稿生成前に return し、メールを送らない。メールと Discord を「両方へ送る」実装だが、メールは Discord の設定に依存している。

### 1 件である原因（確信度つき）

1. **登録経路の全面故障ではない。** 確信度: **確実**。1 件が confirmed まで到達しており、pending の滞留も与えられた数値にはない。
2. **最も可能性が高いのは、フォーム送信前の低転換（価値認識・タイミング・信頼・母数の組み合わせ）。** 確信度: **推測**。3 面に露出していても、計測イベントが無いため要因を分離できない。
3. **週次配信の未実行は登録数 1 の直接原因ではないが、登録後の価値提供と再訪を止めている。** 確信度: **確実**。scheduled GET と POST-only handler の不一致による。

### 動く状態にするための最小の変更（規模感・触るファイル）

- 規模感: **S**（配信復旧）／登録率の原因計測まで含めるなら **M**。
- 配信復旧の最小範囲:
  - `app/api/cron/weekly-digest/route.ts` に Vercel Cron が呼べる `GET` を接続する（既存処理を共通 handler に寄せ、手動 POST を残すかは仕様判断）。
  - 同 route で Discord 未設定時にもメールを独立実行できるよう依存を外す。
  - `tests/api/weekly-digest.test.ts` に scheduled GET と Discord 未設定時のメール動作を追加する。
- 原因計測を足す場合: `components/newsletter-signup.tsx`、`lib/analytics.ts` で source 別の表示／送信成功／エラーを記録する。施策の優先順位やコピー変更は本監査では決めない。

## iOS Push

### 入口

#### 所見 I-1: サーバー API はログイン不要だが、iOS の許可 UI は別リポジトリのため現在状態を確認できない

- 確信度: **サーバー側は確実／クライアント側は要確認**
- 根拠: `app/api/v1/push/register/route.ts:11-19,38-57`、`specs/feat-ios-push-notifications.md:13-15,83-90,123-146`
- API は Bearer token を任意とし、未ログインなら `user_id: null` で登録する。
- 仕様上の入口は、(a) お気に入り初回保存後の文脈的プロンプト、(b) 設定画面の 2 トグル（`specs/feat-ios-push-notifications.md:125-140`）。ただしこれは仕様であり、現在の `tryline-mobile` 実装の証拠ではない。
- URL/スクロール: ネイティブアプリのため Web URL とスクロール回数は該当しない。設定画面またはお気に入り保存操作からの入口となる。
- 与えられた 2 トークンは、少なくとも 2 Expo token の client → API → DB 経路が本番で成立したことを示す。

### 登録処理の経路

#### 所見 I-2: tryline サーバー側の token 登録・更新・解除は完結している

- 確信度: **確実**
- 根拠: `app/api/v1/push/register/route.ts:11-57`、`app/api/v1/push/unregister/route.ts:10-43`、`supabase/migrations/20260714090000_create_expo_push_notifications.sql:1-45`
- 経路: Expo token payload → Zod validation → optional auth → service role upsert by token。通知設定と `team_slugs` も同じ upsert で同期する。
- DB は client role を revoke し、API/cron の service role だけが読み書きする。Web Push の匿名 RLS 問題はこの経路には無い。

#### 所見 I-3: 空の `team_slugs` は登録できるが、配送対象には一度もならない

- 確信度: **確実**
- 根拠: `app/api/v1/push/register/route.ts:11-17,40-50`、`lib/push/notifications.ts:92-93,140-155`、`specs/feat-ios-push-notifications.md:99-101,133-140`
- API validation は空配列を許可する。sender は `overlaps("team_slugs", [home, away])` だけで抽出するため、空配列は prematch/content のどちらにも一致しない。
- 影響: 2 トークンが存在しても、両方の `team_slugs` が空なら実配送は 0。実際の列値は本番 DB に接続していないため不明。

### 送信側

#### 所見 I-4: 毎時・30 分ごとの cron から Expo 送信まで接続されている

- 確信度: **確実**
- 根拠: `.github/workflows/cron-send-prematch-notifications.yml:1-18`、`.github/workflows/cron-send-content-notifications.yml:1-18`、`app/api/cron/send-prematch-notifications/route.ts:10-30`、`app/api/cron/send-content-notifications/route.ts:9-22`、`lib/push/notifications.ts:231-264,298-390`、`lib/push/expo.ts:20-60`
- prematch: 毎時、KO 30〜90 分前の試合を対象。
- content: 30 分ごと、直近 24 時間に公開された preview/recap を対象。
- 両方とも CRON_SECRET で認証し、team filter、重複防止、Expo chunk 送信、`DeviceNotRegistered` token 削除まで実装済み。
- 実行環境の `CRON_SECRET`、workflow 成否、Expo の本番レスポンスはコードから判断できない。

#### 所見 I-5: `push_notification_log` 37 行は処理到達の形跡だが、配送数の証拠ではない

- 確信度: **確実**
- 根拠: `lib/push/notifications.ts:182-217,242-260,355-385`、`lib/push/expo.ts:20-25,57-60`、`supabase/migrations/20260714090000_create_expo_push_notifications.sql:32-45`
- sender は token 配列が空でも `sendExpoPushNotifications([])` を呼び、同関数は `{ sentCount: 0 }` を成功返却する。その後 `sendForMatch` は `sent_count: 0` の log 行を insert する。
- `push_notification_log` の書き込み元は本番コード上で `lib/push/notifications.ts:203` の 1 件だけであり、Web Push はこのテーブルを使わない。
- 検索コマンド: `rg -n 'push_notification_log' app components lib public .github scripts -g '!*.env*'`
- 判定: 37 行は iOS cron/send path が少なくとも log insert まで進んだ形跡。ただし `sent_count` の合計・分布が無ければ、0 通か 1 通以上かは分からない。

#### 所見 I-6: `sent_count` は Expo が受理した件数ではなく、投入した message 数である

- 確信度: **確実**
- 根拠: `lib/push/expo.ts:27-59`、`lib/push/notifications.ts:197-207`
- 実測: Expo ticket の status が error でも、`sentCount` は `messages.length`。`DeviceNotRegistered` 以外の error ticket は失敗集計されない。
- 影響: `sent_count > 0` を確認できても端末到達の保証にはならない。ただし `sent_count = 0` と `> 0` の区別には使える。

### 2 件に留まる原因（確信度つき）

1. **サーバー登録 API の全面故障ではない。** 確信度: **確実**。本番に 2 token がある。
2. **最も可能性が高い原因は、モバイル側の利用母数・通知許可・お気に入り同期のいずれかで登録機会が少ないこと。** 確信度: **推測**。入口は別リポジトリで、本監査から現在の表示条件や許可率を確認できない。
3. **登録済み 2 token が実配送対象外である可能性がある。** 確信度: **要確認**。`team_slugs = '{}'` または通知トグル false ならコード上必ず除外されるが、本番列値は未確認。

### 動く状態にするための最小の変更（規模感・触るファイル）

- 規模感: **S（サーバーの可観測性）**。モバイル導線修正が必要かは現時点で規模判定不可。
- まずコード変更なしで Owner が `expo_push_tokens` の `team_slugs`・2 トグルと、37 log の `sent_count` を確認する。これで「登録だけ」「Expo へ 1 件以上投入」のどちらかを切り分けられる。
- サーバー側の最小変更候補:
  - token 0 件の match を成功配送として log するかを明示し、`sent_count = 0` を summary で区別する: `lib/push/notifications.ts`、`tests/api/ios-push-cron.test.ts`。
  - Expo error ticket を failed として集計する: `lib/push/expo.ts`、同テスト。
- mobile 側の token/team sync が原因なら、触るのは別リポジトリの通知設定・お気に入り同期コードである。本リポジトリの履歴仕様は `specs/feat-ios-push-notifications.md:123-146` と `specs/fix-mobile-ios-audit-findings-batch8.md:9,17-19,29-34` だが、現在実装を読まずに具体的変更を断定しない。

## 3手段の比較

| 手段     | 入口の到達しやすさ                                                      | 実装の完成度                                                                                 | 与えられた本番件数から言えること                          | 最小変更の規模                   |
| -------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| Web Push | 低い。設定はログイン済みヘッダーメニュー内。公開 CTA はホーム空白期だけ | 登録・送信の骨格は接続済み。ただし公開鍵契約、エラー処理、匿名 update/delete、送信履歴に欠落 | 0 件なので登録 API まで完走した endpoint は無い           | M                                |
| メール   | 高い。ログイン不要で `/`、`/calendar`、大会シーズンハブに露出           | 登録・確認・解除・送信関数は完成。scheduled GET と POST handler の不一致で自動配信は停止     | 1 confirmed は登録経路が完走した証拠                      | S（配信復旧）／M（原因計測込み） |
| iOS Push | Web からは評価不能。仕様上はお気に入り保存後と設定画面                  | サーバー API・DB・2 cron・Expo sender は接続済み。client は別 repo                           | 2 token は登録成功。37 log は処理到達だが配送証明ではない | S（可観測性）。client は要調査   |

## コードからは判断できないこと

以下は Owner 側で確認が必要。値そのものを本レポート作成中に取得していない。

1. **本番環境変数の設定有無**
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` が実際に存在するか。
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` の 3 値が整合しているか。
   - `RESEND_API_KEY`、`DISCORD_WEBHOOK_WEEKLY_DIGEST`、`DISCORD_WEBHOOK_OPS` が設定済みか。
   - GitHub Actions の `CRON_SECRET` と Vercel の `CRON_SECRET` が一致するか。
2. **実行ログ**
   - Vercel Cron の 2026-08-17・24 の `/api/cron/weekly-digest` が 405 になったか。静的コードからは 405 が予想されるが、実ログは未確認。
   - iOS の 2 workflow が scheduled run で成功しているか、37 log が schedule と手動実行のどちらで作られたか。
   - Web Push sender が過去に呼ばれたか。専用 DB log が無いので Vercel logs が必要。
3. **与えられた DB 件数の内訳**
   - `expo_push_tokens` 2 行の `team_slugs`、`notify_prematch`、`notify_content`、`last_used_at`。
   - `push_notification_log` 37 行の `sent_count` 合計と、0／1 以上の行数。
   - メール 1 件の `source` と日時。依頼文の「1（confirmed 1）」から pending は 0 と解釈したが、詳細行は未確認。
4. **ユーザー行動**
   - CTA の表示回数、フォーム入力開始、ブラウザ許可拒否、API エラー、確認メール開封。現状は必要な funnel event が無いため分離できない。
   - 実スクロール回数と fold 内外。これは viewport と動的コンテンツに依存する。
5. **iOS クライアントの現在実装**
   - 通知許可プロンプト、設定トグル、token 再登録、ゲストお気に入り同期、通知タップ遷移。`tryline-mobile` は別プロジェクトであり、本監査では参照していない。

## 結論

- Web Push の 0 件は、**ログイン内側の露出**だけでなく、**公開鍵の環境契約不一致と失敗を隠す UI**も併存する。現状を「動くが誰も押していない」とは判定できない。
- メールの登録経路は実際に 1 回完走しており、低登録数は導線故障より登録前転換の問題である可能性が高い。ただし、**登録後の週次自動配信は GET/POST 不一致で止まっている**。
- iOS は 3 手段で最もサーバー経路が揃っている。次の判断材料は件数ではなく、2 token の filter 列と 37 log の `sent_count` である。
