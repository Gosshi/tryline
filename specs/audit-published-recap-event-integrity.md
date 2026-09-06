# audit-published-recap-event-integrity

## 背景

2026-09-05 の監査（`docs/audits/gpt6-full-audit-2026-09-05.md` D-1）で、公開中の 1 試合について**別試合のイベントがチーム帰属を反転して入っている**ことが確定した。第2戦 `f01f68e2-bdd6-47c8-8910-0ea37a382b0a` と第1戦 `2c276057-bb3a-4617-a5b1-b7742e65f034` の 19 イベントは `(minute, type, player_name)` が完全一致し、`team_id` は 19 件すべて逆。

**汚染がこの 1 件だけなのかは分かっていない。** 監査レポートは「本番全件の汚染率は今回未測定であり、1 件から割合を外挿しない」と明記している。

2026-06-11 にも同種の汚染が 37 試合（Autumn Nations 31 + SRP 6、うち published recap 35 本）で見つかっており（`specs/fix-contaminated-match-events.md`）、**再発は初めてではない**。

`lib/data-integrity/audit.ts` は毎週スコア不一致を検出しているが、通知は `lib/llm/notify.ts:209` の `2. スコア不一致: matches=${count}` という件数のみで、**どの試合か、公開中か、記事があるかが分からない**。第2戦の不一致は 2026-08-17 以降ずっと計上されていたが、当時 Discord には `collect-news-links` が 1日13〜25件を流しており（D027）埋もれた。

本 spec は、**公開済み recap を持つ試合の範囲を確定し、汚染の疑いを類型ごとに件数と一覧で出す読み取り専用ツール**を作る。

## スコープ

対象:
- `tools/audit-published-recap-event-integrity.ts`（新規）: **読み取り専用**。公開済み recap を持つ試合を対象に 5 種類の検査を行い、結果をファイルへ書き出す
- 出力レポート: `tmp/event-integrity-audit/` に JSON と CSV

対象外:
- **自動削除・自動修正・自動 unpublish**（1 行も書き込まない。結果を見て Owner が個別に判断する）
- **再生成**（`content-regen` 運用で Owner が別途行う）
- 取り込み時の拒否（`fix-event-ingestion-identity-guard.md`）
- 生成の停止（`fix-generation-event-integrity-gate.md`）
- 表示の隔離（`fix-contaminated-events-display-isolation.md`）
- 週次監査の通知改善（`lib/data-integrity/audit.ts` と `lib/llm/notify.ts` には触れない。別 spec）
- 本文と公式記録の照合（本文側の誤りは決定論で判定できない。Owner の目視）
- 生成時点のデータの復元（`audit-published-entity-grounding.md` と同じ制約。**現在のデータでの監査**であることをレポートに明記する）

## データモデル変更

なし。**読み取りのみ。**

読むテーブルとフィールド:

```
match_content: id, match_id, content_type, status, language, prompt_version, generated_at
match_events: match_id, team_id, minute, type, metadata
matches: id, home_team_id, away_team_id, home_score, away_score, status, kickoff_at, competition_id, external_ids
teams/competitionsを実際の外部キーでJOINし表示名とcompetition_slugを得る。CSVの日時列はrecap_generated_at/kickoff_atとする。
```

## API サーフェス

なし。

## UI サーフェス

なし。

## LLM 連携

**なし。コスト $0。** 全検査を決定論で行う。

`audit-published-entity-grounding.md` は LLM を使う監査だが、**本 spec は使わない**。イベントの整合はスコア計算と署名比較で判定でき、LLM を挟むと判定が非決定的になる。

## 変更詳細

### 対象の確定

`match_content` で `content_type = 'recap'` かつ `status = 'published'` の distinct `match_id`。

**別群として件数だけ報告する**（検査対象には含めない）:
- preview のみを持つ試合
- draft の recap を持つ試合
- コンテンツを持たない finished 試合

### 検査 5 種

| # | 検査 | 判定 |
|---|---|---|
| C1 | 得点不一致 | イベント合計が `home_score` / `away_score` と一致しない。判定には `lib/format/match-event-points.ts` の `pointsForMatchEvent` を使う（得点換算を書き起こさない。`penalty_try` 5 点誤りの再発源。`specs/fix-penalty-try-scoring.md` 参照）。**`toScoreEvent`（`audit.ts:117`）は export されていないため import できない** |
| C2 | 第三チーム | イベントの `team_id` に当該試合の `home_team_id` / `away_team_id` 以外が含まれる |
| C3 | 署名一致 | `(minute, type, metadata.player_name)` の署名列が**別の match_id と完全一致**する。**署名が 4 件以上のときのみ判定**（3 件以下は偶然一致しうる） |
| C4 | 帰属反転 | C3 に該当し、かつ両試合の対戦カードが同一（両チーム集合が一致）で、**`team_id` の対応が全件逆**である |
| C5 | fixture 重複 | `external_ids` の取り込み元識別子が複数の match_id に紐付いている |

C3 は全件どうしの総当たりになるため、**署名のハッシュでグルーピングしてから比較する**こと（`fix-contaminated-match-events.md` が `type|minute|player_id` 署名を使った先例がある。ただし `player_id` が null の行が多い場合に備え、**本 spec は `metadata.player_name` の正規化文字列を使う**。`player_name` は列ではなく `metadata: Json` の中にある）。

