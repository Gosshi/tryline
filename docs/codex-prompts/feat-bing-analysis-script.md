`/specs/feat-bing-analysis-script.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## 状況

**検索流入の約7割が Bing なのに、クエリもページも一度も見たことがありません。** 現時点で最大の計測空白です。

GA4 実測（users / 28日）: bing/organic **62** に対し google/organic 30。Google 側は `tools/gsc-pull.ts` でページ別まで取れているのに、その2倍の流入がある Bing が完全にブラックボックスです。

2026-08-27 に Owner が Bing Webmaster Tools のセットアップを完了しました。API を叩ける状態です。

## 期限のある制約（最重要）

**`/pox/` と `/soap/` は 2026-08-31 に廃止されます。** 今日は 2026-08-27 で、**残り4日**です。

存続するのは **`/json/` のみ**:

```
https://ssl.bing.com/webmaster/api.svc/json/{METHOD}?apikey={KEY}&siteUrl={SITE}
```

**ネット上のサンプルコードは `/pox/` のものが大半です。** Microsoft 公式ドキュメントの例にも POX が併記されています。コピーしないでください。

受け入れ条件3の検証は**実行コードだけが対象**です。

```bash
rg -n '/pox/|/soap/' --glob '!**/*.md' tools lib app scripts
# → 0 件
```

**Markdown は対象外です。** この指示書と spec は廃止経路を説明するために両文字列を本文に含んでおり、PR にも同梱されます。ドキュメントまで検索対象にすると条件が成立しません（2026-08-27 に Codex から指摘を受けて修正）。

## 実装するのは読み取り4メソッドだけ

| メソッド | 用途 |
|---|---|
| `GetUserSites` | 疎通確認 |
| `GetRankAndTrafficStats` | 日別 Clicks / Impressions |
| `GetQueryStats` | 上位クエリ |
| `GetPageStats` | 上位ページ |

メソッド名は [IWebmasterApi](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi) で確認済みです（大文字小文字含めてこのとおり）。

**allowlist 方式で持ってください。** この4つの定数配列を作り、それ以外は実行時に弾きます。

理由は、**同じ API キーで書き込みができてしまう**からです。`SubmitUrl` / `AddSite` / `RemoveSite` / `SaveCrawlSettings` / `AddSiteRoles` などが同じキーで通ります。禁止リストは spec に列挙しました。**呼び出しコードが存在するだけでも事故の元**なので、書かないでください。

## セキュリティ: API キーが URL に載ります

Bing はキーを**クエリパラメータ**で渡す設計です。つまり **URL をそのままログやエラーに出すとキーが漏れます。**

- エラーメッセージに URL を含めるときは `apikey` の値を必ずマスクする
- `fetch` の例外をそのまま再スローしない。メッセージを組み立て直す
- 出力ファイルにリクエスト URL を含めない

受け入れ条件7で、**ネットワークエラー・HTTP エラー・API エラーの3経路すべて**についてキーが漏れないことを検証します。

## レスポンスの癖

- 成功時は **`{"d": ...}` でラップ**される
- **エラー時は `d` ラッパー無し**で `{"ErrorCode": 2, "Message": "..."}` が返る。整数の `ErrorCode` で判定する
- 日付は **Microsoft 形式** `"\/Date(1316156400000-0700)\/"`。ISO 8601 ではありません

日付は **UTC ミリ秒として解釈して `YYYY-MM-DD` に変換**してください。オフセットは無視してよいです（Bing は日単位集計しか返さないため）。**この判断をコード内のコメントに残してください。**

パース不能な値が来たら、**行を捨てずに** `date: null` にして警告を1行出します。黙って握りつぶさないでください。

## 既存との整合

`tools/gsc-pull.ts` に揃えてください。

- 起動: `node --env-file=.env.bing.local tools/run-ts.cjs tools/bing-pull.ts`
- 出力先: `tmp/bing/`（`tmp/gsc/` と同じ流儀。JSON + `summary-<ISO8601>.md`）
- 未知のオプション値は、対応値の一覧を添えてエラー（`tools/gsc-pull.ts:219` の `Invalid --dims value: ...` と同じ形）
- サイト URL は定数を既定にして env で上書き（`tools/gsc-pull.ts:710` と同じ形）

**`tools/gsc-pull.ts` は変更しないでください。共通化もしません。** まず動くものを1本作ります。

## サマリに必ず入れる注記

Bing の Clicks / Impressions は **Web だけでなく Chat / News / Images / Videos / Knowledge Panel を全部含みます**（2023-03-24 以降）。GSC の既定（Web のみ）とは母集団が違い、単純比較すると Bing が過大に見えます。

**サマリ Markdown の冒頭にこの注記を1行入れてください。** これが無いと読む側が必ず誤読します。

## 完了の定義

- spec の受け入れ条件1〜15をすべて満たす
- テストは `fetch` をモックし、**ネットワークを実際に叩かない**
- `docs/runbooks/bing-analysis-setup.md` に Owner 向けのキー発行手順を書く
- `.gitignore` に `.env.bing.local` を追加
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` がすべて通る

## PR に書いてほしいこと

**API キーが漏れないこと**をどのテストが保証しているか、3経路それぞれについてケース名を挙げてください。ここが本実装で最も事故りやすい箇所です。
