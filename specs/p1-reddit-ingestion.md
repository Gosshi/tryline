# Reddit スレッド取り込み（p1-reddit-ingestion）

## 背景

`p1-content-pipeline.md` 段階 3「Reddit フィルタ」は r/rugbyunion のマッチスレッド（pre-match thread / post-match thread）の投稿・コメントを LLM でフィルタする前提です。そのため本仕様書は、**r/rugbyunion から試合単位でスレッドを特定し、生 JSON を `match_raw_data` に保存する**取り込みのみを対象にします。フィルタ・要約・スコアリングは content-pipeline 側で扱います。

Reddit は Wikipedia と異なり公開 API（`oauth.reddit.com`）が整備されており、ToS で scraping よりも API 利用が推奨されています。HTML スクレイピングは行わず、Reddit API を OAuth2 (client_credentials = application-only) で叩きます。

## スコープ

対象:
- Reddit OAuth2 (client_credentials) でのトークン取得・キャッシュ
- r/rugbyunion の検索 API でマッチスレッドを特定
- 対象スレッドの投稿本体 + 上位コメント（score 降順、上位 50 件まで）の取得
- 生 JSON を `match_raw_data` に `source = 'reddit'` で保存
- cron エンドポイント `POST /api/cron/ingest-reddit`
- `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` の環境変数追加と zod バリデーション
- `lib/scrapers/fetcher.ts` の `fetchWithPolicy` を経由（Bearer ヘッダーは上乗せ）
- 単体テスト（モック Reddit API に対する検索ロジック・レスポンス parser の検証）

対象外:
- 投稿・コメントのフィルタ・スコアリング・日本語要約（`p1-content-pipeline.md` 段階 3 で実施）
- ユーザー認証付き Reddit（script type app / password flow）
- r/rugbyunion 以外のサブレディット（r/irishrugby 等の国別コミュニティは後続仕様書で）
- Reddit へのコメント投稿・クロスポスト
- コメントツリーの全展開（本 PR ではトップレベル + 直下 1 階層まで）
- admin UI / 再取り込みボタン
- Vercel Cron 設定（`vercel.json`、`p0-foundation.md` 方針に従い対象外）
- 削除・復活（deleted / removed）コメントの履歴管理
- 実ネットワーク（Reddit API）を叩くテスト

## 前提となる Owner 側アクション（実装開始前）

Codex 単独では進められません。Owner が以下を完了してから Codex に実装依頼してください:

1. Reddit で「script type」ではなく「**web app**」または「**installed app**」として新規 app を登録（https://www.reddit.com/prefs/apps）
2. `client_id`（14 文字）と `client_secret`（27 文字）を取得
3. `.env.local` に以下を設定（**Codex には秘密情報を渡さない**):
   ```
   REDDIT_CLIENT_ID=...
   REDDIT_CLIENT_SECRET=...
   ```
4. User-Agent は既存の `SCRAPER_USER_AGENT`（`p0-foundation.md` で定義済み）を流用。Reddit の ToS に従い `by /u/<reddit-username>` を含めた descriptive string を Owner が設定しておく

## データモデル変更

**なし**。`match_raw_data` の既存スキーマで受ける（`p1-data-model.md` の定義）。

- `source`: 固定文字列 `'reddit'`
- `source_url`: スレッドの permalink（例: `https://reddit.com/r/rugbyunion/comments/abc123/match_thread_ireland_v_england/`）
- `payload`: 後述「payload 構造」

## payload 構造

```typescript
type RedditRawPayload = {
  threadType: 'pre_match' | 'post_match' | 'unknown';
  fetchedAt: string;                    // ISO UTC
  post: {
    id: string;                         // t3_xxxxxx
    title: string;
    selftext: string;
    author: string | null;              // [deleted] の場合 null
    score: number;
    upvoteRatio: number;
    createdUtc: number;                 // Unix epoch seconds
    permalink: string;
    url: string;
    numComments: number;
  };
  comments: Array<{
    id: string;                         // t1_xxxxxx
    parentId: string;
    author: string | null;
    body: string;                       // [removed] / [deleted] はそのまま保存
    score: number;
    createdUtc: number;
    depth: 0 | 1;                       // 本 PR では 0 と 1 のみ
  }>;
};
```

