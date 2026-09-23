# Codex 指示書: シーズンページの冒頭に「日本代表の試合」を出す

仕様書: `specs/feat-season-page-japan-matches-block.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

**着手条件: `specs/feat-competition-top-season-summary.md` の実装 PR がマージ済みであること。** そこで作る `components/japan-matches-block.tsx` と `lib/format/season-summary.ts` を使う。無ければ止める。

## 直したいこと

11 月に日本代表が欧州で 3 試合（11/8・11/15・11/21、日本時間）を戦う。`/c/nations-championship/2026` には 3 試合とも載っているが、第 4〜6 節の一覧に散らばっていて、冒頭では分からない。
日本代表の試合があるシーズンページでは、冒頭に日本代表の試合をまとめて出し、対戦成績（H2H）ページへの入口も付ける。

## 触るファイル

- `app/c/[competition]/[season]/page.tsx` — `SeasonSummaryBand` の直後にブロックを置く。H2H 件数の取得
- `components/japan-matches-block.tsx` — 省略可能な props `headToHeadHrefByMatchId` と `note` を追加。**省略時の表示は変えない**
- `lib/format/season-summary.ts` — `getJapanMatchesNote` を追加
- `tests/app/season-page-ia.test.tsx` — モック追加、受け入れ条件 1〜7 のテスト
- `tests/lib/format/season-summary.test.ts` — `getJapanMatchesNote` の単体テスト

触らない:
- `app/c/[competition]/page.tsx`（大会トップ）と `tests/app/competition-hub-indexing.test.tsx`（受け入れ条件 8: 無変更で通ること）
- `generateMetadata`
- `lib/db/queries/*`（`countHeadToHeadMatches` と `normalizeHeadToHeadSlug` を呼ぶだけ）
- `lib/ingestion/*`

## 具体例（2026-09-23 本番）

`/c/nations-championship/2026` で期待されるブロック:

| 日本時間 | 対戦 | 結果 | H2H リンク |
|---|---|---|---|
| 7/4(土) 17:40 | 日本 対 イタリア | 27–10 | 件数しだい |
| 7/11(土) 19:10 | 日本 対 アイルランド | 20–36 | 件数しだい |
| 7/18(土) 17:40 | 日本 対 フランス | 15–42 | 件数しだい |
| 11/8(日) 01:40 | ウェールズ 対 日本 | — | あり（件数 2） |
| 11/15(日) 01:40 | イングランド 対 日本 | — | あり（件数 4） |
| 11/21(土) 23:10 | スコットランド 対 日本 | — | あり（件数 2） |

その下に注記（仕様書の文をそのまま）。

## 処理すべきエッジケース

1. `countHeadToHeadMatches` は**予定試合も数える**。条件は試合ページと同じ「2 以上」。自分で終了試合だけに絞らない
2. 同じ対戦相手が複数行あっても、件数の取得は 1 回
3. H2H の URL は `normalizeHeadToHeadSlug` で作る（チーム slug をアルファベット順に並べる）。自前で組み立てない
4. 注記の条件は「slug が `nations-championship-2026`」かつ「日本代表の試合で `kickoffAt >= 2026-11-27T00:00:00Z` のものが無い」。日本の決勝週末の試合が取り込まれたら消える
5. 中止（`cancelled`）の試合はブロックに出さない（前 spec と同じ）
6. `countHeadToHeadMatches` が throw したら、ページ全体を落とさずリンク無しで表示する（H2H は補助情報）。ただし `console.error` で記録する

## テストで気をつけること

- `tests/app/season-page-ia.test.tsx:100-104` のモジュールモックに `countHeadToHeadMatches` を足す。`normalizeHeadToHeadSlug` は `vi.importActual` で本物を使う
- 受け入れ条件 10: 「件数を見ずに全行にリンクを出す」「日付を見ずに slug だけで注記を出す」実装で**一時的に壊して落ちることを確認**し、PR 本文に書く（コミットしない）

## やってはいけないこと

- title / description を変えること
- 放送情報を推測で書くこと（JRFU 公開待ち）
- ファイナルズの対戦相手や日時を推測で書くこと。注記の文は仕様書のまま
- 大会トップの表示を変えること

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test`
- スクリーンショット: `/c/nations-championship/2026` と `/c/pnc/2026` の 1440px・375px（計 4 枚）

## 完了時

- PR 本文に: 変更ファイル一覧、受け入れ条件 1〜12 それぞれの確認方法と結果、「壊して落ちた」確認の内容、スクリーンショット
- PR 作成まで。マージはしない
