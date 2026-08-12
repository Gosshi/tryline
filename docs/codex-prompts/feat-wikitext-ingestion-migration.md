`specs/feat-wikitext-ingestion-migration.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む。**D016（2026-08-12）が本 spec の根拠**で、対象大会・対象外の理由・段階移行の方針がすべて書かれている
- 背景: 現行の Wikipedia 系パーサはレンダリング後の HTML（見出し `id`・`div.mw-heading`・テーブルの列順）に依存しており、書式変更で壊れる。**Premiership 2025-26 は wikitext に93件あるのに DB は75件で、18試合が黙って欠落している**（毎月1〜3試合ずつ。月別内訳は spec 参照）
- **本 spec は第1弾で、Premiership だけを移行する。** 共通基盤は後続8大会が再利用する前提で作るが、移行自体はやらない

参考にする既存パターン:
- **取得の共通ポリシー**: `lib/scrapers/fetcher.ts` の `fetchWithPolicy`。**独自に `fetch` を呼ばず必ずこれを通す**（レート制限・User-Agent・robots の扱いを共通化するため）
- **ページ不在の判定**: `lib/ingestion/sources/live-source-utils.ts` の `isMissingWikipediaPage`
- **日付・スコア・UTC 変換**: 同ファイルの `parseDmyDate` / `parseScoreText` / `buildUtcIsoString` / `normalizeWhitespace`
- **チーム名 → slug のマッピング**: `lib/ingestion/sources/wikipedia-premiership.ts` の既存定数。**作り直さず流用する**
- **返り値の型**: `ParsedLiveMatch`（`live-source-utils.ts`）。**変更しない**

取得経路（**初版から変更。前回ここで停止した箇所**）:

```
GET https://en.wikipedia.org/wiki/<ページ名>?action=raw
```

- **MediaWiki API（`/w/api.php?action=query`）と REST API（`/api/rest_v1/`）は robots.txt で禁止されているため使わない。** 初版の指示が誤っていた。`robots.txt` の `User-agent: *` は `Disallow: /w/` と `Disallow: /api/` を持ち、`/w/` の許可例外は `action=mobileview` だけ。**前回 `RobotsDisallowedError` で停止した判断は正しい**
- `/wiki/` 配下は Disallow 対象外で、`?action=raw` が同じ wikitext を `text/x-wiki` のプレーンテキストで返す。実装が使っている `robots-parser` で許可を検証済み
- **レスポンスは JSON ではない。** `response.text()` をそのまま wikitext として扱う
- **ページ不在は 404 で判別する**（API 版の `missing` フラグではない）。`isMissingWikipediaPage` と同じ扱いにする
- **`skipRobotsCheck` は使わない。** 今後も、robots で弾かれる経路が仕様に書かれていた場合は実装せず停止して報告してほしい

`{{rugbybox}}` の実例（**2026-08-12 の実データ。初版に載せていた例は Six Nations のもので、Premiership とは形式が違っていた**）:

Premiership（本 spec の対象。`home` / `away`・プレーンなリンク・タイムゾーン表記なし）:

```
{{Rugbybox
|id = Northampton v Leicester
|date = [[East Midlands Derby (rugby union)|11 October 2025]]
|time = 15:05
|home = (1 BP) [[Northampton Saints]]
|score = 32–26
|away = [[Leicester Tigers]] (1 BP)
}}
```

Six Nations（後続。`team1` / `team2`・チームテンプレート・タイムゾーンリンク付き）:

```
{{rugbybox
|date = 5 February 2026
|time = 21:10 [[Central European Time|CET]]
|team1 = (1 BP) {{ru-rt|FRA}}
|score = 36–14
|team2 = {{ru|IRE}}
|stadium = [[Stade de France]], [[Saint-Denis, Seine-Saint-Denis|Saint-Denis]]
}}
```

URC（後続。チームのリンクと `{{flagicon}}` が併存）:

```
|team1 = (1 BP) [[Stormers]] {{flagicon|RSA}}
|team2 = {{flagicon|IRE|rugby union}} [[Leinster Rugby|Leinster]]
```

エッジケース:
- **チームのキーは `home`/`away` と `team1`/`team2` の2種類ある（前回停止した箇所）。** Premiership・SRP・Rugby Championship・PNC は `home`/`away`、URC・Six Nations・Nations Championship は `team1`/`team2`。**両方を別名として扱う**（`home ?? team1`）。片方だけだと取り込み0件になる
- **テンプレート名の大文字小文字が揺れる。** `{{Rugbybox`（Premiership 全93件）と `{{rugbybox`（URC 全151件）があり、**PNC は同一ページ内で混在**。大文字小文字を区別せず検出する
- **リンクは表示テキストを採る。リンク先ではない。** `[[Saracens F.C.|Saracens]]` → `Saracens`。**リンク先の `Saracens F.C.` は `TEAM_SLUG_BY_WIKIPEDIA_NAME` に存在しない**ので、リンク先を採ると解決に失敗する
- **`{{flagicon|...}}` は装飾なので除去する。** URC は `(1 BP) [[Stormers]] {{flagicon|RSA}}` のようにチームのリンクと国旗テンプレートが併存し、「テンプレート部分を取り出す」と国コードを拾ってしまう（初版の指示が誤っていた）
- **入れ子テンプレートで壊れないこと。** 値の中にテンプレートが入る。`}}` の単純検索では途中で切れるので、**波括弧の深さを数えて対応する終端を探す**
- **`(1 BP)` は接頭辞にも接尾辞にも付く。** `|home = (1 BP) [[Northampton Saints]]` と `|away = [[Leicester Tigers]] (1 BP)` が同一ブロック内に実在する。両方の位置で除去する
- **`date` がリンクになっている試合が1件ある。** `|date = [[East Midlands Derby (rugby union)|11 October 2025]]`。**上の「表示テキストを採る」を `date` にも適用すれば解ける**。しないとこの1件だけ落ちる
- **スコアの `–` は en dash（U+2013）でハイフンではない。** 既存の `parseScoreText` が扱えるか確認する。未開催試合はスコアが空 → `null`
- **タイムゾーンを自作しないこと。** Premiership の `time` は `15:05` のように時刻のみで、タイムゾーン表記がない（英国時間）。**既存の `parsePremiershipKickoffAt`（`lib/scrapers/premiership-kickoff.ts`）に `"11 October 2025 15:05"` の形で渡す。** BST/GMT 判定はこの関数が内部で持っている。時刻省略時は `00:00` 扱い
- 値のマークアップ除去: `[[A]]` → `A`、`[[A|B]]` → `B`、`{{ru|IRE}}` / `{{ru-rt|FRA}}` / `{{Rut|Highlanders}}` → 第1引数、`<br />` と `<ref>...</ref>` の除去
- **`eventId` は既存 DB と同形式にする（PR #689 の差し戻し理由その1）。** wikitext の `id` は `Sale v Gloucester`、既存 DB は `Sale_v_Gloucester`。**空白をアンダースコアに正規化する。** `upsert.ts` の `findExistingMatch` は `wikipedia_event_id` の完全一致で既存行を探し、外れると「大会+両チーム+キックオフ完全一致」に落ち、それも外れると `upsert.ts:130-132` が `null` を返して**新規挿入**する。キックオフが変わった試合が更新でなく重複行になる。`id` を持たないブロックが93件中3件あるので、代替キーは再実行で不変な値にすること
- **`rawHtml` を空文字にしない（PR #689 の差し戻し理由その2）。** `live-ingest.ts:338-341` が `rawHtml` から得点イベントを解析しており、**Premiership は `fetchEventMatches` を持たないためここが唯一の経路**。空にすると以後の全試合がイベント0件になる（本番では現在75/75がイベントを持つ）。イベント解析用に従来の HTML を別途取得する等で維持すること。**wikitext の `try1`/`con1`/`pen1` から組み立てる案はスコープ外なので、採る場合は実装前に停止して確認すること**
- **イベント HTML が取れないことを致命的エラーにしない（PR #689 の2回目の差し戻し理由）。** `throw` で試合データ全体の取り込みを止めないこと。`live-ingest.ts` 自身が `no event HTML for finished match ...; will retry on the next ingest.` と記録して継続しており、その設計に合わせる。**警告ログを出して `rawHtml` を空のまま通す。** HTML 側は best-effort。**HTML パーサが1件取りこぼしただけで全断する構造は、移行前より脆い**（従来は静かな欠落で済んでいた）
- **`round` / `roundName` を null 固定にしない（PR #689 の差し戻し理由その3）。** wikitext に `=== Round 1 ===` 形式の見出しが25個ある。`{{rugbybox}}` の走査中に直前のラウンド見出しを保持すれば復元できる
- **`{{rugbybox}}` が0件ならエラーにする。** 空配列を返して正常終了しないこと。**これが2シーズン気づかれなかった原因**。ページ自体が無い場合（`isMissingWikipediaPage`）とは区別する
- **共通ユーティリティは複数ページの wikitext を結合できる形にする。** 後続の SRP（`List of ...` + 本文）と Nations Championship（南北2ページ）が必要とする。`?action=raw` は1リクエスト1ページなので順に取得して結合する。**結合時もレート制限を守る**（`fetchWithPolicy` の既定3秒間隔）
- **ページ名の URL 化**: 空白は `_`、非 ASCII は URL エンコード。**ダッシュは en dash（U+2013）**（`2025–26_Premiership_Rugby`）

やらないこと:
- **Premiership 以外の大会の移行**（URC / SRP / Nations Championship / Autumn Nations / Six Nations / Rugby Championship / PNC / Greatest Rivalry）。共通基盤は再利用可能に作るが、移行は次の spec で行う
- RWC / Top 14 / リーグワンへの変更（D016 決定3・4・5 で恒久的に対象外）
- 得点イベント（`match_events`）の取り込み。`try1` / `con1` / `pen1` には触れない
- 過去シーズンのバックフィル
- `lib/scrapers/fetcher.ts` の変更
- `ParsedLiveMatch` 型の変更、`wikipedia-premiership.ts` の公開インターフェース変更
- `docs/decisions.md` / `specs/*.md` / `CLAUDE.md` / `AGENTS.md` の変更（AGENTS.md:180-181 で禁止）

完了の定義:
- spec の受け入れ条件1〜22をすべて満たす
- テストを追加する。最低限、次の10ケース。**フィクスチャは手作りせず、上記の実例をそのまま使う**（手作り HTML/wikitext は実データで壊れる前科がある）
  1. **`home` / `away` のブロックが解決される**（Premiership 形式）
  2. **`team1` / `team2` のブロックが解決される**（Six Nations 形式）
  3. **`{{Rugbybox` と `{{rugbybox` の両方が検出される**
  4. `[[A|B]]` から **`B`**（表示テキスト）が取れる
  5. **`{{flagicon|RSA}}` が併存してもチームのリンク側が採られる**（URC 形式）
  6. `(1 BP)` が**接頭辞・接尾辞のどちらでも**除去される
  7. **`date` がリンクのとき日付が解釈される**
  8. en dash のスコアが解釈され、空スコアが `null` になる
  9. **`{{rugbybox}}` が0件のときエラーになる**
  10. ページ不在時に `isMissingWikipediaPage` と同じ扱いになる
  11. **`eventId` が `Sale_v_Gloucester` 形式**（空白がアンダースコアに正規化されている）
  12. **`round` が `=== Round N ===` 見出しから取れている**
  13. **`rawHtml` が空でなく、得点イベントの解析に渡せる**
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **実際に叩いた URL の形を1つ、そのまま貼って報告する**（robots 準拠の確認のため）
- **実データで Premiership 2025-26 を解析し、得られた試合数を報告する。期待値は93件**（DB は75件なので +18）。spec 作成時に「別名 → 装飾除去 → 表示テキスト」の規則で **93/93 が既存マップで両チーム解決する**ことを机上検証済み。**93 に満たない場合は、落ちた件の `{{rugbybox}}` 全体を貼って報告すること**
- spec の受け入れ条件を1項目ずつ、満たしたことをどう確認したかと合わせて報告する（「CI green」だけの報告は不可）
- 共通ユーティリティが後続大会（複数ページ結合）に使える設計になっている根拠を説明する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