Reddit API の生レスポンス全体ではなく、上記の shape に正規化してから保存する（payload サイズ削減 + LLM 段の入力を安定させる）。

## モジュール構成

```
/lib/reddit
  auth.ts                  — OAuth2 client_credentials トークン取得 + キャッシュ
  client.ts                — fetchReddit(path, options) ラッパー
  search.ts                — searchMatchThreads({ home, away, kickoffAt }) → Thread 候補配列
  fetch-thread.ts          — fetchThread(permalinkOrId) → RedditRawPayload
/lib/ingestion/sources
  reddit-rugbyunion.ts     — 高レベル取り込み関数 ingestRedditForMatch(matchId)
/app/api/cron
  ingest-reddit/route.ts   — POST cron エンドポイント
```

既存 `lib/scrapers/` の `fetchWithPolicy` を流用。`lib/reddit/client.ts` は `fetchWithPolicy` を呼び、Authorization: Bearer ヘッダと `oauth.reddit.com` ベース URL を上乗せする。

## OAuth2 トークン管理（`lib/reddit/auth.ts`）

```typescript
export async function getRedditAccessToken(): Promise<string>;
```

- `POST https://www.reddit.com/api/v1/access_token` に Basic Auth（`client_id:client_secret` の base64）で `grant_type=client_credentials` を送る
- レスポンスの `access_token` をプロセス内メモリにキャッシュ（TTL: `expires_in` の 90%、通常 ~54 分）
- キャッシュ失効時は再取得
- 失敗時（401 / ネットワーク）は `FetchError` を throw
- キャッシュは in-memory のみ（複数プロセス間共有は不要）

## 検索仕様（`lib/reddit/search.ts`）

```typescript
export async function searchMatchThreads(params: {
  home: string;             // e.g. 'Ireland'
  away: string;             // e.g. 'England'
  kickoffAt: Date;          // UTC
}): Promise<ThreadCandidate[]>;

type ThreadCandidate = {
  id: string;                   // t3_xxxxxx
  permalink: string;
  title: string;
  createdUtc: number;
  score: number;
  threadType: 'pre_match' | 'post_match' | 'unknown';
  titleMatchScore: number;       // 0.0 〜 1.0
};
```

- エンドポイント: `GET /r/rugbyunion/search.json?q=<query>&restrict_sr=true&sort=new&t=week&limit=25`
- クエリ: `title:"<home>" title:"<away>"`（Reddit 検索の title: フィルタ）
- 候補を以下で絞り込み:
  - タイトルに home / away チーム名が両方含まれる（大文字小文字無視、完全一致）
  - `createdUtc` が `kickoffAt - 72h` 〜 `kickoffAt + 48h` の範囲
  - `score >= 10`（bot 投稿・重複投稿を雑に除外）
- `threadType` の判定（タイトル小文字化して）:
  - 含まれる → `pre_match`: `match thread`, `matchthread`, `game thread`
  - 含まれる → `post_match`: `post match thread`, `post-match`, `full time thread`, `ft thread`
  - どれにも該当しなければ `unknown`
- `titleMatchScore` は簡易ヒューリスティック: `0.5 + 0.25 * (home 一致) + 0.25 * (away 一致)` 程度でよい（精緻化は後続）
- 結果は `score` 降順で返す

## スレッド取得（`lib/reddit/fetch-thread.ts`）

```typescript
export async function fetchThread(permalink: string): Promise<RedditRawPayload>;
```

- エンドポイント: `GET <permalink>.json?limit=100&sort=top&depth=1`
- レスポンス（配列 2 要素: 投稿本体 listing + コメント listing）を parse して `RedditRawPayload` に正規化
- 上位 50 コメントに絞る（score 降順、深さ 0 と 1 のみ）
- `MoreChildren` 展開はしない（`more` オブジェクトはスキップ）
- `body` は生テキスト（markdown）を保存、HTML 化はしない

