# 日本代表の過去のテストマッチ結果を取り込み、H2H ページに通算成績を出す

## 背景

### H2H は Google で唯一「日本戦の前」に効いている入口

GA4（property 538067713、2026-08-26〜09-22、`sessionMedium = organic`）で、`/h2h/japan-vs-usa` は **34 ユーザー／34 セッション**。検索から着地したページの 3 位（1・2 位はシリーズのシーズンページ）。

日別の着地（同期間、`landingPage` が `/h2h/` で始まる行）:

| 日付 | `/h2h/japan-vs-usa` |
|---|---:|
| 9/1〜9/10 | 1〜4 / 日 |
| **9/12（日本 対 アメリカ 当日）** | **14** |
| 9/13〜9/15 | 5・1・2 |

GSC（2026-08-24〜09-20、`--dims page`）でも `/h2h/japan-vs-usa` は表示 245・クリック 28・平均順位 6.5 で、**サイト全体の Google クリック 61 の 46%**。検索語は件数が少なく GSC で匿名化されており、特定できていない。

### ところが、同じ条件の日本 対 フィジーは 0

1 週間後の日本 対 フィジー（9/19）の H2H `/h2h/fiji-vs-japan` は、**着地 0・GSC 表示 0**。Google で表示があった日本の H2H は `japan-vs-usa` と `france-vs-japan`（表示 18）の 2 ページだけ。

DB 上の過去の対戦はどちらも終了 3 試合で、**データの厚さに差は無い**。なぜアメリカ戦だけ取れたのかは分かっていない（インデックス状況は「未解決の質問」1）。

### H2H ページは「Tryline 収録分」しか出していない

`getHeadToHeadMatches`（`lib/db/queries/matches.ts:2079`）は `matches` テーブルだけから作る。description も「対戦成績（Tryline 収録分）」と明記している（`app/h2h/[pair]/page.tsx:73`）。取り込みを始めたのは 2020 年以降の一部なので、**11 月の相手は過去の対戦がほとんど載っていない**（2026-09-23 本番 DB、終了試合のみ）:

| 相手 | DB の終了試合 | 実際のテストマッチ数（下記の照合元） |
|---|---:|---:|
| ウェールズ（11/8） | 1 | **13** |
| イングランド（11/15） | 3 | **6** |
| スコットランド（11/21） | 1 | **9** |
| フィジー（10/24） | 3 | **22** |

「日本 ウェールズ ラグビー 対戦成績」を調べた人に、1 試合だけのページを見せている。

### 仮説（検証済みではない）

**「H2H に通算成績と過去の全対戦を載せれば、日本戦の前の検索で表示・クリックが増える」は仮説。** アメリカ戦で取れてフィジー戦で取れなかった理由が分かっていないので、データを厚くしても表示されない可能性がある。判定は下の「判定」で行う。

## スコープ

対象:
- 日本代表の過去のテストマッチ結果を保存する新テーブル
- Wikipedia から取り込む一度きりの取り込みスクリプト（再実行しても重複しない）
- H2H ページに「通算成績」と「過去の全対戦」を出す
- `countHeadToHeadMatches` に過去の対戦を含める

対象外:
- 日本以外の国どうしの過去の対戦（照合元が日本代表のページなので。仕組みは他国にも広げられる形にしておく）
- 過去の試合を `matches` テーブルに入れること。**試合ページが数百件増え、中身の無いページが検索に出る**（`project_index_bloat` と同型）。大会ハブ・カレンダー・チームページにも混ざる
- プレビュー・レビューの本文に過去の対戦成績を使うこと（LLM の入力変更は別 spec）
- H2H ページの title の変更（効果を切り分けるため。description は変える、下記）
- 定期実行。過去の結果は変わらない。新しい試合は既存の取り込みで `matches` に入る

## 照合元（2026-09-23 に wikitext を取得して確認）

Wikipedia「List of Japan national rugby union test matches」（`?action=raw`、87,749 バイト）。

- 年代ごとの見出し（`== 1930s ==` 〜 `== 2020s ==`）の下に、1 試合 1 行の表（`{| class="wikitable sortable"`）
- **表の列構成は 2 種類**（見出し行 `!` で判別する）:
  - `Date / Opponent / F / A / Venue / City / Winner`（8 表）
  - `Date / Tournament / Opponent / F / A / Venue / Winner / Report`（2 表）
