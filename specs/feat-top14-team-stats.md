# feat-top14-team-stats

## 背景

recap の tactical_depth が伸びない根本原因は「試合中のチームスタッツ（ポゼッション率・テリトリー率・タックル数・セットピース成功率・キャリー数）」が完全に欠落していることだと `feat-derived-match-stats.md` 自身が名指ししている。同specで導入した派生スタッツ（`derived_stats`）は `match_events` から機械的に計算できる範囲（連続得点・逆転幅・シンビン中の失点等）に留まり、「スクラムで圧倒した」「ラインアウト成功率67%が敗因」のようなラグビー分析記事らしい具体的な深掘りはできない。これが第3層＝本specの対象。

2026-07-05、`tryline-web-researcher` エージェントによる9大会（Top14, URC, Premiership, Six Nations, Rugby Championship, Super Rugby Pacific, RWC, League One公式, J SPORTS）横断調査で、**Top14公式サイト（top14.lnr.fr）だけが唯一、静的HTML/SSR相当でチームスタッツの実数値を取得できる**ことを確認した。他8ソースは全てJSレンダリング必須（ヘッドレスブラウザ導入という別の技術投資が必要）か、データ自体が非公開。よって本specはTop14限定のパイロットとし、他大会への横展開は別spec・別判断とする。

確認済みの実例（2026-07-05時点）:
`https://top14.lnr.fr/feuille-de-match/2025-2026/j24/11469-lyon-bayonne/statistiques-du-match`
このページに以下がWebFetch（JS実行なし）で読み取れる実数値として掲載されている:

- ポゼッション率（自陣/敵陣/敵22m内別）
- テリトリー率
- ラインアウト獲得数・成功数
- スクラム獲得数・成功数
- タックル成功数
- ペナルティ数・イエローカード
- キャリー数（ballons joués）
- エラー数（en-avant / ノックオン）

`lnr.fr` / `top14.lnr.fr` の robots.txt に `/feuille-de-match` `/statistiques` を対象とした Disallow は存在しない（動画・検索・会員登録系のみ禁止）。

**設計不変条件への適合**: スクレイプした生テキストは再配信しない。数値そのものは著作権保護対象外だが、recap本文への反映は必ずLLMによる書き起こしを経る（既存パイプラインと同じ）。robots.txt 準拠は既存 `fetchWithPolicy`/`isAllowed` を再利用。

## スコープ

対象:

- Top14の試合のみ（他大会は対象外）
- `lib/scrapers/top14-match-stats.ts`（新規）: `top14.lnr.fr` の試合スタッツページを取得・解析する読み取り専用スクレイパー
- 試合IDの名寄せ（Tryline内部の match ↔ LNRサイトのURLスラッグ）の仕組み
- `match_team_stats` テーブル（新規）
- `lib/llm/stages/assemble.ts` / `lib/llm/types.ts`: `AssembledContentInput` への `team_stats` 追加
- `lib/llm/prompts/generate-recap.ts` / `qa-content.ts`: team_stats ブロックの注入とQAグラウンディング
- 新規 `scripts/backfill-top14-team-stats.ts`（バックフィル用CLI）

対象外:

- Top14以外の大会（URC・Premiership・Six Nations・Rugby Championship・Super Rugby Pacific・RWC・League One）— ヘッドレスブラウザ導入 or 内部JSON API直叩きの技術投資が別途必要。今回は着手しない
- 既存published recapの一括再生成（試し焼き5件までに留める。298件draft化事故の教訓）
- preview への注入（team_statsは試合終了後にしか存在しない。recapのみ対象。`derived_stats` と同じ扱い）

## 事前調査（実装前にCodexが実施すること）

1. **試合IDの解決方法を確定する**: 確認済みURLパターンは `/feuille-de-match/{season}/j{round}/{id}-{home}-{away}/statistiques-du-match` だが、数値ID（例: `11469`）はTryline側の情報からは分からない。`top14.lnr.fr` に大会全体の試合結果一覧ページ（例: `/calendrier-resultats/{season}/j{round}`）が存在し、そこから各試合の数値IDを一括取得できるか確認する。できない場合、名寄せ方式（チーム名+日付でのマッチング）が成立するか含めて再検討し、この節に結果を追記する
2. 上記1で確認したURL構造で、**シーズン全体（2025-2026）の全ラウンド分の試合一覧が機械的に列挙できるか**を確認する
3. スタッツページの数値が試合終了直後から掲載されているか、それとも一定のタイムラグがあるかを確認する（記事生成のタイミング設計に影響）