## 高レベル取り込み（`lib/ingestion/sources/reddit-rugbyunion.ts`）

```typescript
export async function ingestRedditForMatch(matchId: string): Promise<{
  savedThreads: number;
  candidates: number;
  errors: string[];
}>;
```

処理:
1. `matches` から `matchId` の home/away チーム名 + kickoff_at を取得
2. `searchMatchThreads` で候補を取得
3. 上位 2 件（pre_match 最高スコア 1 件 + post_match 最高スコア 1 件）を選択。`unknown` は保存しない
4. それぞれ `fetchThread` で本文 + コメント取得
5. `saveRawData` で `match_raw_data` に insert（`source='reddit'`、`source_url=permalink`、`payload=<normalized>`）
6. 件数と errors（該当なしの場合 empty）を返す

候補 0 件はエラーではなく正常系として扱い、`errors` ではなく `savedThreads: 0` で報告。

## API サーフェス

### `POST /api/cron/ingest-reddit`

- 認可: `Authorization: Bearer <CRON_SECRET>`（既存 `assertCronAuthorized`）
- Body: なし
- 処理:
  1. `matches` テーブルから「kickoff_at が (now - 72h) 〜 (now + 48h) にある試合」を抽出
  2. 各試合について `ingestRedditForMatch(matchId)` を呼ぶ
  3. 並列度は 1（直列処理。Reddit API の rate limit を超えないため）
  4. 集計結果をレスポンス
- レスポンス:

```json
{
  "status": "ok",
  "matches_processed": 3,
  "threads_saved": 5,
  "candidates_total": 18,
  "errors": [],
  "duration_ms": 4231
}
```

- 認可失敗: 401 / `{ "error": "unauthorized" }`（既存 cron と一致）
- 個別試合の失敗は `errors` 配列に `{ matchId, message }` を積み、処理は続行（1 試合失敗で全体を止めない）

## 冪等性

- `match_raw_data` は unique 制約を貼らない方針（`p1-scraping-infra.md`）。同じスレッドを複数回取り込むと行が増える
- 連続実行で重複行が蓄積するが、`p1-data-retention.md` のクリーンアップで 7 日後に削除される
- 本 PR では「スキップロジック」を追加しない（「過去 24h 以内に同 permalink を保存済みならスキップ」等は後続仕様で検討）

## Rate limit と User-Agent

- Reddit OAuth の rate limit: 60 requests/minute/OAuth client。`fetchWithPolicy` のデフォルト 3000ms 間隔（20 req/min）で十分に下回る
- User-Agent: `SCRAPER_USER_AGENT` をそのまま使う。Reddit の ToS に従い `platform:tryline:v1 (by /u/<owner>)` 形式を Owner が設定する前提
- 429 が返った場合は `fetchWithPolicy` の既存リトライで対応

## エラーハンドリング

- OAuth トークン取得失敗（401 on `/api/v1/access_token`）: 実装停止、cron は 500 を返し `console.error`
- 検索 API 失敗（404、5xx）: 当該試合をスキップして次へ
- スレッドが見つからない（候補 0）: 正常系。errors に積まない
- レスポンス shape 不整合（Reddit API 破壊的変更）: `FetchError('structure-changed')` を throw、cron は 500 を返す

## 環境変数

追加:
- `REDDIT_CLIENT_ID` — Reddit app の client_id。必須
- `REDDIT_CLIENT_SECRET` — Reddit app の client_secret。必須

既存流用:
- `SCRAPER_USER_AGENT` — Reddit API 用 User-Agent
- `CRON_SECRET` — cron 認可
- `SUPABASE_SERVICE_ROLE_KEY` — service role 書き込み

`lib/env.ts` に `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` を追加し、zod 必須バリデーション。`.env.example` も更新。

## 依存パッケージ

