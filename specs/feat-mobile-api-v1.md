# feat-mobile-api-v1: iOS アプリ向け読み取り BFF（/api/v1）

## 背景

D014 により iOS アプリ（Expo、別リポジトリ `tryline-mobile`）を開発する。現在の Web は App Router の RSC が `lib/db/queries/*` を直接呼ぶ構成で、モバイルクライアントが利用できる読み取り API がほぼ存在しない（既存 `app/api` は Stripe / push / chat / cron / iCal / `me/premium` / `recap-locked` のみ）。

本 spec は既存 Next.js 上に versioned な薄い BFF（`/api/v1/*`）を追加する。Supabase 直読み（RLS 前提）ではなく BFF を採る理由: (a) `lib/db/queries/*` の型付きクエリをそのまま再利用できる、(b) Premium ゲートのサーバー側強制（`fix-paywall-server-side-gating` の不変条件）を同じ場所で適用できる、(c) Vercel のキャッシュヘッダで試合単位キャッシュの不変条件をそのまま満たせる。

前提: `specs/feat-premium-entitlement-refactor.md` の完了後に着手する（Premium 判定は `isPremium()` を経由するため、順序が逆でも動くが、テストの二度手間を避ける）。

## スコープ

対象:
- 読み取りエンドポイント: カレンダー / 試合詳細 / 試合コンテンツ（Premium ゲート付き）/ 大会一覧 / 順位表
- 認証付きエンドポイント: `/api/v1/me`（プロフィール＋Premium 状態）、お気に入り更新
- Bearer トークン認証ヘルパー
- レスポンス型定義ファイル（tryline-mobile と共有するコントラクト）

対象外:
- アプリ本体（別 spec、p0 完了後に起票）
- push 通知の登録・配信（既存 `/api/push/*` と APNs 拡張の別 spec）
- AI チャット / IAP / アカウント削除 API（アカウント削除はアプリ本体 spec で扱う）
- ネタバレ防止のデータ加工（スコア非表示はクライアント側の表示制御。API はデータをそのまま返す）
- 既存 Web ページ・既存 API の変更（純追加のみ）
- CORS 対応（ネイティブアプリはブラウザ CORS の対象外。ブラウザからの `/api/v1` 利用は想定しない）

## データモデル変更

なし。既存テーブルの読み取りと `user_profiles.favorite_team_slugs` の更新のみ。

## API サーフェス

全レスポンスは共通エンベロープ `{ "success": boolean, "data": T | null, "error": string | null }`。エラーは 400（バリデーション）/ 401（認証必須で未認証）/ 404（リソースなし）を使い分ける。

### 認証

- `Authorization: Bearer <Supabase アクセストークン>` を受け取り、`supabase.auth.getUser(token)` で検証するヘルパー `getUserFromBearer(request)` を `lib/auth/` に追加する（既存の cookie ベース `getUser()` は変更しない）
- 公開エンドポイントは匿名アクセス可。`/api/v1/me` 系のみ認証必須

### エンドポイント一覧

| ルート | メソッド | 認証 | 再利用する既存クエリ |
|---|---|---|---|
| `/api/v1/calendar` | GET | 不要 | `getMatchesInRange`（`lib/db/queries/matches.ts`）|
| `/api/v1/matches/[id]` | GET | 不要 | `getMatchById` + `getMatchEventsForMatch` + `getMatchLineupsForMatch` |
| `/api/v1/matches/[id]/content` | GET | 任意 | `getPublishedContentForMatch`（`lib/db/queries/match-content.ts`）+ `isPremium` |
| `/api/v1/competitions` | GET | 不要 | `listFamilies` + `listSeasonsByFamily`（`lib/db/queries/competitions.ts`）|
| `/api/v1/competitions/[slug]/standings` | GET | 不要 | `getCompetitionBySlug` + `getStandingsForCompetition`（pool 制大会は `getPoolStandingsForCompetition`）|
| `/api/v1/me` | GET | 必須 | `getUserProfile` + `isPremium` |
| `/api/v1/me/favorites` | PUT | 必須 | `app/api/user/profile/route.ts` のバリデーション・更新パターンを踏襲 |

### 各エンドポイントの要点

**GET `/api/v1/calendar?from=2026-07-13&to=2026-07-19`**
- `from`/`to` は ISO 8601 日付。省略時は JST 基準の今週（月〜日）。範囲は最大 31 日、超過は 400
- 返すフィールド: 試合 ID、大会（slug・日本語名）、両チーム（slug・日本語名・スコア）、キックオフ日時（UTC の ISO 8601、タイムゾーン変換はクライアント側）、試合ステータス、`broadcast_jp_url`、preview/recap の有無フラグ
- コンテンツ有無フラグは `getContentStatusForMatches`（`lib/db/queries/match-content.ts`）を再利用

