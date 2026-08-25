# URC 2026-27 の取り込みを wikitext へ移行する（wikitext 移行 第2弾）

## 背景

**URC 2026-27 の試合が本番 DB に1件も入っていない。** 開幕は9月下旬（前季 2025-26 は 2025-09-26 開幕）で、約1ヶ月後に迫っている。

このままだと開幕後も `/c/urc/2026-27` は前シーズンの終了済み試合しか表示せず、順位表も更新されない。検索から来た読者が「終わった試合しかないページ」に着く。

### Wikipedia 側にデータはある

2026-08-25 に実際に確認した。

- `https://en.wikipedia.org/wiki/2026–27_United_Rugby_Championship` は**存在する**
- Round 1〜18 ＋ ノックアウトの節構成を持ち、**約144個の試合テンプレートが日程・会場つきで載っている**

**「Wikipedia 待ち」ではない。取り込みが黙って失敗している。**

### なぜ Premiership だけ成功しているのか

`specs/feat-european-club-2026-27-season.md`（PR #675、commit `ae4d302`）で3大会とも 2026-27 に対応したはずだが、実際に入ったのは Premiership だけ（90試合）。

| 大会 | 取得方式 | 2026-27 |
|---|---|---|
| Premiership | **wikitext**（`feat-wikitext-ingestion-migration.md` 第1弾で移行済み） | ✅ 90 |
| **URC** | **HTML パース**（未移行） | ❌ 0 |

`lib/ingestion/live-competitions.ts:102` に `fetch: () => fetchUrc("2026-27")` が登録済みで、**配線は正しい。壊れているのはパース層。**

本 spec は D016 決定2 が挙げた移行対象9大会（URC が筆頭）の**第2弾**にあたる。第1弾 spec は「URC の移行は本 spec では行わない（D016 決定6）」と明記しており、その後続として起票する。

## 移行を阻んでいる具体的な差分

Premiership と URC のページを実際に比較した（2026-08-25）。

| | Premiership 2026-27 | URC 2026-27 |
|---|---|---|
| テンプレート名 | `{{Rugbybox}}` | `{{rugbybox collapsible2}}` |
| `date` パラメータ | `25 September 2026`（**年あり**） | `25 September`（**年なし**） |
| `home` の中身 | チーム名リンクのみ | `[[Benetton Rugby|Benetton]] {{flagicon|ITA}}` |

### テンプレート名の差は既に吸収されている

`parseWikitextTemplates`（`lib/ingestion/sources/wikipedia-wikitext.ts:138-160`）の正規表現は次のとおり。