- 日付は `YYYY-MM-DD`。`F` が日本の得点、`A` が相手の得点
- 相手は `[[Wales national rugby union team|Wales]]` のようなリンク。**A 代表や XV は表示名が違う**（`[[Wales national rugby union team|Wales XV]]`）
- 行の区切りは `|-bgcolor=...`。セルは 1 行 1 セルが基本だが `||` で並べた行もある
- 見出しに合わせて解析すると 417 行。**得点が空の行が 9 行**（2027 年 RWC など未実施）

見出しに合わせて解析し、表示名がリンク先の国名と一致する行（＝A 代表・XV を除いた正代表戦）を数えた結果（2026-09-23 取得分）:

| 相手 | 試合数 | 参考: 日本代表ページの通算成績表（2026-08-15 時点） |
|---|---:|---:|
| Wales | 13 | 13 |
| England | 6 | 6 |
| Scotland | 9 | 9 |
| Fiji | 22 | 21 |
| United States | 26 | 26 |
| Ireland | 12 | 12 |
| Italy | 11 | 11 |
| France | 7 | 8 |

照合元どうしで 1 試合ずれる相手がある。**本 spec の正は一覧ページ**とし、差は気にしない。直近の試合は `matches` の値を優先する（下記の重複除外）。

事実（日付・得点・会場）だけを保存し、文章は転載しない。

## データモデル変更

新テーブル `national_test_history`（マイグレーションを 1 本追加）:

| 列 | 型 | 制約 |
|---|---|---|
| `id` | uuid | PK、`gen_random_uuid()` |
| `team_id` | uuid | not null、`teams(id)` 参照（日本） |
| `opponent_team_id` | uuid | not null、`teams(id)` 参照 |
| `played_on` | date | not null |
| `team_score` | integer | not null |
| `opponent_score` | integer | not null |
| `venue` | text | null 可（`Venue` と `City` を「, 」でつないだもの。リンク記法を除く） |
| `competition_label` | text | null 可（`Tournament` 列がある表だけ。リンク記法を除く） |
| `source_url` | text | not null |
| `created_at` / `updated_at` | timestamptz | `now()` |

- 一意制約: `(team_id, opponent_team_id, played_on)`
- **RLS を有効化**し、`anon`・`authenticated` に SELECT だけを許すポリシーを付ける。書き込みポリシーは作らない（取り込みはサービスロール）
- `team_id <> opponent_team_id` の CHECK
- **マイグレーションは PR のマージ前に Owner が本番へ適用する**（`feedback_migration_before_merge`。新テーブルを読むページのコードが先に出ると本番が落ちる）。適用後、Claude Code が本番で RLS の有効化とポリシーを確認する（`feedback_new_table_rls_verification`）

## 取り込みスクリプト

新規 `scripts/import-japan-test-history.ts`（既存の `scripts/import-*.ts` と同じ置き方）。

- 取得: `fetchWikipediaWikitext(["List of Japan national rugby union test matches"])`（`lib/ingestion/sources/wikipedia-wikitext.ts`。`fetchWithPolicy` が robots.txt を確認する）
- 解析は純粋関数に分ける: `lib/ingestion/sources/wikipedia-japan-test-history.ts` の `parseJapanTestHistory(wikitext)`
  - 表ごとに見出し行から列の位置を決める
  - 相手は `[[X national rugby union team|表示名]]` の X。**表示名が X と一致しない行（`Wales XV` など）は除外**
  - `F`・`A` が整数でない行（未実施・空）は除外
  - 未来の日付は除外
- 相手の対応付け: X を `teams.name`（`kind = 'national'`）に照合する。一致しないものは別名表で吸収する（2026-09-23 時点で分かっている差: `Hong Kong` → `hong-kong-china`、`Chile` → `chile`）。**対応が取れない相手の行は取り込まない**（件数だけ出力する。例: Arabian Gulf、Chinese Taipei など DB に無い国）
- 書き込み: 一意制約で upsert（再実行しても重複しない）
- **既定は dry-run**（件数と、相手ごとの試合数を出すだけ）。`--apply` のときだけ書き込む
- 実行は Owner が本番に対して行う: `node --env-file=.env.production.local tools/run-ts.cjs scripts/import-japan-test-history.ts --apply`（`reference_run_scripts_against_prod`）

## API サーフェス

### 新規クエリ（`lib/db/queries/matches.ts` の H2H 関連の近くに置く）