**GET `/api/v1/matches/[id]`**
- 試合基本情報＋イベント＋ラインナップ＋`broadcast_jp_url`。存在しない ID は 404

**GET `/api/v1/matches/[id]/content`**
- preview と recap の公開済みコンテンツを返す。**Premium ゲートはサーバー側で強制**し、`app/api/matches/[id]/recap-locked/route.ts` の判定ロジック（無料公開部分と locked 部分の分割）と同一の結果になること。非 Premium には locked 部分の Markdown を**レスポンスに含めない**（クライアント側で隠すのは不可）
- レスポンスに `isPremium` と `locked: boolean` を含め、クライアントがペイウォール表示を判断できるようにする

**GET `/api/v1/me`**
- `display_name`、`favorite_team_slugs`、`isPremium` を返す

**PUT `/api/v1/me/favorites`**
- ボディ `{ "favorite_team_slugs": string[] }`。既存 `app/api/user/profile/route.ts` と同じバリデーション（配列チェック・要素の型チェック）と上限を適用し、同じ更新を行う

### キャッシュ

- 公開 GET: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`（試合単位キャッシュの不変条件に適合。コンテンツは試合単位で生成済みのものを配信するだけで、ユーザー単位の生成は発生しない）
- `/api/v1/me` と `/api/v1/matches/[id]/content`: `Cache-Control: private, no-store`（認証状態でレスポンスが変わるため CDN キャッシュ禁止）

### バージョニング

- `/api/v1` のレスポンス形は公開後凍結する（App Store には古いアプリバージョンが残り続けるため）。フィールド追加は可、削除・意味変更は `/api/v2` を切る

### 型の共有

- 各エンドポイントのレスポンス型を `lib/api/v1/types.ts` に集約して定義し、route 実装はこの型を import する。`tryline-mobile` はこのファイルをコピーして利用する（コントラクトの単一ソース）

## UI サーフェス

なし（API のみ。UI は tryline-mobile 側の別 spec）。

## LLM 連携

なし。既存の公開済みコンテンツを配信するだけで、LLM 呼び出しの追加はゼロ。Web と iOS は同一のコンテンツを配信する（クライアント別の別生成は設計不変条件違反）。

## 受け入れ条件

1. `GET /api/v1/calendar`（パラメータなし）が JST 今週の試合を返し、各試合に大会名・チーム名（日本語）・キックオフ UTC・コンテンツ有無フラグが含まれる
2. `GET /api/v1/calendar?from=X&to=Y` で範囲指定が効き、`to - from > 31日` のとき 400 を返す
3. `GET /api/v1/matches/[実在ID]` がイベント・ラインナップを含む試合詳細を返し、存在しない UUID には 404 を返す
4. `GET /api/v1/matches/[id]/content` について:
   - 匿名リクエスト: locked 部分の Markdown がレスポンスボディに一切含まれない（文字列検索で検証）
   - 非 Premium ユーザーの Bearer 付きリクエスト: 同上
   - Premium ユーザー（`premium_until` が未来）の Bearer 付きリクエスト: 全文が返る
   - 同一試合・同一認証状態で Web の表示内容（`recap-locked` 経由）とコンテンツが一致する
5. `GET /api/v1/me` が Bearer なしで 401、正しい Bearer で `favorite_team_slugs` と `isPremium` を返す
6. `PUT /api/v1/me/favorites` が配列以外のボディに 400 を返し、正しいボディで `user_profiles.favorite_team_slugs` が更新される
7. 公開 GET のレスポンスヘッダに `s-maxage` が付き、`/api/v1/me`・`/content` には `no-store` が付く
8. 全レスポンスが `{ success, data, error }` エンベロープに従う
9. 各エンドポイントの統合テストが追加され、既存テストが全て pass する
10. 既存の Web ページ・既存 API ルートに変更がない（`git diff` が `app/api/v1/`・`lib/api/v1/`・`lib/auth/`（ヘルパー追加）・テストのみ）

## 未解決の質問

1. **レート制限**: ~~v1 公開時点では Vercel の既定保護に依存し専用実装は見送る想定でよいか~~ → **決着（2026-07-14、Owner 承認）**: 専用実装は見送り、Vercel の既定保護＋CDN キャッシュに依存する。根拠: 本 API に LLM 呼び出しはなく乱用時の被害は軽微な従量課金に限定、公開 GET は CDN が吸収、唯一の匿名×no-store である `/content` も乱用観測時に Vercel Firewall のレートリミットルールをコード変更なしで追加可能。運用条件: Vercel の利用量アラート（Spend Management)を有効にしておく（Owner 作業）
2. **順位表のない大会**（RWC プール戦前など）のレスポンス形: 空配列 vs 404 — 実装時に既存 Web の扱いに合わせて決定し、spec に追記する
3. **`lib/api/v1/types.ts` の同期方法**: 当面は手動コピーとし、乖離が問題になったら npm workspace 化や codegen を検討（v1 では作り込まない）
