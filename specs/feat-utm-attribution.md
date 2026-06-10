# 外部配信リンクの UTM 付与（流入元計測）

## 背景

GA4 と CTA クリック計測（`lib/analytics.ts` / `TrackedLink` / `checkout-success-tracker.tsx`）は実装済みだが、**X・note・Discord から来た流入を分離できない**。
X 投稿の試合 URL は `lib/x/post.ts:249` と `app/api/cron/notify-discord/route.ts:379` で `https://www.trylinerugby.com/matches/${matchId}` を **UTM なし**でハードコードしている。
このため reply-first・SEO・note の効果を数字で比較できない（診断: `docs/measurement-plan-2026-06.md` GAP-1）。本 spec は外部配信リンクに UTM を付与し、GA4 で流入元・キャンペーンを分離可能にする。

## スコープ

**対象:**
- 外部配信用の試合 URL を組み立てる共通ヘルパを新設し、UTM を付与
- X reply（`lib/x/post.ts`）と Discord 下書き（`notify-discord`）の URL をヘルパ経由に統一
- note・手動シェア用の UTM 規約をドキュメント化（コードでは付与しない、Owner が手動付与）

**対象外:**
- サイト内リンク（`/matches/[id]` 内部遷移）への UTM（不要・むしろ有害）
- GA4 側のチャネルグループ設定・探索レポート作成（Owner が GA4 UI で実施）
- note 記事本文への UTM 自動埋め込み（手動運用）

## データモデル変更
なし。

## API サーフェス

### 新規ヘルパ `lib/x/match-url.ts`（または `lib/site.ts` に追加）
```ts
type ShareSource = "x" | "discord";
type ContentType = "preview" | "recap";

export function buildMatchShareUrl(
  matchId: string,
  opts: { language: "ja" | "en"; source: ShareSource; contentType: ContentType },
): string
```
- ベース URL は `SITE_URL`（`lib/site.ts`）を使用（ハードコードを廃止）。`language === "en"` のとき `/en` を付与。
- 付与する UTM:
  - `utm_source` = `source`（`x` / `discord`）
  - `utm_medium` = `social`
  - `utm_campaign` = `contentType`（`preview` / `recap`）
  - `utm_content` = `matchId`（試合単位の内訳を取るため）
- 実装は `new URL()` + `searchParams.set()` で組み立て（手書き連結しない）。

### 既存呼び出しの差し替え
- `lib/x/post.ts` `buildReplyText`: 内部の `matchUrl` 生成を `buildMatchShareUrl(matchId, { language, source: "x", contentType })` に置換。`buildReplyText` の引数 `contentType`（既存）をそのまま渡す。
- `app/api/cron/notify-discord/route.ts:379` の `matchUrl`: 同ヘルパ（`source: "x"`、Discord 下書きは X へ投稿される前提）に置換。`content_type` から `contentType` を解決。
- `buildLinklessReplyText`（URL なし版）は変更しない。

## UI サーフェス
なし（投稿テキスト生成のみ）。

## UTM 規約（ドキュメント・手動チャネル）
コードで付与しない手動チャネルの規約を `docs/measurement-plan-2026-06.md` に追記:
- note: `utm_source=note&utm_medium=referral&utm_campaign=<記事スラッグ or weekly-roundup>`
- X プロフィールリンク等の固定リンク: `utm_source=x&utm_medium=profile`

## LLM 連携
なし。

## 受け入れ条件
- `buildMatchShareUrl` が追加され、`new URL` ベースで UTM 4種（source/medium/campaign/content）を正しく付与する。
- 出力例（ja・recap）: `https://www.trylinerugby.com/matches/<id>?utm_source=x&utm_medium=social&utm_campaign=recap&utm_content=<id>`
- 出力例（en・preview）: `https://www.trylinerugby.com/matches/<id>/en?utm_source=x&utm_medium=social&utm_campaign=preview&utm_content=<id>`
- `lib/x/post.ts` と `notify-discord` のハードコード URL が撤去され、ヘルパ経由になっている（`grep -rn "trylinerugby.com/matches" lib/ app/` がヘルパ実装以外でヒットしない）。
- `buildLinklessReplyText` は不変。
- ユニットテスト追加: ja/en × preview/recap の URL、UTM の有無、`SITE_URL` 差し替え時の挙動。
- 既存テスト（`tests/lib/x/post.test.ts` 等）が緑。期待 URL に UTM が付くようテストを更新。
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean。

## 未解決の質問
1. `utm_campaign` を `contentType`（preview/recap）で確定とするか、大会別（`utm_campaign=super-rugby-pacific`）も併用したいか。→ v1 は contentType で確定、大会別は `utm_content` の併用 or 後日。
2. Discord から**直接**クリックされる流入（X に転記せず Discord 内で踏む）を分けたい場合、Discord 用に `source: "discord"` を別途渡す箇所を作るか。v1 は X 前提で `x` 固定。