```ts
export type HeadToHeadHistoryRow = {
  playedOn: string;          // "YYYY-MM-DD"
  teamSlug: string;          // 記録側（日本）
  opponentSlug: string;
  teamScore: number;
  opponentScore: number;
  venue: string | null;
  competitionLabel: string | null;
};

export async function getHeadToHeadHistory(teamSlugA: string, teamSlugB: string): Promise<HeadToHeadHistoryRow[]>;
```

- `(team_id, opponent_team_id)` が A・B のどちらの向きでも取る（今は日本側しか無いが、向きを決め打ちしない）
- `played_on` の降順

### 重複の除外と通算成績

`matches` に入っている試合と、履歴テーブルの同じ試合を二重に数えない。

- **同じ 2 チームで、`matches.kickoff_at` の UTC 日付と `played_on` の差が 1 日以内なら同じ試合**とみなし、`matches` 側を残す（スコアも `matches` 側。試合ページへのリンクもある）
- 通算成績は「履歴（重複を除いたもの）＋ `matches` の終了試合」から、ページの `teamA` 側で勝・敗・分を数える
- 純粋関数に分ける（例: `mergeHeadToHeadRecords`・`summarizeHeadToHeadRecord`）

### `countHeadToHeadMatches`（`lib/db/queries/matches.ts:2179`）

履歴の試合数（重複除外後）を足す。これで、過去の対戦が多い相手（例: 日本 対 イタリア、DB では 1 試合）にも、試合ページやシーズンページから H2H へのリンクが出るようになる（条件は既存の「2 以上」のまま）。

## UI サーフェス

`app/h2h/[pair]/page.tsx`。**履歴が 1 件も無いペアの見た目は変えない。**

### 通算成績（履歴があるペアだけ）

既存の指標 `<Metric label="収録対戦" …>`（`:159` 付近）の並びを、履歴があるときは次に置き換える:

- 「通算 13 試合」
- 「日本の 2 勝 11 敗」（引き分けがあれば「◯分」を足す）
- 「初対戦 1973 年」

### 過去の全対戦（履歴があるペアだけ）

既存の試合一覧の下に「過去の対戦（◯試合）」の節を足す。

- 新しい順。各行: 日付・スコア（日本側を先に）・会場・大会名（あれば）
- `matches` に入っている試合は既存の一覧に出ているので、ここには出さない（重複除外）
- 10 件を超える分は `<details>` で折りたたむ
- 節の末尾に出典を 1 行: 「出典: Wikipedia『List of Japan national rugby union test matches』（◯年◯月◯日取得）」。取得日はスクリプトが書き込んだ `created_at` の最大値

### 既存の注意書き

`:166` の「このカードは収録対戦データが少ないため、傾向の断定は避けています。」は、**通算の試合数（重複除外後）が 5 以上なら出さない**。5 未満なら従来どおり出す。`:192` の見出し「収録対戦リスト」はそのまま（Tryline の試合ページへのリンクがある一覧なので）

### description

履歴があるペアだけ、`（Tryline 収録分）` を通算成績に置き換える:

```
ラグビー日本代表とウェールズの通算対戦成績（13試合 2勝11敗）。過去の全対戦のスコアと、直近の日本語レビューへのリンク。
```

title は変えない。

### デザイン

design.md の既存トークン（`--color-ink` / `--color-ink-muted` / `--radius-md` / `--shadow-soft`）を使い、新しいトークンを作らない。一覧の行は `maxEmptyRatio: 0.25` を守る（シーズンページの日本代表ブロックと同じく、日付を固定幅の左列に置く）。

## LLM 連携

なし。

## 判定

- 対象: `/h2h/fiji-vs-japan`（10/24）、`/h2h/japan-vs-wales`（11/8）、`/h2h/england-vs-japan`（11/15）、`/h2h/japan-vs-scotland`（11/21）
- 各試合の前後 7 日の Google 表示・クリック（GSC `--dims page`）と、検索からの着地（GA4）を見る
- 比較の基準は `/h2h/japan-vs-usa`（2026-08-26〜09-22 の検索着地 34、うち試合当日 9/12 に 14）
- **4 ページとも表示が 0 のままなら、データの厚さは主因ではない。** インデックスの問題として別途調べ、H2H への追加投資はしない

## 受け入れ条件

### 解析（`tests/ingestion/wikipedia-japan-test-history.test.ts`）

fixture は実ページの wikitext をそのまま保存したもの（`tests/fixtures/wikipedia-japan-test-matches.wiki`。手作りしない）。取得日をテストのコメントに書く。

