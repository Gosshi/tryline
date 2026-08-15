# 汎用ラインアップ取込＋再生成の手動ワークフロー

## 背景

`app/api/cron/ingest-lineups`（汎用・Wikipedia 経由）は 2026-08-15 現在、**GitHub Actions のどのワークフローからも叩かれていない**。

```
$ grep -l "ingest-lineups" .github/workflows/*.yml
（0 件。ヒットするのは ingest-league-one-lineups のみ）
```

存在する 6 本の ingest 系ワークフロー（`cron-ingest-broadcasts` / `fixtures` / `squads` / `standings` / `world-rankings` / `league-one-lineups`）のうち、ラインアップを扱うのは League One 専用の 1 本だけ。**League One 以外の試合でラインアップを取り込む手段が、Owner の手元に存在しない。**

### なぜこれが実害になるか

ラインアップは試合の 1〜2 日前に発表されるが、プレビューはそれより前に生成される。そして**既にプレビューが存在する試合に対しては、ラインアップ取込が改めて走る経路がない**。結果として「発表前に作られた選手名ゼロのプレビューが、発表後もそのまま published で残る」。

`specs/feat-jrfu-lineup-ingestion.md` で日本代表戦については決め打ち取得を足したが、それ以外（Premiership・URC・Top 14・Super Rugby Pacific・Nations Championship 等）は依然として手動で叩く口がない。

### 雛形は既にある

`.github/workflows/cron-ingest-league-one-lineups.yml` が同じ構造（`workflow_dispatch` + `match_ids` → ingest → fetch-sourced-facts → generate-content の 3 段）を実装済み。本 spec はこれを汎用化した 1 本を足すもので、新しい仕組みを設計するものではない。

### 雛形からそのまま持ってきてはいけない 2 点

1. **`content_type: auto` は成立しない。** League One 版の `auto` 判定は、ワークフロー内にハードコードされたプレーオフ 6 試合の `FINISHED` / `SCHEDULED` リストとの照合で実装されている（56-57 行目）。汎用版はどんな試合 ID も受けるため、この方式は使えない
2. **失敗が握り潰される。** League One 版は non-200 を `echo "WARN: …"` するだけでジョブは常に green。2026-08-14 の放送情報の件（対応表 1 行の不足で肝心の試合の放送情報が落ちていた）と同じ失敗モードで、「動いたが何も入らなかった」が Owner に見えない

### 本 spec が解決しないこと（重要）

**「叩く口を作る」ことと「叩けば入る」ことは別問題である。**

本 spec の作成中に、`app/api/cron/ingest-lineups/route.ts` を実読して以下 2 つの阻害要因を確認した。**どちらも本 spec では直さない。**

#### 阻害要因 1: `players.slug` NOT NULL 違反（ブロッカー）

`ensurePlayerIds()`（`route.ts:91-142`）は未登録選手を `players` へ insert するが、渡しているのは `team_id` / `name` / `external_ids` の 3 列のみで **`slug` を含んでいない**。

一方 `supabase/migrations/20260517010000_add_player_slugs.sql:24` で `players.slug` は `SET NOT NULL` されており、同マイグレーションに DEFAULT もトリガーも定義されていない。

これは `specs/feat-jrfu-lineup-ingestion.md` が「PR #690 が本番で `{"error":"Failed to ingest lineups"}` を返した直接の原因」として記録しているものと**同一のバグ**であり、JRFU 経路が撤去された今も汎用ルート側に残っている。

**したがって、未登録選手が 1 名でも含まれる試合ではこのルートは 500 で必ず落ちる。** そしてラインアップが 0 件だった大会の選手はそもそも `players` に登録されていないため、本ワークフローの主対象（League One 以外）はほぼ全件がこれに該当する。

→ **別 spec（`fix-ingest-lineups-player-slug.md` 相当）での修正が必要。本ワークフローはそれがマージされるまで実質的に機能しない。**

#### 阻害要因 2: パーサーが大会ごとに機能しない可能性

`specs/fix-lineup-ingestion-non-league-one.md` が記録しているとおり、2026-07-09 時点で League One 以外の 5 大会は終了済み試合でもラインアップ 0 件だった。原因は `parseSeasonPageLineupHtml` が Six Nations 専用パーサーを汎用フォールバックとして使い回していたこと。その後 `specs/feat-wikitext-ingestion-migration.md`（PR #689、2026-08-13 マージ）で wikitext 経由に移行しており状況は変わっている可能性が高いが、**本 spec ではパーサーの成否を保証しない**。

#### だから何を作るのか

本ワークフローの価値は「取り込めること」ではなく、**取り込めたか取り込めなかったかを、どの理由で失敗したかまで含めて Owner が確実に知れること**にある。受け入れ条件の「失敗の可視化」群がこの spec の本体であり、おまけではない。

上記 2 つの阻害要因が残っている状態でこのワークフローを流すと、Owner は「500 が並ぶログ」または「`announced: false` が並ぶログ」を見ることになる。**それが正しい振る舞いである。** 静かに green で終わるより遥かによい。

