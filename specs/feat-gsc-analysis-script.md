# GSC 分析スクリプト（Search Analytics + URL Inspection → tmp JSON）

## 背景

SEO 分析（検索アクセスの把握・index bloat の追跡）を会話内で効率化したい。第三者 MCP に GSC 認証情報を預けるのは避けたいため、自前の TS スクリプトで **read-only** 取得し、出力（`tmp/gsc/*.json`）を Claude が読んで分析する分業にする。

- スクリプト = 認証付き取得（Owner が実行、信頼境界は自分の中だけ）
- Claude = 出力ファイルを読んで分析・考察

これで「クエリ結果を毎回コピペ」する往復を消しつつ、MCP のような利便を信頼リスクなしで得る。関連: index bloat が SEO 第一ボトルネック（GSC 実測で薄い選手ページが登録の大半）、player ページは stats が無い限り noindex 済み。

## スコープ

対象:
- `tools/gsc-pull.ts`: Google Search Console API を read-only で叩き、以下を取得して `tmp/gsc/*.json` に出力する CLI スクリプト。
  1. **Search Analytics**: クエリ×ページ等の clicks / impressions / ctr / position
  2. **URL Inspection**: 指定 URL 群のインデックス状況（coverage / indexing state など）
- 認証: サービスアカウント（スコープ `webmasters.readonly`）
- URL 群: サイトの `sitemap.xml` をパス接頭辞でグルーピングし、グループごとに上限件数で URL Inspection（クォータ保護）
- `tmp/gsc/` を `.gitignore` に追加（出力は git 非追跡）

対象外:
- 本番アプリへの組み込み・HTTP ルート化
- Supabase への蓄積・cron 化（将来オプション。まずはオンデマンド）
- 書込系 API（Indexing API、submit/remove URL）
- 分析・可視化そのもの（Claude が出力を読んで担当）
- GA4（既存 analytics MCP でカバー済み）

## データモデル変更

なし（出力は `tmp/gsc/` 配下のファイルのみ）。

## CLI サーフェス

実行（既存ハーネス `tools/run-ts.cjs` に合わせる。`@/` エイリアス・引数パススルー対応）:

```
node --env-file=<env> tools/run-ts.cjs tools/gsc-pull.ts [options]
```

必要 env:
- `GSC_SITE_URL`: GSC プロパティ識別子。**`sc-domain:trylinerugby.com`**（推奨・ドメインプロパティ）。Search Analytics / URL Inspection API の `siteUrl` パラメータに使う。
- `GOOGLE_APPLICATION_CREDENTIALS`（または `GSC_SA_KEY_PATH`）: サービスアカウント JSON キーのパス。**リポジトリ外**に置く

サイトオリジン（sitemap 取得と URL Inspection の完全 URL 組み立てに使用）は **`@/lib/site` の `SITE_URL`（既定 `https://www.trylinerugby.com`）** を流用する。`sc-domain:` プロパティは単一 URL prefix を持たないため、API の `siteUrl`（プロパティ識別子）と、実 URL を作るオリジンは別物として扱うこと。

options:
- `--range <28d|7d|YYYY-MM-DD:YYYY-MM-DD>`（default `28d`）
- `--dims <query,page,country,device,date>`（default `query,page`）
- `--row-limit <N>`: Search Analytics 取得上限（default 1000、API 上限 25000 までページング可）
- `--inspect <groups>`: URL Inspection するグループ。カンマ区切り or `all` or `none`（default `none` ＝重い Inspection は明示時のみ）
- `--inspect-limit <N>`: グループあたり URL Inspection 上限（default 50、クォータ保護）

出力（`tmp/gsc/` 配下、実行時刻 or range でファイル名生成）:
- `search-analytics-<range>.json`: `{ meta: { siteUrl, range, dims, totalRows }, rows: [{ keys: {query?, page?, ...}, clicks, impressions, ctr, position }] }`
- `url-inspection-<timestamp>.json`: `[{ url, group, verdict, coverageState, indexingState, robotsTxtState, lastCrawlTime, googleCanonical, userCanonical }]`
- `summary-<timestamp>.md`: 人間/Claude が読む要約（上位クエリ・上位ページ、グループ別の「インデックス済み / 未登録」件数）

## LLM 連携

なし。スクリプトは取得のみ。分析は Claude が `tmp/gsc/` 出力を読んで実施する。

## セキュリティ（CLAUDE.md 準拠）

