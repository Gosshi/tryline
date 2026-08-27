# Bing Webmaster Tools 分析スクリプト

## 背景

**検索流入の約7割が Bing なのに、クエリもページも一度も見たことがない。** これが現時点で最大の計測空白である。

GA4 実測（users、28日）:

| source / medium | prev28 (2026-07-02〜07-29) | last28 (07-30〜08-26) |
|---|---:|---:|
| **bing / organic** | **92** | **62** |
| google / organic | 17 | 30 |

Google 側は `tools/gsc-pull.ts` で clicks 21→31、CTR 1.94%→2.21%、ページ別の内訳まで取れている。**Bing はその2倍の流入がありながら中身が完全にブラックボックス**である。

2026-08-27、Owner が Bing Webmaster Tools のセットアップを完了した（Google アカウントでサインインし、GSC からインポート。所有権確認は GSC 由来で済んでいる）。API を叩ける状態になったので、`tools/gsc-pull.ts` と同じ運用ができるスクリプトを作る。

### 期限のある制約

**`/pox/` と `/soap/` エンドポイントは 2026-08-31 に廃止される**（[SOAP/POX API Deprecation](https://www.bing.com/webmasters/help/soap-pox-api-deprecation-s0appox01)、2026-08-27 確認）。

存続するのは **`/json/` のみ**。公式ドキュメントの記載:

> 影響を受けるのは `https://ssl.bing.com/webmaster/api.svc/pox/...` と `.../soap/...` を呼ぶ実装。`.../json/...` を既に使っているなら影響なし。

本スクリプトは **`/json/` だけを使う**。廃止まで4日しかないため、`/pox/` の実装例をコピーしてはならない。

## スコープ

対象:
- `tools/bing-pull.ts` の新規作成
- `.gitignore` に `.env.bing.local` を追加（未追加の場合）
- `docs/runbooks/bing-analysis-setup.md` の新規作成（Owner 向けセットアップ手順）

対象外:
- **書き込み系 API の一切**（後述の禁止リスト）
- Bing のデータを本番 DB に保存すること。出力は `tmp/bing/` へのファイルのみ
- GA4 との自動突き合わせ。取得したファイルを Claude が読んで分析する運用にする
- `tools/gsc-pull.ts` のリファクタや共通化。**既存スクリプトには一切触らない**
- 定期実行（cron / GitHub Actions）。手動実行のみ

## データモデル変更

**なし。** DB には一切書かない。

## API サーフェス

外部 API を読むだけで、本プロダクトの API は増減しない。

### エンドポイント

```
https://ssl.bing.com/webmaster/api.svc/json/{METHOD}?apikey={KEY}&siteUrl={SITE}&...
```

- `Content-Type: application/json; charset=utf-8`
- レスポンスは **`{"d": ...}` でラップされる**
- エラー時は **`d` ラッパー無し**で `{"ErrorCode": 2, "Message": "..."}` が返る。整数の `ErrorCode` で判定すること
- 日付は **Microsoft 形式** `"\/Date(1316156400000-0700)\/"`。ISO 8601 ではない
- JSON 文字列内でスラッシュがエスケープされる（`http:\/\/example.com\/`）。`JSON.parse` が処理するので特別扱いは不要

### 使うメソッド（すべて読み取り専用・GET）

| メソッド | 引数 | 用途 |
|---|---|---|
| `GetUserSites` | なし | アクセス可能なサイト一覧。疎通確認に使う |
| `GetRankAndTrafficStats` | `siteUrl` | 日別の Clicks / Impressions（総量） |
| `GetQueryStats` | `siteUrl` | 上位クエリの詳細traffic統計 |
| `GetPageStats` | `siteUrl` | 上位ページの詳細traffic統計 |

メソッド名は [IWebmasterApi](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi) で確認済み（2026-08-27）。**大文字小文字を含めて上記のとおり**。

### 呼んではいけないメソッド

同じ API キーで**書き込みができてしまう**。以下は実装に含めないこと。呼び出しコードが存在するだけでも事故の元になる。

```
AddSite / RemoveSite / VerifySite
SubmitUrl / SubmitUrlBatch / SubmitContent / SubmitFeed / RemoveFeed
FetchUrl
AddBlockedUrl / RemoveBlockedUrl
AddQueryParameter / RemoveQueryParameter / EnableDisableQueryParameter
SaveCrawlSettings
AddSiteRoles / RemoveSiteRole
AddConnectedPage
AddCountryRegionSettings / RemoveCountryRegionSettings
AddDeepLinkBlock / RemoveDeepLinkBlock / UpdateDeepLink
AddPagePreviewBlock / RemovePagePreviewBlock
SubmitSiteMove
```

**メソッド名は allowlist 方式で持つこと。** 上記4つの定数配列を持ち、それ以外は実行時に弾く。

## セキュリティ要件

### API キーがクエリ文字列に載る

Bing の API はキーを **URL のクエリパラメータ**で渡す。したがって **URL をそのままログ・エラーメッセージ・スタックトレースに出すとキーが漏れる**。

- **例外・エラーログに URL を含めるときは、必ず `apikey` の値をマスクすること**（例: `apikey=***`）
- `console.log` / `console.error` に生の URL を出さない
- `fetch` が投げた例外をそのまま再スローしない。メッセージを組み立て直す
- 出力ファイル（`tmp/bing/*.json`）にリクエスト URL を含めない

これは受け入れ条件で検証する。

### キーの保管

- `.env.bing.local`（**リポジトリ直下・gitignore 済み**）から読む
- `GSC` の運用（`.env.gsc.local`）と同じ形にする。**本番 Supabase 等のキーと同じファイルに混ぜない**
- スクリプトはキーの値を**一切出力しない**。存在チェックの結果だけを出す

必要な環境変数:

```
BING_API_KEY=
BING_SITE_URL=https://www.trylinerugby.com/
```

`BING_SITE_URL` の既定値はコード内に定数で持ち、env で上書き可能にする（`tools/gsc-pull.ts:710` の `GSC_SITE_URL ?? DEFAULT_GSC_SITE_URL` と同じ形）。

## CLI サーフェス

`tools/gsc-pull.ts` と揃える。起動方法も同じ:

```bash
node --env-file=.env.bing.local tools/run-ts.cjs tools/bing-pull.ts [options]
```

| オプション | 既定 | 意味 |
|---|---|---|
| `--methods` | `traffic,query,page` | 取得対象。カンマ区切り。`sites` で疎通確認のみ |
| `--out` | `tmp/bing` | 出力ディレクトリ |

`--methods` に未知の値が来たら、**対応値の一覧を添えてエラーにする**（`tools/gsc-pull.ts:219` の `Invalid --dims value: ...` と同じ形）。

## 出力

`tmp/bing/` に以下を書く。`tmp/gsc/` と同じ流儀。

| ファイル | 内容 |
|---|---|
| `rank-and-traffic.json` | `GetRankAndTrafficStats` の生データ（日付はパース済み） |
| `query-stats.json` | `GetQueryStats` の生データ |
| `page-stats.json` | `GetPageStats` の生データ |
| `summary-<ISO8601>.md` | Markdown サマリ |

### 日付のパース

`"\/Date(1316156400000-0700)\/"` を **UTC ミリ秒として解釈し、`YYYY-MM-DD` の文字列**に変換して出力する。オフセット部分は無視してよい（Bing は日単位の集計しか返さないため）。**この変換方法をコード内のコメントで明示すること。**

パースできない値が来たら、**その行を捨てずに** `date: null` として残し、警告を1行出す。黙って握りつぶさない。

### サマリの中身

`tmp/gsc/summary-*.md` と同じ構成にする:

- プロパティ、期間、行数
- **合計 Clicks / Impressions / CTR**
- 上位クエリ（Clicks 降順、上位10件）
- 上位ページ（Clicks 降順、上位10件）

## 分析上の注意（サマリに注記として出力すること）

Bing の Clicks / Impressions は **Web, Chat, News, Images, Videos, Knowledge Panel の全 vertical を含む**（2023-03-24 以降。[GetRankAndTrafficStats のドキュメント](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getrankandtrafficstats)）。

**GSC の既定（Web のみ）とは母集団が違う。** 単純比較すると Bing が過大に見える。サマリの冒頭にこの注記を1行入れること。

## LLM 連携

**なし。**

## 受け入れ条件

1. `--methods sites` で `GetUserSites` を呼び、アクセス可能なサイト一覧を表示する。
2. 既定オプションで `GetRankAndTrafficStats` / `GetQueryStats` / `GetPageStats` を呼び、`tmp/bing/` に3つの JSON と1つの summary Markdown を書く。
3. 呼び出す URL が **`https://ssl.bing.com/webmaster/api.svc/json/` で始まる**。
   **実行コードに `/pox/` と `/soap/` が含まれない。** 検証は次のコマンドが0件を返すこととする。

   ```bash
   rg -n '/pox/|/soap/' --glob '!**/*.md' tools lib app scripts
   ```

   **Markdown は対象外。** 本仕様書と `docs/codex-prompts/feat-bing-analysis-script.md` は、廃止されるエンドポイントを説明するために両文字列を本文に含んでおり、かつ PR に同梱される。ドキュメントを検索対象にすると条件が自己矛盾する。
4. メソッド名が allowlist（上記4つ）に無い場合、リクエストを送らずエラーにする。
5. `BING_API_KEY` が未設定のとき、**キーの値を出さずに**「未設定である」旨のエラーで終了する。
6. API が `{"ErrorCode": ..., "Message": ...}`（`d` ラッパー無し）を返したとき、`ErrorCode` と `Message` を表示して非ゼロ終了する。
7. **エラー時に出力される文字列に API キーの値が含まれない。** ネットワークエラー・HTTP エラー・API エラーの3経路すべてで検証すること。
8. `tmp/bing/*.json` の中身に API キーもリクエスト URL も含まれない。
9. `"\/Date(1316156400000-0700)\/"` が `"2011-09-16"` に変換される。
10. パース不能な日付が来ても行が失われず、`date: null` になり警告が1行出る。
11. `--methods` に未知の値を渡すと、対応値の一覧を含むエラーになる。
12. `.env.bing.local` が `.gitignore` に含まれている。
13. `docs/runbooks/bing-analysis-setup.md` に、Owner が API キーを発行して `.env.bing.local` に置くまでの手順が書かれている。
14. 上記1〜11のうち、**ネットワークを実際に叩かずに検証できるもの**（3〜11）を単体テストで検証する。`fetch` はモックする。
15. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` がすべて通る。

## やってはいけないこと

- **`/pox/` や `/soap/` エンドポイントを使わないこと。** 2026-08-31 に廃止される。ネット上のサンプルコードは POX のものが多いので注意。ただし**この禁止は実行コードに対するもの**で、廃止経路を説明する Markdown 本文まで書き換える必要はない（受け入れ条件3を参照）。
- **書き込み系メソッドを実装しないこと。** 上の禁止リストにあるものは、呼び出しコードを書かない。allowlist で弾く。
- API キーを URL ごとログ・エラー・出力ファイルに出さないこと。
- `.env.bing.local` をコミットしないこと。`.env.production.local` など既存の env ファイルにキーを追記しないこと。
- `tools/gsc-pull.ts` を変更しないこと。共通化もしない。まず動くものを1本作る。
- 取得したデータを Supabase に書かないこと。
- cron や GitHub Actions に載せないこと。手動実行のみ。
- 日付のパース失敗を黙って握りつぶさないこと。

## 未解決の質問

なし。
