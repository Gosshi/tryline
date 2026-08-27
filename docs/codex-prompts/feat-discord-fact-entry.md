`/specs/feat-discord-fact-entry.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## これは公開エンドポイントで DB に書き込みます

**このタスクで最も重要なのはセキュリティです。** 機能より先にここを固めてください。

1. **Ed25519 署名検証を必須にする。** Discord の `X-Signature-Ed25519` / `X-Signature-Timestamp` を検証し、失敗は 401。**Node 標準の `crypto.verify` で可能**なので新規パッケージは不要です
2. **検証は生のリクエストボディに対して行う。** `await request.json()` してから再シリアライズすると署名が合いません
3. **Owner の Discord ユーザー ID 以外を拒否する。** 署名検証だけでは「Discord からの正当なリクエスト」しか保証されません。bot を他サーバーに追加されたら誰でも叩けます
4. **`type: 1`（PING）に PONG を返す。** これが無いと Endpoint URL を登録できません

署名検証つき webhook の前例が2つあります。**同じ流儀にしてください。**
- `app/api/stripe/webhook/route.ts:46-58`
- `app/api/revenuecat/webhook/route.ts`

## 常駐 bot は作らないでください

Discord には Gateway（WebSocket 常時接続）と Interactions（HTTP）の2方式があります。**Vercel で動くのは HTTP 方式だけ**です。

「メッセージへの返信を読む」実装は Gateway が必要なので採用しません。**メッセージのコンテキストメニューコマンド**（長押し → アプリ → 事実を追加）を使ってください。これなら対象メッセージが Interaction に含まれて渡ってきます。

## 最初に読むファイル

| ファイル | 何を確認するか |
|---|---|
| `app/api/stripe/webhook/route.ts:46-58` | 署名検証の流儀 |
| `lib/llm/sourced-facts/fetch.ts:391` | **読み取り時に allowlist で無言除外している** |
| 同 `:98-101` | `replaceSourcedFactsForSourceDomains` の DELETE 条件。**最大の事故ポイント** |
| `lib/llm/sourced-facts/allowlist.ts` | **変更しない** |
| `lib/news-links.ts` | 通知フォーマットの生成元。**変更しない** |

## 落とし穴が2つあります

**1. 読み取り時に捨てられる**

`loadSourcedFactsForMatch` は allowlist 外を無言で除外します。手を入れないと、`rnz.co.nz` の事実を保存できても**記事生成時に消えます**。条件を「allowlist 内 **または** 手動入力」に変えてください。

**2. 自動再取得に消される**

`replaceSourcedFactsForSourceDomains` は `source_domain` 単位で DELETE します。`springboks.rugby`（allowlist 内）の記事から手動で足すと、**次の自動再取得で消えます**。

allowlist 外のドメインなら偶然生き残りますが、**その偶然に依存させないでください**。

**この2点はテストで押さえてください。** 特に2番目は「allowlist 内ドメインで手動追加 → 自動再取得 → 行が残っている」というテストが必要です。

## 入力項目を増やさないでください

モーダルは**事実（必須）と確度（任意・既定 medium）の2つだけ**にしてください。

`content_type` は**キックオフ時刻から機械的に決めます**（前なら preview、後なら recap）。選ばせないでください。項目が増えるほど入力が億劫になり、使われなくなります。

## 推測で埋めないでください

`match_id` と `source_url` は通知メッセージから抽出します。**取れなければエラーを返してください。**

Owner が通知以外のメッセージにコマンドを実行することは普通に起きます。そのとき静かに失敗せず、「この形式のメッセージではない」と分かる応答を返してください。

## やってはいけないこと

- `lib/llm/sourced-facts/allowlist.ts` の変更（ドメインの追加・削除を含む）
- **自動取得経路の allowlist 検証を緩めること。** `fetchSourcedFactsForMatch` は従来どおり厳格に
- `lib/news-links.ts` の変更
- Discord 通知フォーマットの変更（**この実装が依存する側**）
- スラッシュコマンドの追加（コンテキストメニューのみ）
- 言語の自動判定（`fact` と `fact_ja` に同じ日本語を入れる）

## 環境変数

必要な環境変数名を **spec と PR 本文の両方に明記**してください。**値は読まないでください。**

Owner が Discord Developer Portal で行う作業（アプリ作成・Public Key 取得・Endpoint URL 登録・コマンド登録）があるので、**PR 本文に手順を書いてください**。特に「**実装をデプロイしてから Endpoint URL を登録する**」ことを明記してください。登録時に Discord が PING を送るため、順序が逆だと登録に失敗します。

## 完了の定義

spec の「受け入れ条件」17項目をすべて満たすこと。特に:

- 不正な署名が **401** で拒否されるテスト
- **Owner 以外のユーザー ID が拒否される**テスト
- allowlist 外ドメインの手動入力を `loadSourcedFactsForMatch` が返すテスト
- allowlist 内ドメインの手動入力が自動再取得後も残るテスト
- **自動取得経路で allowlist 外が保存されない**テスト（緩んでいないことの証明）
- `git diff -- lib/llm/sourced-facts/allowlist.ts lib/news-links.ts` が**空**
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が clean

## PR 本文に必ず含めること

- **必要な環境変数名の一覧**（値は書かない）
- **Owner 側の設定手順**（デプロイ → Endpoint URL 登録 → コマンド登録の順序を明記）
- 登録するコンテキストメニューコマンドの名前と、登録に使う API の呼び方
- `git diff --stat`