## スコープ

対象:
- `.github/workflows/manual-ingest-lineups.yml` の新規追加（`workflow_dispatch` のみ、`schedule` なし）
- 3 段構成: `POST /api/cron/ingest-lineups?match_id=<uuid>` → `POST /api/cron/fetch-sourced-facts?match_id=<uuid>&content_type=<type>&force=true` → `POST /api/cron/generate-content`（body: `{contentType, matchIds, language}`）
- 各段の結果集計と、ジョブサマリへの出力

対象外:
- `app/api/cron/ingest-lineups` 側のコード変更（既存ルートをそのまま叩く）
- **Wikipedia パーサーの修正**（上記「本 spec が解決しないこと」参照。パーサーが返さない大会があっても本 spec の範囲では直さない）
- `cron-ingest-league-one-lineups.yml` の変更・統合・削除（League One 版は既定の match_id リストを持つ別用途として残す）
- 定期実行（`schedule`）の追加。**本番書込＋LLM 課金が発生するため手動起動限定とする**
- 対象試合の自動探索（「今後 N 日以内の scheduled 試合を自動で拾う」等）。`match_ids` は Owner が明示指定する
- 日本代表戦の JRFU 経路の変更（`fetch-sourced-facts` 段が既存実装のまま走るので自動的にカバーされる）
- `match_lineups` / `players` への書き込み方法の変更

## データモデル変更

**なし。** 既存 API を呼ぶだけで、ワークフローは DB に直接触らない。

## API サーフェス

**新規ルートなし。** 既存 3 ルートを叩く。実測で確認したシグネチャ:

| ルート | メソッド | パラメータ | 備考 |
|---|---|---|---|
| `/api/cron/ingest-lineups` | POST | `?match_id=<uuid>` | `matches.external_ids.wikipedia_url` が未設定だと **400** を返す（`route.ts:69-74`） |
| `/api/cron/fetch-sourced-facts` | POST | `?match_id=<uuid>&content_type=preview\|recap&force=true` | `content_type` の既定は `preview`。不正値は 400 |
| `/api/cron/generate-content` | POST | body `{ matchIds: uuid[], contentType: "preview"\|"recap", language: "ja"\|"en" }` | **配列を受けるので 1 回の呼び出しでまとめられる**（League One 版のように 1 件ずつループする必要はない） |

認証は既存 3 本と同じ `Authorization: Bearer ${{ secrets.CRON_SECRET }}`、ベース URL は `${{ secrets.PRODUCTION_URL }}`。

### ワークフロー入力

| 入力 | 型 | 既定 | 説明 |
|---|---|---|---|
| `match_ids` | string | （空・**必須扱い**） | 対象 match_id（空白区切り）。空なら即座にジョブを失敗させる |
| `content_type` | choice | `preview` | `preview` / `recap`。**`auto` は用意しない**（背景の 1 参照） |
| `language` | choice | `ja` | `ja` / `en` |
| `ingest_lineups` | boolean | `true` | Wikipedia 経由のラインアップ取込を実行する |
| `fetch_facts` | boolean | `true` | `force=true` で sourced_facts を再取得する |
| `regenerate` | boolean | `true` | コンテンツを再生成する |

`content_type` を単一選択にした結果、**preview と recap を 1 回の実行で混在させられない**。これは意図した制約であり、混在が必要なら 2 回実行する。

## UI サーフェス

**変更なし。** GitHub Actions の画面のみ。

## LLM 連携

パイプラインの **2 段階目（事実抽出 = `fetch-sourced-facts`）と 3〜4 段階目（`generate-content`）** を起動する。

### コスト見積もり

モデル ID は直書きせず `lib/llm/models.ts` の `MODELS` を参照する（現在 `FAST` / `NARRATIVE` / `WEB_SEARCH`）。

1 試合あたりの概算呼び出し回数:

| 段 | モデル | 回数 |
|---|---|---|
| `fetch-sourced-facts`（`force=true`） | `MODELS.WEB_SEARCH` | 1 回（Web 検索付きのため単価が高い） |
| 戦術ポイント抽出 | `MODELS.FAST` | 1 回 |
| ナラティブ生成 | `MODELS.NARRATIVE` | 1〜最大リトライ回数 |
| QA + entity 検証 | `MODELS.FAST` | ナラティブ 1 回につき 2 回 |

**`match_ids` に大量の ID を入れると課金が線形に増える。** cron ではなく Owner が手で起動するため、件数の上限をワークフロー側で持つ:

- `match_ids` が **10 件を超える場合はジョブを失敗させる**（誤って大量の ID を貼り付けた事故の防止）
- 10 件以内でも、実行前のログに「対象 N 件 / LLM 課金が発生します」と明示する

2026-06 の 297 件 draft 化事故（`docs/decisions.md` 参照）と同じ轍を踏まないため、初回は 1〜2 件で試すことをワークフロー冒頭のコメントに明記する。

## 受け入れ条件

