# Codex プロンプト: 外部配信リンクの UTM 付与

## 仕様書

`specs/feat-utm-attribution.md` を読んで実装してください。

## 概要

X・Discord に投稿する試合 URL に UTM パラメータを付与し、GA4 で流入元（X / note / Discord）を分離できるようにします。現状これらの URL はハードコードで UTM なし。共通ヘルパを新設し、2つの呼び出し箇所をヘルパ経由に統一します。データモデル変更なし、UI 変更なし、投稿テキスト生成ロジックのみの変更です。

## 新規ファイル

- `lib/x/match-url.ts` — `buildMatchShareUrl(matchId, { language, source, contentType })` を実装
  - ベース URL は `lib/site.ts` の `SITE_URL` を使う（`https://www.trylinerugby.com` のハードコードは使わない）
  - `language === "en"` のとき `/en` を付与
  - `new URL()` + `searchParams.set()` で UTM を付与（手書き文字列連結は禁止）
  - UTM: `utm_source=<source>` / `utm_medium=social` / `utm_campaign=<contentType>` / `utm_content=<matchId>`

## 変更するファイル

1. `lib/x/post.ts`
   - `buildReplyText`（L243付近）内の `matchUrl`（L249 のハードコード）を `buildMatchShareUrl(matchId, { language, source: "x", contentType })` に置換
   - 既存引数 `contentType`（`"preview" | "recap"`、デフォルト `"recap"`）をそのまま渡す
   - `buildLinklessReplyText` は**変更しない**
2. `app/api/cron/notify-discord/route.ts`
   - L379 の `matchUrl` ハードコードを `buildMatchShareUrl(content.match_id, { language, source: "x", contentType })` に置換
   - `content.content_type` から `contentType`（preview/recap）、`language` を解決して渡す
   - `https://www.trylinerugby.com/api/og`（L382 の resultImageUrl）は**この spec の対象外。触らない**

## 変更しないファイル（触らない）

- `lib/x/impression-tweet.ts`（URL を含まない）
- `lib/x/preview-thread.ts`
- `lib/x/media.ts`（`/api/og` 画像 URL は別用途）
- `buildLinklessReplyText`

## 出力例（テストの期待値）

- ja・recap: `https://www.trylinerugby.com/matches/<id>?utm_source=x&utm_medium=social&utm_campaign=recap&utm_content=<id>`
- en・preview: `https://www.trylinerugby.com/matches/<id>/en?utm_source=x&utm_medium=social&utm_campaign=preview&utm_content=<id>`

> パラメータ順序は `new URL` の `searchParams` 追加順に依存。テストは順序非依存で検証するか、追加順を固定して期待値を合わせること。

## エッジケース

- `SITE_URL` が末尾スラッシュ付き/無しのどちらでも `/matches/<id>` が二重スラッシュにならないこと
- `matchId` に URL エンコードが必要な文字は来ない前提（UUID）だが `searchParams.set` で安全に
- 既存 `tests/lib/x/post.test.ts` の期待 URL は UTM 付きに更新が必要

## 確認方法

```bash
# ハードコード URL が撤去され、ヘルパ実装以外でヒットしないこと
grep -rn "trylinerugby.com/matches" lib/ app/
# → lib/x/match-url.ts 以外にマッチが無ければ OK（site.ts 経由のため実際は 0 件想定）
```

## 完了条件

- `lib/x/match-url.ts` の `buildMatchShareUrl` が UTM 4種を付与
- `lib/x/post.ts` / `notify-discord` がヘルパ経由、ハードコード URL 撤去
- `buildLinklessReplyText` 不変、`/api/og` 画像 URL 不変
- ユニットテスト追加（ja/en × preview/recap、UTM 検証）＋既存テスト更新
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
