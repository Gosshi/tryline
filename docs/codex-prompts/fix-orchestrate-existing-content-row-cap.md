# Codex 指示書: 既存コンテンツ除外の1000行上限バグ

仕様書: `specs/fix-orchestrate-existing-content-row-cap.md`
受け入れ条件（1〜13）は仕様書を正とする。ここでは繰り返さない。

## 直したいこと

**公開済みの recap が毎日いくつか再生成され、品質が下がった版に置き換わっている。**

2026-09-22 の実例: 5月の Queensland Reds v Fijian Drua が 20:16 に再生成され、
`factual_grounding` 5→4 のまま `published` を置き換えた。

原因は `lib/cron/orchestrate.ts:156-161`。

```ts
const { data: existingContent, error: contentError } = await params.db
  .from("match_content")
  .select("match_id")
  .eq("content_type", params.contentType)
  .eq("language", "ja")
  .in("status", [...EXISTING_CONTENT_STATUSES]);
```

**`match_id` で絞っていないため PostgREST の既定 1,000 行上限に当たる。**
本番の `recap`×`ja` は **1,004 行**。返らなかった 4 行の試合が
「未生成」と判定されて再生成される。

**記事が増えるほど悪化する。** 1,100 行になれば 100 件が毎回再生成される。

## 触るファイル

- `lib/cron/orchestrate.ts`
- `tools/audit-entity-grounding.ts`
- `scripts/report-style-guard-shadow.ts`
- 上記のテスト

`lib/llm/pipeline.ts` の品質回帰通知（`:836-856`）は**触らない。正しく機能している。**
通知が出たおかげでこのバグが見つかった。

## 直し方（本丸）

`getMatchIdsMissingContent`（`:107`）は**直前で `allMatchIds` を作っている**（`:145`）。
それを `.in("match_id", allMatchIds)` として渡すだけでよい。

ページングより確実で、クエリも軽くなる。

**ただし `allMatchIds` 自体が 1,000 件を超えうる。**
`recap` の候補は `status='finished'` の全件で、本番の finished は **1,088 件**。
`.in()` に 1,088 個を渡すと URL 長やパラメータ数の制限に当たる可能性がある。
**分割して問い合わせること。**

## 同時に直す2箇所

`match_content` を絞り込み無しで全件取得し、**結果を完全な集合として使っている**箇所。
どちらも監査・レポート用なので、切り捨てられると**黙って過少報告になる**。

| 箇所 | 現状 | 想定行数 |
|---|---|---|
| `tools/audit-entity-grounding.ts:260-262` | `.eq("status","published")` のみ | 877+ |
| `scripts/report-style-guard-shadow.ts:87-91` | published + ja + preview/recap | **約990。1,000 に極めて近い** |

## 既存の前例に揃える

**共有ヘルパは存在しない。** ただしページングの前例が2つある。

- `lib/db/queries/players.ts:104` の `SUPABASE_PAGE_SIZE = 1000` と `:166-171` の `.range()` ループ
- `tools/audit-published-recap-event-integrity.ts:445` の `.range(offset, offset + PAGE_SIZE - 1)`

**3箇所で別々の書き方をしないこと。** 共有ヘルパを新設してもよい。

## テストで最も重要な点

**1,000 行以下のモックでは本バグを再現できない。**

AC 3 のテストは、`match_content` に **1,001 行以上**の `published`/`draft` を用意し、
**1,000 行目より後に位置する行に対応する試合が候補に含まれる**状況を作ること。
モックが 1,000 行の上限を模していなければ、修正前でもテストが通ってしまい検出力がない。

PostgREST の挙動（絞り込み無しの select が 1,000 行で打ち切られる）を
モック側で再現する必要がある。

## やってはいけないこと

- 品質回帰通知（`lib/llm/pipeline.ts:836-856`）を止めること。**これは正常動作**
- `EXISTING_CONTENT_STATUSES`（`["draft","published"]`）の中身を変えること
- `skippedCount` の意味を変えること（候補数 − 対象数）
- 監査ツール2箇所を「スコープ外」として放置すること。**同じバグが潜んでいる**
- 1,000 行以下のモックでテストを書くこと

## 完了の定義

- 仕様書の受け入れ条件 1〜13 をすべて満たす
- **AC 3 / 6 / 7 のテストが修正前のコードで落ちることを先に確認**し、
  どう落ちたかを PR 本文に書く。
  特に AC 3 は「1,001 行以上のモックで落ちること」を明記する
- 3箇所のページング/分割を**どう統一したか**を PR 本文に書く
- `pnpm vitest run tests/cron tests/api tests/scripts` が全緑
- `pnpm tsc --noEmit` / `pnpm lint` が通る
- **spec から逸脱した場合は PR 本文の "Intentional deviations" に必ず書く**
- `gh pr checks` で CI の緑を確認してから完了報告する