**追加なし**。Reddit API は `fetchWithPolicy`（標準 `fetch` ベース）で叩ける。`snoowrap` 等の Reddit SDK は追加しない理由:
- 利用するエンドポイントは 3 本（token / search / thread）のみで SDK のメリットが薄い
- SDK 経由だと `fetchWithPolicy` のレート制限・リトライ・User-Agent 強制が効かない
- メンテコストを増やさない

## テスト戦略

- `tests/reddit/auth.test.ts`:
  - トークン取得成功 → access_token が返り、キャッシュがセットされる
  - キャッシュ有効期間内の 2 回目呼び出し → fetch が呼ばれない
  - 401 → `FetchError` を throw
- `tests/reddit/search.test.ts`:
  - 固定のモック search レスポンスから `ThreadCandidate` 配列が期待どおり返る
  - `threadType` 判定（pre_match / post_match / unknown）
  - 時間範囲外の投稿を除外する
- `tests/reddit/fetch-thread.test.ts`:
  - 固定のモック thread レスポンスから `RedditRawPayload` に正規化される
  - 上位 50 コメントに絞られる
  - `more` オブジェクトをスキップする
- `tests/ingestion/reddit-rugbyunion.test.ts`:
  - `ingestRedditForMatch` が検索→取得→保存の一連を実行し、`match_raw_data` に insert される（Supabase ローカル + fetch モック）
  - 候補 0 件で `savedThreads: 0` / `errors` 空を返す
- `tests/api/ingest-reddit.test.ts`:
  - Bearer 無しで 401
  - 正しい Bearer + matches テーブル空で 200 / `matches_processed: 0`
  - 個別試合の失敗を `errors` に積んで全体は続行

モックは `undici` の `MockAgent` または `vi.fn()` で fetch を差し替える方針（既存 `tests/scrapers/` パターン踏襲）。実ネットワークを叩くテストは作らない。

## 受け入れ条件

- [ ] `.env.example` と `lib/env.ts` に `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` が追加されている
- [ ] `POST /api/cron/ingest-reddit` が Bearer 無しで 401、正しい値で 200 を返す
- [ ] 対象期間内の matches が 0 件でも 200 と `matches_processed: 0` を返す
- [ ] 検索結果から `threadType = 'unknown'` のスレッドを `match_raw_data` に保存しない
- [ ] `match_raw_data.source = 'reddit'`、`payload` が `RedditRawPayload` shape で保存される
- [ ] `lib/scrapers/fetchWithPolicy` を経由している（直接 `fetch()` を呼んでいない）
- [ ] OAuth トークンがプロセス内でキャッシュされ、連続呼び出しで再取得されない
- [ ] 個別試合の取得失敗が全体を止めず、`errors` 配列に積まれる
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- [ ] 単体テスト 5 本（上記「テスト戦略」）が全て成功
- [ ] 実ネットワーク（Reddit API）を叩くテストが含まれていない
- [ ] 実装したファイルが `lib/reddit/`、`lib/ingestion/sources/`、`app/api/cron/ingest-reddit/` 配下に収まり、他モジュールへの侵食がない

## 未解決の質問

1. 候補スレッド選定の精度（pre_match / post_match の各 1 件を score 最高で採る）で実運用に耐えるか — 実データ（Six Nations 2027 開幕後）で Owner が検証し、必要なら `titleMatchScore` の重み付けを後続 PR で調整
2. r/rugbyunion 以外のサブレディット（r/irishrugby / r/welshrugby 等）の扱い — 本 PR では対象外、MVP ローンチ後のユーザーフィードバックで追加検討
3. コメントの深さ 2 以降を取り込むか（議論の枝葉まで見る必要があるか） — 本 PR では深さ 1 まで、content-pipeline 段階 3 で十分なシグナルが取れないと判明した時点で別 PR で検討
4. Reddit ToS 上、`payload` の永続保存（7 日以内）が許容範囲か — Owner が Reddit API Terms（https://www.reddit.com/wiki/api-terms）を確認。本 PR では `p1-data-retention.md` の 7 日クリーンアップに乗るため過度な保持は行わない