1. fixture を解析すると、相手ごとの正代表戦の数が次のとおり: Wales 13、England 6、Scotland 9、Fiji 22、United States 26（2026-09-23 取得分の値。fixture を取り直して変わった場合は、取得日と値をテストに書いて合わせる）
2. 2 種類の列構成の両方から読める。例: `2013-06-15` Wales 23–8（`City` 列がある型）と、`2021-07-03` Ireland 31–39（`Tournament` 列がある型）
3. `Wales XV` のような表示名の行は含まれない
4. 得点が空の行（例: `2027-10-15` United States）は含まれない
5. `venue` にリンク記法や `<ref>` が残らない

### 取り込み（`tests/scripts/import-japan-test-history.test.ts`）

6. 既定（`--apply` なし）では DB に書き込まない
7. `--apply` で upsert を呼び、一意キーは `(team_id, opponent_team_id, played_on)`
8. `teams` に無い相手の行は書き込まず、件数だけ出力する

### 重複除外と通算（純粋関数の単体テスト）

9. 履歴に `2025-11-15 Wales`（日本 23–24）があり、`matches` に本番と同じ「`2025-11-15T17:40:00Z`、ウェールズ（ホーム）24–23 日本、終了」があるとき、通算は 1 試合として数え、スコアは `matches` 側を使う（ホーム・アウェイが逆向きでも一致させる）
10. `matches` の `kickoff_at` が UTC で前日（例 `2025-11-14T23:30:00Z`）でも同じ試合とみなす。2 日ずれたら別の試合
11. ページの `teamA` がウェールズ側のとき、勝敗がウェールズ視点で数えられる（例: 日本 2 勝 11 敗 → ウェールズ 11 勝 2 敗）
12. 引き分けを数える

### ページ（`tests/app/h2h-page.test.tsx` など既存の H2H ページのテストに追加）

13. 履歴があるペアで「通算 ◯ 試合」「日本の ◯ 勝 ◯ 敗」「初対戦 ◯ 年」と「過去の対戦」節が出る
14. 履歴が無いペアの DOM と description は変わらない（既存テストが無変更で通る）
15. 11 件以上で `<details>` に折りたたまれる
16. 出典の行が出る

### `countHeadToHeadMatches`

17. `matches` に 1 試合・履歴に同じ試合を含む 11 試合のペアで 11 を返す（重複を除く）

### 共通

18. **壊して落ちる確認**: 条件 3 が「表示名を見ずにリンク先だけで判定する」実装で、条件 9 が「重複を除外しない」実装で落ちることを一時的に壊して確認し、PR 本文に書く（コミットしない）
19. マイグレーションに RLS 有効化と SELECT ポリシーが入っていることを、既存のマイグレーションテスト（`tests/db-migrations-*.test.ts`）と同じ形で確認する
20. `pnpm lint`・`pnpm typecheck`・`pnpm test` が通り、CI（`gh pr checks`）が緑

### 本番（順序が大事）

21. Owner がマイグレーションを本番に適用 → Claude Code が RLS とポリシーを確認 → PR をマージ → Owner が `--dry-run` で件数を確認 → `--apply` で取り込み → Claude Code が `/h2h/japan-vs-wales` などで表示を確認

## 既存テストの巻き添え

- `countHeadToHeadMatches` を呼ぶテスト（`tests/app/season-page-ia.test.tsx`、試合ページのテスト）はモックしているので影響しないはず。モックせずに呼んでいるテストがあれば、履歴クエリのモックを足す
- H2H ページのテストで `getHeadToHeadPageData` をモックしているものは、新しい戻り値の項目（履歴）が無くても動くこと（履歴なし＝既存表示）

## 締切

- **10/24 の日本 対 フィジーの 1 週間前（10/17）までに本番で取り込み完了**を目標にする。11 月の 3 戦にも間に合う
- Google が新しい内容を反映するまで数日〜数週間かかるので、早いほど良い

## 競合とマージ順

- 触るファイル: `lib/db/queries/matches.ts`（H2H 関連の関数のみ）、`app/h2h/[pair]/page.tsx`、新規ファイル群、マイグレーション
- 2026-09-23 時点で、これらを触る open PR は無い

## 本番操作

- マイグレーションの適用（Owner）
- 取り込みスクリプトの実行（Owner）。Claude Code は INSERT を実行しない（CLAUDE.md）

## 未解決の質問

1. **H2H ページのインデックス状況**: `/h2h/fiji-vs-japan` が Google に表示されない理由（未登録か、登録済みで順位が低いか）を URL 検査で確認中（2026-09-23 着手）。未登録が原因なら、本 spec と別にインデックスの対策が要る