### Codex 事前調査結果（2026-07-06）

- `https://top14.lnr.fr/robots.txt` は 200。`/feuille-de-match` と `/calendrier-et-resultats` は Disallow 対象外。
- 例示の `https://top14.lnr.fr/feuille-de-match/2025-2026/j24/11469-lyon-bayonne/statistiques-du-match` は 200 で、JS実行なしのHTML内にスタッツ本文が含まれる。
- 当初例示の `/calendrier-resultats/{season}/j{round}` は 404。実際の一覧URLは `https://top14.lnr.fr/calendrier-et-resultats/{season}/{roundSlug}`。`https://top14.lnr.fr/calendrier-et-resultats/2025-2026/j24` は 200 で、J24 の7試合すべての `feuille-de-match` リンク（例: `11469-lyon-bayonne`）をSSR HTMLから取得できる。
- LNR公式サイトのVueルーティングでも `route/{season}/{week.slug}` が確認でき、レギュラーシーズンは `j1`〜`j26`、プレーオフは `demi-finales` / `finale` などの slug で機械的に列挙可能。
- Tryline側の `matches.external_ids.wikipedia_round` または `round_name` から `roundSlug` を導出し、ラウンド一覧ページの `feuille-de-match` リンクをチームslugで照合して `top14_lnr_id` を `matches.external_ids` に保存する方式で確定する。スタッツURLは照合済み `matchPath + "/statistiques-du-match"` で生成する。
- レビュー対応の再確認として、`fetchWithPolicy` 経由で `https://top14.lnr.fr/feuille-de-match/2025-2026/j24/11469-lyon-bayonne/statistiques-du-match` を取得し、`parseTop14MatchStatsHtml` が実HTMLから値を抽出できることを確認した。抽出例: Bayonne 側 `possession_pct=62`, `territory_pct=69`, `scrums_total=10`, `scrums_won=6`, `lineouts_total=14`, `lineouts_won=9`, `tackles_made=84`, `tackles_missed=21`, `carries=15`; Lyon 側 `possession_pct=38`, `territory_pct=31`, `tackles_made=181`, `yellow_cards=2`。

## データモデル変更

新規テーブル `match_team_stats`:

```sql
create table match_team_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id),
  team_id uuid not null references teams(id),
  possession_pct numeric,
  territory_pct numeric,
  lineouts_won integer,
  lineouts_total integer,
  scrums_won integer,
  scrums_total integer,
  tackles_made integer,
  tackles_missed integer,
  carries integer,
  penalties_conceded integer,
  yellow_cards integer,
  red_cards integer,
  errors integer,
  source text not null default 'top14-lnr',
  source_url text not null,
  created_at timestamptz not null default now(),
  unique (match_id, team_id)
);
```

`source` カラムは将来他大会のソースを追加する際の判別用（今回は `'top14-lnr'` 固定）。

`matches.external_ids` に新フィールド（例: `top14_lnr_id`）を追加し、名寄せ結果を保存する。既存の `wikipedia_url`/`wikipedia_event_id` と同じ役割。

## スクレイピング実装方針

- `lib/scrapers/fetcher.ts` の `fetchWithPolicy`（robots.txt準拠・レート制限・リトライ）をそのまま再利用する。新規HTTPクライアントは作らない
- パースは `cheerio`（既存依存）で行う。ページ内容をLLMに要約させる方式は使わない（数値抽出は決定的なDOMセレクタで行い、任意のテキストをLLMに解釈させない。スクレイピング先ページに悪意あるテキストが埋め込まれていても、cheerioによる構造化抽出であれば無関係な文字列は数値フィールドに混入しない）
- 抽出した各数値フィールドは型検証する（パーセンテージは0〜100の数値、カウント系は0以上の整数であることを確認し、範囲外・パース不能な値は該当試合のレコードごと保存せず警告ログを出す。既存 `fill-event-gaps.ts` の「fetch失敗をcatchして継続」と同じ防御的姿勢）

