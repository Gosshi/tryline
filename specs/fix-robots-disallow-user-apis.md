# ユーザー別 API を、検索エンジンのクロール対象から外す

## 背景

GSC のクロールの統計情報（直近 90 日、2026-11-16 確認）では、Google のクロール 4,210 回のうち **JSON が 17%（695 回）**でした。例に出た URL は、すべてログイン中の利用者向けの API です。

```
/api/me/chat-free/{matchId}
/api/me/premium
/api/matches/{matchId}/recap-locked?lang=ja
```

Googlebot はページを描画するときに、クライアント側のこれらの `fetch` も実行します。ところが、ログインしていない Googlebot への返り値は、いつも空か `false` です（例: `app/api/matches/[id]/recap-locked/route.ts` は未ログインで `{ isPremium: false, lockedMd: null }` を返す）。

検索に使われる中身は何もありません。それなのに、1 日あたり約 47 回しかないクロールの枠を使っています。HTML（ページ本体）の取得は 28% しかありません。

同じ日に Owner が Vercel の Skew Protection を切りました（JS・CSS の取り直し 43% への対策）。この spec は、残る JSON の分を減らします。

## スコープ

対象:
- `app/robots.ts` に、ユーザー別のデータしか返さない API の接頭辞を `disallow` で足す

対象外:
- **`/api/og/`（OGP 画像）は塞がない。** X 等のカード画像の取得と、Google の画像に使われる
- `/api/calendar/`（iCal 配信）、`/api/v1/`（モバイルアプリ用）、`/api/cron/` 等。今回のクロールの例に出ていないので触らない
- API 側の実装、`/ops` の既存の `disallow`

## データモデル変更

なし。

## API サーフェス

`app/robots.ts` の `rules.disallow` を、次の配列にする（順序もこのとおり）。

```ts
disallow: [
  "/ops",
  "/api/me/",
  "/api/matches/",
  "/api/home/",
  "/api/user/",
  "/api/chat/",
],
```

- 各接頭辞の中身（2026-11-16 時点）:
  - `/api/me/`: `chat-free`・`premium`
  - `/api/matches/`: `[id]/recap-locked`
  - `/api/home/`: `favorite-matches`
  - `/api/user/`: `profile`
  - `/api/chat/`: 試合チャット
- 着手前に `ls app/api/me app/api/matches app/api/home app/api/user app/api/chat` で確認する。上記以外のルートがあれば、それが検索に必要な公開データを返していないかを確かめる。返していれば止めて報告する
- **`"/api/"` をまとめて塞がない**（`/api/og/` が巻き込まれる）

## UI サーフェス

なし。描画の結果は変わらない。Googlebot はこれらの API を取れなくなるが、今も未ログインの返り値しか受け取っておらず、画面は未ログイン時と同じになる。

## LLM 連携

なし。

## 受け入れ条件

1. `robots()` の戻り値の `rules.disallow` が、上の配列と完全一致する（`tests/app/` にテストを足す。既存の robots のテストがあれば、そこに足す）
2. 戻り値の `disallow` のどの要素も、`/api/og/` と `/api/og/...` の前方一致にならない（テストで確認する）
3. `sitemap` と `allow: "/"` は変わらない
4. **壊して落ちる確認**（PR 本文に出力を貼る。コミットしない）: `disallow` に `"/api/"` を足すと、条件 2 のテストが落ちる
5. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` が通り、CI が緑
6. PR 本文に、プレビュー環境の `/robots.txt` の本文を貼る（SSO で開けなければ保留と書く。Claude Code が確認する）

## 競合とマージ順

- 触るファイル: `app/robots.ts` とテストだけ。他の spec との競合はない

## 本番操作

なし。マージ後、Owner は任意で、GSC の「設定 → robots.txt」から再取得をリクエストする。

## 効果の測り方（Claude Code が行う）

Skew Protection を切った日（2026-11-16）と合わせて、2 週間後と 4 週間後に、クロールの統計情報で次を見る。

- ファイル形式別の割合（今は JS 35%・HTML 28%・JSON 17%・CSS 8%）
- 目的別の「検出」の割合（今は 4%）
- HTML のクロール回数

## 未解決の質問

なし。
