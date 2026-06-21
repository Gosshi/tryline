# Codex プロンプト — GSC 分析スクリプト

仕様: `specs/feat-gsc-analysis-script.md` を読んでから着手すること。以下は要点と注意のみ。仕様本文は繰り返さない。

## やること

`tools/gsc-pull.ts`（TS、`googleapis` 使用）を新規作成。Google Search Console を **read-only** で叩き、結果を `tmp/gsc/*.json` に出力する CLI。HTTP ルートやアプリ本体は触らない。

- 実行は既存ハーネス: `node --env-file=<env> tools/run-ts.cjs tools/gsc-pull.ts [options]`（`@/` エイリアス・引数パススルー対応済み）。
- 取得は2系統:
  1. Search Analytics（クエリ×ページ等の clicks/impressions/ctr/position）
  2. URL Inspection（sitemap.xml をパス接頭辞でグルーピングし、グループごと `--inspect-limit` 件）
- 認証: サービスアカウント、スコープ **`webmasters.readonly` のみ**。
- `tmp/gsc/` と `.env.gsc.local` を `.gitignore` に追加。

options / env / 出力フォーマットは仕様の「CLI サーフェス」と「確定事項」の通り。確定値の要点:
- GSC プロパティ: `GSC_SITE_URL=sc-domain:trylinerugby.com`。
- サイトオリジン（sitemap 取得・URL Inspection の完全 URL 組み立て）は `@/lib/site` の `SITE_URL`（`https://www.trylinerugby.com`）を流用。`sc-domain:` はプロパティ識別子で URL prefix を持たない点に注意。
- グループ→接頭辞マップ（スクリプト内定数、変更容易に）: `players`→`/players/` / `teams`→`/teams/`,`/t/` / `competitions`→`/competitions/`,`/c/` / `matches`→`/matches/` / `h2h`→`/h2h/`。
- env は専用 `.env.gsc.local`（本番 Supabase 等と混在させない）。

## 触ってはいけないもの

- アプリ本体（`app/**`, `lib/**` の本番コード）。新規ファイルは `tools/gsc-pull.ts` と必要なら `tools/gsc/` 配下のユーティリティ＋テストのみ。
- 書込 API（Indexing API、submit/remove URL）は実装しない。read-only に限定。

## セキュリティ（必須）

- 要求スコープは `webmasters.readonly` だけ。書込スコープを混ぜない。
- SA キーは env のパス参照（`GOOGLE_APPLICATION_CREDENTIALS` / `GSC_SA_KEY_PATH`）。キー内容を console 出力・ログしない。
- 取得データ・URL を含む出力は `tmp/gsc/` のみに書き、`.gitignore` で除外。サンプル出力もコミットしない。

## エッジケース

- URL Inspection のクォータ（2000/日・600/分）: 直列〜低並列（1〜2）＋間隔（例 150ms）＋ `--inspect-limit`(default 50) で保護。429/quota エラーは件数を抑えてリトライ or スキップしてログ。
- `--range`: `28d` / `7d` / `YYYY-MM-DD:YYYY-MM-DD` を解釈。GSC データは2〜3日遅延するので、終端は「今日」でなく安全側に寄せてよい（仕様の default 28d を尊重）。
- sitemap が sitemap index（入れ子）の場合は子 sitemap を辿る。URL が多い場合もグループ別 `--inspect-limit` で打ち切り。
- プロパティ形式 `sc-domain:` と URL-prefix の両方を `GSC_SITE_URL` で受け付ける。
- `--inspect none`（default）のときは URL Inspection を一切呼ばない（重い/クォータ消費を避ける）。

## 完了の定義

- 仕様「受け入れ条件」1〜8 を満たす。
- 実 API を叩かないユニットテスト（range/dims パース、sitemap グルーピング、出力整形、API はモック）。
- 変更は `tools/` 配下＋`.gitignore` のみ。アプリ本体差分なし。
- 実行・認証情報の用意（SA 作成、GSC へ "制限付き" 追加、env 設定）は Owner 作業。Codex は実 API を実行しない。

## 未確定（Owner 確認待ち、着手前に解消）

仕様「未解決の質問」1〜5。特に GSC プロパティ形式・URL グループの接頭辞マップ・SA 認証で確定可かは Owner 回答が要る。グループ接頭辞は暫定で `/players/ /teams/ /competitions/ /matches/` を定数に置き、容易に変更できる形にしておくこと。