### 起動と入力検証

1. `.github/workflows/manual-ingest-lineups.yml` が存在し、`on:` に `workflow_dispatch` のみを持つ（`schedule` を持たない）
2. `match_ids` が空（空白のみを含む）で起動された場合、ジョブが**失敗**する（成功扱いで何もせず終わらない）
3. `match_ids` に 11 個以上の ID が渡された場合、ジョブが**失敗**し、ログに件数と上限が出る
4. `match_ids` の各要素が UUID 形式でない場合、その ID をスキップしてログに記録し、ジョブサマリの失敗件数に数える
5. `content_type` の choice に `auto` が**含まれていない**

### 各段の実行

6. `ingest_lineups=true` のとき、各 match_id に対し `POST $BASE/api/cron/ingest-lineups?match_id=<id>` が 1 回ずつ呼ばれる
7. `fetch_facts=true` のとき、各 match_id に対し `POST $BASE/api/cron/fetch-sourced-facts?match_id=<id>&content_type=<content_type>&force=true` が 1 回ずつ呼ばれる
8. `regenerate=true` のとき、`POST $BASE/api/cron/generate-content` が **1 回だけ**呼ばれ、body の `matchIds` に対象 ID が配列でまとめて入る（1 件ずつループしない）
9. 3 つのトグルをすべて `false` にして起動した場合、API 呼び出しが 0 回でジョブは成功する（no-op が明示的に成功と分かる）

### 失敗の可視化（この spec の本体）

10. 各段で non-200 が返った場合、**HTTP ステータスとレスポンス本文の両方**がログに出る
11. `ingest-lineups` が **400** を返した場合（= `matches.external_ids.wikipedia_url` 未設定）、ログで 5xx と**区別できる**メッセージが出る（例: `SKIP: wikipedia_url 未設定` と `FAIL: ingest エラー`）。Owner がデータ不足と障害を取り違えないため
12. `ingest-lineups` が **200 を返したがラインアップが入っていない**場合、成功と区別してログに出る。実測で確認済みのレスポンス形は以下のとおり:
    - パース失敗: `{"announced": false}` を **HTTP 200** で返す（`route.ts:88-90`）→ `NO-DATA` として集計する
    - 成功: `{"announced": true, "home_count": <n>, "away_count": <n>}`（`route.ts:198-202`）→ `home_count + away_count === 0` なら同じく `NO-DATA` として扱う
    - `wikipedia_url` 未設定: HTTP 400（`route.ts:69-74`）→ `SKIP`
    - それ以外の例外: HTTP 500（`route.ts:210` 以降）→ `FAIL`
13. ジョブ末尾に集計サマリが出力される。少なくとも「対象件数 / ingest 成功・0件・スキップ・失敗 / facts 成功・失敗 / regenerate の HTTP ステータス」を含む
14. サマリは `$GITHUB_STEP_SUMMARY` にも書かれ、Actions の実行結果画面でログを開かずに読める
15. **ingest 段で「実際にラインアップが入った」件数が 0 だった場合**（全件が 0 件・スキップ・失敗）、ジョブが失敗する。「動いたが何も入らなかった」を green で終わらせない
16. 個別の non-200 が 1 件でもあった場合、ジョブは最終的に**失敗ステータスで終わる**（途中で `exit` せず全件処理してから落ちる）

### ドキュメント

17. ワークフロー冒頭のコメントに以下が書かれている: 手動起動限定である理由、LLM 課金が発生すること、初回は 1〜2 件で試すこと、`content_type` に `auto` がない理由、対象 match_id の調べ方、**大会によってはパーサーがラインアップを返さない可能性があること**（`specs/fix-lineup-ingestion-non-league-one.md` への参照）

## 未解決の質問

1. **対象 match_id の調べ方**を受け入れ条件 17 に含めたが、Owner が実際にどの経路で調べているかが未確定（Supabase コンソールの SQL / 本番サイトの URL からの逆引き / `tools/run-ts.cjs` 経由のスクリプト）。→ Owner に確認してからコメントを書くこと。決まらない場合は「本番サイトの試合詳細 URL の末尾が match_id」とだけ書く
2. 受け入れ条件 16（1 件でも失敗ならジョブ失敗）は、10 件中 9 件成功でも赤くなることを意味する。運用上うるさすぎないか。→ 推奨は現状案のまま（手動起動で件数が少なく、赤の方が見落とさない）。うるさければ後から緩める
3. **`players.slug` NOT NULL バグ（背景の阻害要因 1）を先に直すか、本ワークフローを先に入れるか。** → Owner 判断。推奨は「本ワークフローを先にマージし、slug 修正を別 spec で直後に入れる」。ワークフローが先にあれば、slug 修正の検証手段としてそのまま使えるため。逆順だと slug 修正を手で curl して検証することになる
4. League One 版（`cron-ingest-league-one-lineups.yml`）を将来この汎用版に統合するかは本 spec では決めない。既定 match_id リストを持つ点が異なるため、当面は 2 本並存させる
