# Runbook — Bing Webmaster Tools 分析スクリプトのセットアップ（Owner 作業）

`tools/bing-pull.ts`（仕様: `specs/feat-bing-analysis-script.md`）を手元で実行するための、一回限りの準備手順です。

## 1. サイトの確認

1. [Bing Webmaster Tools](https://www.bing.com/webmasters/) に、サイト所有権を持つアカウントでサインインする。
2. `https://www.trylinerugby.com/` がサイト一覧にあり、所有権確認済みであることを確認する。
3. 新規サイトの場合は、Google Search Console からのインポートまたは画面の案内に従って追加・確認する。分析データが表示されるまで最大48時間程度かかることがある。

## 2. API キーの発行

1. 右上の **Settings** を開き、**API Access** を選ぶ。
2. 初回は **Generate Key** を選択する。既存キーがある場合は再発行せず、そのキーを使う。
3. キーは一度だけ安全な場所へ控える。キーはユーザー単位で発行され、再生成すると反映まで時間がかかることがある。

このスクリプトは4つの読み取りメソッドだけをallowlistで呼びます。キー自体には書き込み権限を持つAPIもあるため、キーを共有・コミット・ログ出力しないでください。

## 3. ローカル環境変数

リポジトリ直下に `.env.bing.local` を作成します。このファイルは `.gitignore` 済みです。

```bash
BING_API_KEY=<Bing Webmaster Tools で発行したキー>
BING_SITE_URL=https://www.trylinerugby.com/
```

- 本番用の `.env` や Vercel 環境変数にキーを追加しない。
- `BING_SITE_URL` はURL-prefixプロパティと完全に一致させる。通常は既定値の末尾スラッシュ付きURLをそのまま使う。

## 4. 実行

まず疎通確認だけを行います。

```bash
node --env-file=.env.bing.local tools/run-ts.cjs tools/bing-pull.ts --methods sites
```

アクセス可能なサイト一覧が表示されたら、通常の分析を実行します。

```bash
node --env-file=.env.bing.local tools/run-ts.cjs tools/bing-pull.ts
```

結果は gitignore 済みの `tmp/bing/` に書かれます。

- `rank-and-traffic.json`
- `query-stats.json`
- `page-stats.json`
- `summary-<ISO8601>.md`

出力ファイルを Claude に読ませて分析できます。API キーやリクエストURLは出力されません。

## トラブルシューティング

- **`BING_API_KEY is not set.`**: `.env.bing.local` のファイル名・実行ディレクトリ・変数名を確認する。
- **API error 2 / アクセスエラー**: サイト所有権と `BING_SITE_URL` が Bing Webmaster Tools のプロパティと一致するか確認する。
- **サイト一覧が空**: APIキーを発行したアカウントに対象サイトへのアクセス権があるか確認する。
- **データが少ない / 空**: 新規追加・インポート後は分析データの生成に時間がかかる。翌日以降に再実行する。

## 参照

- [Bing Webmaster Tools のAPIキー発行案内](https://blogs.bing.com/webmaster/may-2021/Easy-set-up-guide-for-Bing%E2%80%99s-Content-Submission-API-%28Beta%29)
- [サイト追加・所有権確認の案内](https://www2.bing.com/webmasters/help/add-and-verify-site-12184f8b)
