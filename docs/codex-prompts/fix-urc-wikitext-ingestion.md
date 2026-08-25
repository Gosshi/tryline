`/specs/fix-urc-wikitext-ingestion.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

これは `specs/feat-wikitext-ingestion-migration.md`（第1弾・Premiership）の**第2弾**です。第1弾が「URC の移行は本 spec では行わない」と明記していた部分にあたります。

## 急ぐ理由

**URC 2026-27 の開幕は9月下旬**（前季は 2025-09-26 開幕）で約1ヶ月後です。現状 DB は0件で、Wikipedia には約144試合が載っています。開幕までに直らないと、検索から来た読者が「終わった試合しかないページ」に着きます。

## 最初に読むファイル

| ファイル | 何を確認するか |
|---|---|
| `lib/ingestion/sources/wikipedia-premiership.ts:283-311` | **移植元の流れ**。wikitext を正本にし HTML をイベント用に併用する構造 |
| 同 `:208-216` | wikitext パーサの入口と、**0件で例外を投げる処理** |
| `lib/ingestion/sources/wikipedia-wikitext.ts:138-160` | `parseWikitextTemplates`。**変更しない** |
| 同 `:182` | `normalizeWikitextTeam`。flagicon の除去に使えるか確認する |
| `lib/scrapers/premiership-kickoff.ts:3-4` | 4桁の年を要求する正規表現。**変更しない** |
| `lib/ingestion/sources/wikipedia-urc.ts` | 移行対象 |
| `docs/decisions.md` の D016 | 決定1（robots.txt）・教訓3（URC の flagicon）を必ず読む |

## 実装の勘所は「年」です

URC の wikitext は `date = 25 September` で**年を持ちません**。Premiership は `date = 25 September 2026` で年を持つため、既存の日付パーサがそのまま使えていました。

**そのまま流用すると全144試合が日付解析に失敗して捨てられます。** シーズン文字列から年を導出する処理を新たに書いてください。8〜12月は開始年、1〜7月は終了年です。

## 罠が3つあります

1. **テンプレート名は `{{rugbybox collapsible2}}`**（Premiership は `{{Rugbybox}}`）。ただし `parseWikitextTemplates` の正規表現は `\{\{\s*rugbybox\b` で、`\b` が空白にマッチするため**そのまま拾えます**。共通ヘルパを書き換えないでください

2. **`home` に flagicon が混ざります**。`[[Benetton Rugby|Benetton]] {{flagicon|ITA}}` から `ITA` を拾ってはいけません。D016 の教訓3 が URC を名指しで記録している既知の罠です。まず `normalizeWikitextTeam` を試し、正しく `Benetton` が取れることを実データで確認してください

3. **0件を静かに返さないでください**。これが1ヶ月以上気づかれなかった原因です。ページが存在するのにテンプレート0個なら**例外を投げる**。ただしページ自体が無い場合（`isMissingWikipediaPage`）は正常系として `[]` を返す。この2つを混同しないこと

## やってはいけないこと

- `lib/ingestion/sources/wikipedia-wikitext.ts` の変更（共通ヘルパ）
- `lib/scrapers/premiership-kickoff.ts` の変更（Premiership が依存）
- `lib/ingestion/sources/wikipedia-premiership.ts` の変更
- **Top 14 に手を出すこと。** D016 決定5 により恒久的に対象外です（英語版もフランス語版も試合単位の日付を持たないため、パースを直しても入りません）
- 既存の 2025-26 データの再取り込み・削除
- MediaWiki API / REST API の使用（**robots.txt で禁止**）。`fetchWithPolicy` を通し `skipRobotsCheck` は使わない
- 年が導出できないときに**推測で埋めること**。スキップして `console.warn` を出す

## テストについて

**手作りの単純なフィクスチャで済ませないでください。** このリポジトリでは過去に、実データと乖離したフィクスチャでテストが通ったのに本番で壊れた事故が起きています。

実際の Wikipedia の書式を使い、以下を必ず含めてください。

- `{{rugbybox collapsible2}}` というテンプレート名
- 年なしの `date`（`25 September`）
- `{{flagicon}}` が併存する `home` / `away`
- 空の `score`（未実施試合）
- 複数日表記（`22/23/24 January` 形式）

## 完了の定義

spec の「受け入れ条件」13項目をすべて満たすこと。特に:

- `fetchUrc("2026-27")` が **100件以上**返る
- 9〜12月の試合が 2026年、1〜6月の試合が 2027年
- `git diff` に `wikipedia-wikitext.ts` / `premiership-kickoff.ts` / `wikipedia-premiership.ts` が含まれない
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が clean

## PR 本文に必ず含めること

- `fetchUrc("2026-27")` を実際に走らせた結果の**件数**と、**最初と最後の数試合の日付・チーム名**（年が正しいことの証跡）
- `fetchUrc("2025-26")` が従来どおり動くことの確認
- チーム名解決で `continue` に落ちた試合が0件であることの確認
- `git diff --stat`