- スコープは **`webmasters.readonly` に固定**（操作を読み取りに限定）。GSC のユーザー権限は **"フル(Full)"** が必要 — **URL Inspection API は "制限付き" だと 403 になる**ため。Full でも readonly スコープなら書込 API は呼べない（二層防御）。GSC 権限は当該プロパティ内に閉じ、本番アプリ/Supabase/Stripe には触れない。
- **書込 API を一切呼ばない**（Indexing API 無効、submit/remove なし）。read-only であることをコードで担保（readonly スコープのみ要求）。
- SA キー JSON は**リポジトリ外**、env のパス参照のみ。スクリプトはキー内容を出力・ログしない。
- `tmp/gsc/` を `.gitignore` に追加し、取得データ・URL を**コミットしない**。
- 外部 API＋認証情報を使うため、**実行は Owner**（CLAUDE.md）。LLM コストは無し。
- URL Inspection クォータ（2000/日・600/分）に対し、**直列または低並列＋間隔（例 1〜2 並列・150ms 間隔）＋ `--inspect-limit`** で保護。Search Analytics のクォータにも配慮しページングは穏当に。

## 受け入れ条件

Codex が検証可能な粒度:

1. `tools/gsc-pull.ts` が `googleapis` を用い、`webmasters.readonly` スコープのサービスアカウント認証で Search Analytics を取得し `tmp/gsc/search-analytics-<range>.json` を出力する。
2. `--inspect <groups>` 指定時、サイトオリジン（`@/lib/site` の `SITE_URL`）の `sitemap.xml` を取得してパス接頭辞でグルーピングし、各グループ最大 `--inspect-limit` 件を URL Inspection して `tmp/gsc/url-inspection-*.json` を出力する。
3. URL Inspection はレート制御（低並列＋間隔）と `--inspect-limit` でクォータを保護する。
4. `--range` のパース（`28d` / `7d` / `YYYY-MM-DD:YYYY-MM-DD`）が正しく、`--dims` が API に反映される。
5. 認証情報・取得データが一切コミットされない: `tmp/gsc/` が `.gitignore` に追加され、SA キーは env パス参照のみ。
6. 書込 API 呼び出しが存在しない（read-only）。
7. スクリプト冒頭コメント or `tools/README` に実行例・env 要件・必要権限（GSC に SA を制限付き追加）を記載。
8. ユニットテスト: `--range`/`--dims` パース、sitemap のグルーピング、出力整形（Search Console API はモック）。実 API は叩かない。

## 確定事項（Owner が推奨採用、2026-06-21・実ルート確認済み）

1. **GSC プロパティ形式**: **`sc-domain:trylinerugby.com`**（ドメインプロパティ。www/non-www・http/https を包含）。正規ドメインは `lib/site.ts` の `https://www.trylinerugby.com`。
2. **URL グループ定義**: 実ルートに合わせ、グループ名→接頭辞マップを**スクリプト内定数**（変更容易な形）で定義:
   - `players` → `/players/`
   - `teams` → `/teams/`, `/t/`
   - `competitions` → `/competitions/`, `/c/`
   - `matches` → `/matches/`
   - `h2h` → `/h2h/`
   - sitemap に出現する URL のみ対象。`/t/`↔`/teams/`、`/c/`↔`/competitions/` の二系統 URL は重複 URL（index bloat）観点で別カウントできるよう、接頭辞単位の内訳も summary に残すと良い。
3. **認証方式**: **サービスアカウント**（headless 向き）。スコープ `webmasters.readonly`。GSC へは **"フル(Full)" ユーザー**で追加（URL Inspection 要件）。SA 作成と追加は Owner 作業。
4. **デフォルト値**: `--range 28d` / `--inspect-limit 50` / `--dims query,page`。
5. **env ファイル**: GSC 用は**専用ファイル `.env.gsc.local`**（`GSC_SITE_URL` と SA キーパス）。本番 Supabase キー等と混在させない（最小権限）。`.gitignore` 済みを確認。

### Owner のセットアップ作業（着手と並行で可）

- Google Cloud で SA 作成 → JSON キー発行（リポジトリ外に保存）。
- Search Console（`trylinerugby.com` プロパティ）の「設定 > ユーザーと権限」で SA メールを **"フル(Full)"** で追加（URL Inspection に必要。readonly スコープで操作は読み取りに限定される）。
- Search Console API（および URL Inspection）を Google Cloud プロジェクトで有効化。Indexing API は有効化しない。
- `.env.gsc.local` に `GSC_SITE_URL=sc-domain:trylinerugby.com` とキーパスを設定。