```ts
const templateStart = new RegExp(`\\{\\{\\s*${escapedName}\\b`, "gi");
```

`\b` は `rugbybox` 直後の空白にもマッチするため、**`parseWikitextTemplates(wikitext, "rugbybox")` は `{{rugbybox collapsible2}}` も拾う。** 共通ヘルパを書き換える必要はない。

### 年が無いことが本当の障害

`parsePremiershipKickoffAt`（`lib/scrapers/premiership-kickoff.ts:3-4`）は4桁の年を要求する。

```ts
const KICKOFF_PATTERN =
  /(\d{1,2})(?:\/\d{1,2})*\s+([A-Za-z]+)\s+(\d{4})(?:\s*(\d{1,2}:\d{2}))?/;
```

URC 現行の `parseKickoffText`（`lib/ingestion/sources/wikipedia-urc.ts:50-58`）も同じく `\d{4}` を要求する。

**URC の wikitext には年が無いため、そのまま流用すると全144試合が日付解析に失敗して捨てられる。** 年をシーズンから導出する処理が新たに要る。これが本 spec の中心。

### flagicon の混入に注意

D016 の教訓3 が**URC を名指しで**記録している。

> 「テンプレート部分を取り出す」という指示も、リンクと `{{flagicon}}` が併存する URC では国コードを拾ってしまう誤りだった

`home = [[Benetton Rugby|Benetton]] {{flagicon|ITA}}` から `ITA` を拾ってはいけない。`normalizeWikitextTeam`（`lib/ingestion/sources/wikipedia-wikitext.ts:182`）が既にあるので**まずこれを使い、実データで正しく `Benetton` が取れることを確認する**こと。取れない場合のみ URC 側で補正する。

## スコープ

対象:
- `lib/ingestion/sources/wikipedia-urc.ts` — wikitext パーサの追加と `fetchUrc` の再構成
- 年の導出ロジック（URC 固有）
- 上記のテスト

対象外:
- **Top 14。** D016 決定5 により**恒久的に対象外**。英語版は `Match_grid`（成績表のみ）、フランス語版も `Calendrier` は期間のみで、**試合単位の日付がどちらにも存在しない**。2026-27 のページが作られても入らない。別ソース（lnr.fr 等）の確保が必要で D016 の範囲外
- Super Rugby Pacific・Nations Championship・Autumn Nations 等の移行（第3弾以降）
- `lib/ingestion/sources/wikipedia-wikitext.ts` の共通ヘルパの変更
- `lib/scrapers/premiership-kickoff.ts` の変更（Premiership が依存）
- `lib/ingestion/sources/wikipedia-premiership.ts` の変更
- `lib/ingestion/live-competitions.ts`（既に正しく配線済み）
- **既存の 2025-26 データ。** HTML 経由で取り込み済みで、再取り込みや削除はしない
- 得点イベント（`match_events`）の取り込み統合（第1弾と同じく日程・スコア・会場のみ）

## 踏襲すべき既存の実装

`lib/ingestion/sources/wikipedia-premiership.ts:283-311` の流れをそのまま参考にする。**wikitext で置き換えるのではなく、wikitext を日程の正本にし、HTML はイベント用に best-effort で併用する。**

```ts
const wikitext = await fetchWikipediaWikitext([buildWikipediaPageTitle(season)]);
const wikitextMatches = parsePremiershipLiveWikitext(wikitext, sourceUrl);
let htmlMatches: ParsedLiveMatch[] = [];

try {
  const response = await fetchWithPolicy(sourceUrl);
  htmlMatches = parsePremiershipLiveHtml(await response.text(), sourceUrl);
} catch (error) {
  console.warn(`Unable to fetch event HTML for Premiership ${season}; continuing without event HTML.`, error);
}

return clearFutureZeroScores(preserveMatchEventHtml(wikitextMatches, htmlMatches));
```

`catch` で `isMissingWikipediaPage(error)` なら `[]` を返す分岐も踏襲すること。

**取得は既存の `fetchWithPolicy` を通すこと**（D016 決定1）。`skipRobotsCheck` は使わない。MediaWiki API と REST API は robots.txt で禁止されているため使わない。

## 年の導出方法

シーズン文字列（例 `"2026-27"`）から2つの年を得る。

- 開始年 = `2026`、終了年 = `2027`
- **8月〜12月 → 開始年、1月〜7月 → 終了年**

URC は9月開幕・6月終了なので、この境界で全試合を正しく振り分けられる。

**日付の範囲表記に注意。** Premiership 側では `22/23/24 January 2027` のような複数日表記が実在し、`KICKOFF_PATTERN` は `(\d{1,2})(?:\/\d{1,2})*` で**先頭の日を採用**している。URC でも同種の表記が現れうるため、同じ扱いにすること。

**年を推測で埋めない。** 月名が解釈できない、またはシーズン文字列が `YYYY-YY` 形式でない場合は、その試合をスキップして `console.warn` を出す。誤った年で登録するより落とす。

## 黙って0件にしない

現行の URC は0件でも静かに終わる。これが1ヶ月以上気づかれなかった原因である。D016 も「週次監査は『取り込めた試合数が想定より少ない』を検知しない」と盲点を記録している。

Premiership の wikitext パーサは0件で例外を投げる（`lib/ingestion/sources/wikipedia-premiership.ts:214-216`）。

```ts
if (rugbyboxes.length === 0) {
  throw new Error("No rugbybox templates found in Premiership wikitext.");
}
```

**URC も同じ挙動にすること。** ページが存在するのにテンプレートが0個なら異常であり、静かに `[]` を返してはいけない。

ただし「ページ自体が存在しない」場合（`isMissingWikipediaPage`）は正常系として `[]` を返す。**この2つを混同しないこと。**

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

なし（取り込みが直れば `/c/urc/2026-27` に試合が並ぶ）

## LLM 連携

なし

## 受け入れ条件

1. `fetchUrc("2026-27")` が **100件以上**の試合を返す（Wikipedia 上の試合テンプレートは約144個）
2. 返る試合の `kickoffAt` の年が正しい。**9〜12月の試合が 2026年、1〜6月の試合が 2027年**になっている
3. チーム名が `{{flagicon}}` の国コードではなく正しいチーム名として解決されている（例: `home = [[Benetton Rugby|Benetton]] {{flagicon|ITA}}` → `Benetton`）。16チームすべてが `TEAM_SLUG_BY_WIKIPEDIA_NAME` で解決でき、`continue` で落ちる試合が無い
4. `parseWikitextTemplates(wikitext, "rugbybox")` を使い `{{rugbybox collapsible2}}` を拾えている。**共通ヘルパ側の正規表現を変更していない**
5. ページは存在するがテンプレートが0個のとき、**例外を投げる**（静かに `[]` を返さない）
6. ページが存在しないとき（`isMissingWikipediaPage`）は `[]` を返し、例外を投げない
7. HTML の取得に失敗しても、wikitext 由来の試合は返る（イベント情報だけが欠ける）
8. `fetchUrc("2025-26")` が従来どおり動く。**既存シーズンの取り込みを壊していない**
9. `lib/scrapers/premiership-kickoff.ts`・`lib/ingestion/sources/wikipedia-wikitext.ts`・`lib/ingestion/sources/wikipedia-premiership.ts` に差分が無い
10. 年が導出できない入力でスキップし `console.warn` が出る。**誤った年で登録しない**
11. `fetchWithPolicy` を経由しており、`skipRobotsCheck` を使っていない
12. テストは**実際の Wikipedia の書式**を使う。手作りの単純なフィクスチャで済ませない（`{{rugbybox collapsible2}}`、年なしの `date`、`{{flagicon}}` 併存、空の `score`、複数日表記を含めること）
13. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

## 未解決の質問

- 2026-27 の試合は現時点で全て未実施のため `score` が空。`clearFutureZeroScores` が既にあるので 0-0 での登録は防げるはずだが、**実データで確認すること**
- **取り込み0件の検知が無い。** 本件が1ヶ月以上気づかれなかった原因であり、D016 も盲点として記録している。SRP・NC も同じ壊れ方をしうる。**本 spec では扱わないが、別 spec の候補として残す**
- Super Rugby Pacific と Nations Championship は HTML パースのまま。第3弾として同じ移行が必要になる可能性が高い
