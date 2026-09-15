# 検索分析 MCP（GSC / Bing）のローカル接続

## 背景

GA4 は既存 Analytics MCP で参照できる一方、Google Search Console と Bing Webmaster Tools の検索データは、Owner がローカル CLI を実行してファイルを読む必要がある。検索流入の改善判断を会話内で行えるよう、既存の読み取り専用 API 実装をローカル stdio MCP として公開する。

## スコープ

- `tools/analytics-mcp.ts` にローカル stdio MCP サーバーを追加する。
- GSC Search Analytics、Bing の検索パフォーマンス、Bing のアクセス可能サイト一覧を提供する。
- 既存の `tools/gsc-pull.ts` と `tools/bing-pull.ts` の読み取り専用 API 呼び出しを再利用する。
- Owner 向けの MCP 登録と環境変数の手順を runbook に追加する。

対象外:

- URL Inspection、Indexing API、Bing の書き込み API、DB 保存、定期実行。
- 認証情報・キー・取得済みのローカル env ファイルの出力またはコミット。

## MCP サーフェス

すべて read-only。

| ツール                    | 入力                                                 | 出力                                           |
| ------------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| `gsc_search_performance`  | `range`（7d / 28d / 90d）、`dimensions`、`row_limit` | clicks、impressions、CTR、掲載順位の行         |
| `bing_search_performance` | なし                                                 | 日別流入、上位クエリ、上位ページ（各最大20件） |
| `bing_accessible_sites`   | なし                                                 | API キーで参照可能なサイト一覧                 |

GSC は `webmasters.readonly` スコープだけを要求する。Bing は既存の4メソッド allowlist のうち、3つの読み取りメソッドだけを使用する。結果は MCP の JSON で返し、ローカルファイルへ書き出さない。

## セキュリティ

- 認証は親 `codex` プロセスから継承した環境変数だけを使用する。サーバーは `.env*` を読まない。
- `GSC_SA_KEY_PATH` / `GOOGLE_APPLICATION_CREDENTIALS` はリポジトリ外のキーを指す。`BING_API_KEY` を含む値を返却・ログ出力しない。
- API エラーは認証情報やリクエスト URL を含まない固定メッセージへ変換する。
- URL Inspection と書き込み系 API を MCP のツール一覧に含めない。

## 受け入れ条件

1. `tools/list` で上記3ツールだけが発見でき、書き込み系ツールが存在しない。
2. `gsc_search_performance` は readonly スコープで Search Analytics を取得し、7 / 28 / 90 日の範囲と最大1000行を検証する。
3. Bing の2ツールは既存 allowlist を経由し、結果を最大20行ずつに圧縮する。
4. 認証情報、API キー、Bing リクエスト URL が MCP 応答またはエラーに現れない。
5. モックによる MCP プロトコルと各ツールのユニットテストが通る。実 API はテストしない。
6. Owner が作業ディレクトリに依存しない絶対パスの `codex mcp add` で登録し、新しい Codex セッションの `/mcp` で接続を確認できる。

## 未解決の質問

なし。