## LLM連携

- `lib/llm/stages/assemble.ts`: `match_team_stats` を home/away 2行取得し `AssembledContentInput.team_stats`（型は `{ home: TeamStats | null; away: TeamStats | null } | null`）として組み立てる。Top14以外の大会・データ未取得試合では `null`
- `lib/llm/prompts/generate-recap.ts`: `derived_stats` ブロックと同様の位置に `team_stats` ブロックを追加。**`derived_stats` と異なりパーセント表記を許可する**（これは実データであり `containsUnsupportedStatistic` ガードが本来ブロックしたい「LLMの創作」ではないため）。プロンプトの一文: 「以下は公式サイトから取得した実際のチームスタッツです。ポゼッション率・成功率等の数値表現をそのまま使ってよい」
- `containsUnsupportedStatistic`（`lib/content/fabrication-guard.ts:65`）は `supportedFacts: string[]` に対して信号一致チェックを行う。現在 `lib/llm/stages/qa.ts:139-141` で `matchContext.sourcedFacts?.map((fact) => fact.fact)` のみを渡している。ここに team_stats から生成した事実文字列（例: `"ホームチームのポゼッション率58%"` `"アウェイチームのラインアウト成功率83%"`）を配列として追加し、`containsUnsupportedStatistic` に渡す `supportedFacts` に含める。新規ヘルパー（例: `buildTeamStatsFactStrings(teamStats)`）を用意し、sourcedFacts の配列と結合する
- `lib/llm/prompts/qa-content.ts`: `QaMatchContext` に `teamStats` を追加し、`derivedStats`/`sourcedFacts` と同様のグラウンディングブロックを注入（QAが正当な数値記述を「根拠なし」と誤判定して減点しないため）
- `PROMPT_VERSION`: `generate-recap.ts` は現行 `"recap@4.11.0"` → `"recap@4.12.0"` に、`qa-content.ts` は現行 `"qa@2.2.0"` → `"qa@2.3.0"` にバンプ（2026-07-06時点の実測値。実装時に変わっていれば連番を振り直す）

## 受け入れ条件

1. 事前調査（上記）の結果をこのファイルに追記し、試合ID解決方式が確定している
2. `scripts/backfill-top14-team-stats.ts --dry-run` で、2025-2026シーズンの終了済みTop14試合のうちLNR側で名寄せできた件数が0より多く表示される
3. 本実行後、`match_team_stats` に home/away 2行ずつ、値が妥当な範囲（0-100%、非負整数）で保存されている
4. team_stats がある試合でrecapを生成すると、プロンプトに「チームスタッツ」ブロックが含まれ、生成されたrecap本文に具体的な数値（例: ラインアウト成功率、タックル数）への言及が最低1つ含まれる（試し焼き5件で目視確認）
5. `containsUnsupportedStatistic` ガードが team_stats 由来の記述を誤ブロックしない（既存のsourced_facts経路と同様のテストケースを追加）
6. `pnpm test` 全体が通る・TypeScript strict エラーなし
7. **既存published Top14 recapの一括再生成はこのspecの範囲外**。試し焼き5件のみ実施し、結果をOwnerに報告してから追加の再生成要否を判断する

## 未解決の質問

- 2025-2026シーズンは既に終了間近（例示URLが j24=ラウンド24）。今シーズン分をバックフィル対象に含めるか、2026-2027シーズン開幕分から新規適用にするかはOwner判断
- スタッツページのデータ提供元（Opta等の可能性、J SPORTS側で確認された「Opta」ロゴと同一プロバイダかは未確認）によっては、将来的に他大会展開時に同一パーサーを流用できる可能性がある。今回は調査対象外
- 他8大会（JSレンダリング必須）への展開は、ヘッドレスブラウザ導入 or 内部JSON API直叩きのどちらを取るかの技術投資判断が前提。別specとする