### 出力

`tmp/event-integrity-audit/<ISO8601 の実行時刻>/` に:

- `summary.json` — 各検査の件数、対象 distinct match 数、別群の件数、実行時刻、対象データの取得時刻
- `findings.csv` — 1 行 1 試合。列: `match_id`, `url`, `competition_slug`, `kickoff_utc`, `home_team`, `away_team`, `home_score`, `away_score`, `event_home_total`, `event_away_total`, `event_count`, `checks_hit`（C1〜C5 をカンマ区切り）, `paired_match_id`（C3/C4/C5 の相手）, `severity`, `recap_prompt_version`, `recap_updated_at`

`url` は `https://www.trylinerugby.com/matches/<match_id>` 形式。**Owner がそのまま開いて確認できることを優先する。**

### 分類

`severity` は次の 3 段階。**自動削除の根拠には使わない。**

| 値 | 条件 |
|---|---|
| confirmed | 現在スナップショット内でC4に加え、その試合自身のC1/C2または独立した出典照合で不正が確認できる場合。C4のみはsuspectとし、相互一致から汚染の方向を断定しない。 |
| `suspect` | C1・C2・C3・C5 のいずれかに該当し C4 ではない |
| `incomplete` | イベントが 0 件、またはスコアが null で判定不能 |

### 実行方法

`tools/audit-entity-grounding.ts:1-9` の規約に合わせる。

```
node --env-file=.env.production.local tools/run-ts.cjs tools/audit-published-recap-event-integrity.ts
```

LLM実行承認フラグは不要だが、機密ファイルやgitignore対象へのアクセスを許すものではない。本番のenvファイルを読むコマンドはOwner本人用の運用例とする。Codexの検証は合成fixtureとモックで行い、本番監査は許可された読取専用接続でOwnerが実施する。

## 受け入れ条件

**テスト実行の条件**: 既定の `pnpm test` は `vitest.config.ts:16` の `exclude` により次を実行しない — `tests/ingestion/events.test.ts` / `tests/llm/pipeline.test.ts` / `tests/llm/stages/assemble.test.ts` / `tests/health.test.ts` / `tests/db/**`。**本 spec の受け入れテストはこれらに該当する領域なので、「`pnpm test` が green」を完了根拠にしてはならない。**

次のいずれかで**実際に実行されること**を条件とする。

- (a) DB と LLM をモックした単体テストとして、除外されていない新規ファイルに置く
- (b) 除外を外した実行コマンドを用意する

**PR 本文に、実行したコマンドと結果を貼ること。**


1. `tools/audit-published-recap-event-integrity.ts` が存在し、上記コマンドで実行できる
2. **書き込みが 1 件も無い**。ソース中に `.insert(` / `.update(` / `.upsert(` / `.delete(` が現れない
3. 第2戦 `f01f68e2-bdd6-47c8-8910-0ea37a382b0a` が `findings.csv` に現れ、`checks_hit` に C1・C3・C4 を含み、`severity` が `confirmed`、`paired_match_id` が `2c276057-bb3a-4617-a5b1-b7742e65f034` である
4. 第1戦 `2c276057-bb3a-4617-a5b1-b7742e65f034` は C1 に該当しない（合計 32–35 が最終スコアと一致するため）
5. C3 の判定が署名 4 件以上のときのみ適用されることを検証するテストがある。3 件以下の署名が偶然一致しても検出しない
6. C4 が「対戦カード一致 かつ 帰属全件反転」のときのみ立つことを検証するテストがある。**一部だけ反転している場合は C3 の `suspect` に留まる**
7. C1 の判定に `pointsForMatchEvent` を使っており、得点換算が新規に書き起こされていない。**`toScoreEvent` を import していない**（export されていないため）
8. `summary.json` に、対象 distinct match 数と、別群（preview のみ / draft / コンテンツ無し）の件数が含まれる
9. `summary.json` に「現在のデータでの監査であり、生成時点の再現ではない」旨の注記が含まれる
10. 実行開始時に対象件数が標準出力に表示され、Owner が本番を向いていることを確認できる
11. `pnpm typecheck` が green。テストは下記「テスト実行の条件」を満たすこと
12. **Owner が結果を見て判断できること**: `findings.csv` の `url` 列をブラウザで開くだけで、疑いのある試合を目視確認できる

## 監査の完全性と共通関数
対象match_idは公開recapを持つ試合に限定し、署名/fixture重複の比較先はコンテンツの有無を問わないイベント保有試合に広げる。ページングを末尾まで実行し、途中失敗は非ゼロ終了・incomplete reportとする。toScoreEventはprivateなので直接importしない。先行PRで切り出した純関数とpointsForMatchEventを使う。CSVは複数相手IDと言語別記事情報を配列として保持し、CSV quotingを適用する。

**本 spec は件数を出すところまでで終わる。** 見つかった汚染をどう処理するか（イベント削除・再取得・recap の draft 降格・再生成）は、**件数と類型が分かってから Owner が決める**。全件が `confirmed` なら方針が変わりうるため、先に処理方法を決め打ちしない。
