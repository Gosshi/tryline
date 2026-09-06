# fix-event-ingestion-identity-guard

## 背景

2026-09-05 の監査（`docs/audits/gpt6-full-audit-2026-09-05.md` D-1）で、**公開中の試合に別試合のイベントがチーム帰属を反転した状態で入っている**ことが確認された。

| 試合 | 表示スコア | イベント合計 |
|---|---|---|
| 第2戦 `f01f68e2-bdd6-47c8-8910-0ea37a382b0a`（2026-08-15、豪州 56–17 日本） | home 56 / away 17 | **home 32 / away 35** |
| 第1戦 `2c276057-bb3a-4617-a5b1-b7742e65f034`（2026-08-08、日本 32–35 豪州） | home 32 / away 35 | home 32 / away 35 |

公開 API で両者の 19 イベントを比較すると **`(minute, type, player_name)` の配列が完全一致し、`team_id` は 19 件すべて逆**（一致 0 / 不一致 19）。第2戦には固有のイベントが 1 件も存在せず、第1戦のイベントを反転して継承している。

### 2026-06 の対策が効かなかった理由

`specs/fix-contaminated-match-events.md`（2026-06-11）は同種の汚染に対し Part B で再発防止を入れたが、**対象外に次のように書いていた**。

> `lib/ingestion/events.ts` のチーム名検証（パーサが teamSide しか返さない現構造では実装不可。Part B のスコアガードで実効的に防げる）

**この前提が外れている。** ガードは `scripts/fill-event-gaps.ts` に置かれたが、`lib/ingestion/events.ts` の `upsertMatchEvents` を呼ぶ経路は 11 ある。

| 経路 | スコア整合ガード |
|---|---|
| `lib/ingestion/events.ts`（共通の入口） | **なし**。L83 で `event.teamSide === "home" ? params.homeTeamId : params.awayTeamId` と位置だけで帰属する |
| `scripts/fill-event-gaps.ts` | あり（L314-327）。ただし `homeTotal > home_score` の **超過のみ**で、不足は通す |
| `scripts/backfill-nations-championship-match-events.ts` | あり（L155 で `eventTotalsMatchFinalScore` を独自に再定義。`lib/llm/stages/assemble.ts:276` と重複実装） |
| `lib/ingestion/live-ingest.ts` | **なし** |
| `app/api/cron/fill-event-gaps/route.ts` / `app/api/cron/fill-league-one-playoff-events/route.ts` | **なし** |
| `scripts/backfill-match-events.ts` / `backfill-club-match-details.ts` / `backfill-top14-match-events.ts` / `backfill-premiership-match-events.ts` / `backfill-urc-match-events.ts` / `backfill-rwc-match-events.ts` | **なし** |

共通関数の直接呼び出し11箇所に加え、Nations ChampionshipのupsertEvents別名経由1箇所を検証する。World Rugby/League Oneの独立した同名保存関数は別経路として列挙する。呼び出し一覧とガード一覧をACに固定し、単純な文字列件数を網羅性の判定に使わない。

### 検出は動いていた

`lib/data-integrity/audit.ts:179` は全 finished 試合に `eventTotalsMatchFinalScore` を適用し、`cron-audit-data-integrity`（日 12:30 JST）で Discord に通知している。**第2戦の不一致は 2026-08-17 以降、毎週検出されていた。** しかし通知本文は `lib/llm/notify.ts:209` の `2. スコア不一致: matches=${count}` という件数のみで、match_id も URL も重大度も無い。当時の Discord は `collect-news-links` が 1日13〜25件を流していた（D027）ため埋もれた。

**本 spec は「入口で止める」ことだけを扱う。** 検出の実効性は `fix-data-integrity-alert-actionability.md`（**未作成。本 spec の後に作る予定であり、既存として参照しない**）、生成の停止は `fix-generation-event-integrity-gate.md`、公開面の隔離は `fix-contaminated-events-display-isolation.md`、既存汚染の棚卸しは `audit-published-recap-event-integrity.md` で扱う。

## スコープ

対象:
- `lib/ingestion/events.ts`: `upsertMatchEvents` に **fixture 同一性検証**と**スコア整合ガード**を新設し、共通入口を通る全経路に一律で効かせる
- 既存の重複ガード実装の一本化（`scripts/backfill-nations-championship-match-events.ts:155` の再定義を削除し、共通実装を import する）
- `scripts/fill-event-gaps.ts` の超過限定ガード（L314-327）を共通実装に置き換える

対象外:
- **既存の汚染データの削除・修正**（`audit-published-recap-event-integrity.md` の棚卸し結果を見て Owner が個別判断する。本 spec では 1 行も DELETE / UPDATE しない）
- **第2戦 `f01f68e2` の本文訂正**（別途 `content-regen` 運用。本文には公式記録との差異も別途あり、監査レポート D-1 参照）
- パーサ側の改修（`lib/scrapers/*` は変更しない。パーサが `teamSide` しか返さない前提のまま、入口で検証する）
- イベントの再取得（正しいイベントの取り込みは別タスク）
- `match_events` のスキーマ変更

## データモデル変更

なし。既存テーブルへの書き込み経路にガードを足すのみ。

検証に読むフィールドは以下（いずれも既存）:

```
match_events: match_id, team_id, minute, type, metadata（player_name / is_penalty_try）。得点換算は lib/format/match-event-points.ts の pointsForMatchEvent を使う。
matches:      id, home_team_id, away_team_id, home_score, away_score, status, external_ids
```

## API サーフェス

なし。

## UI サーフェス

なし。

## LLM 連携

なし（コスト影響ゼロ）。

## 変更詳細

### 1. 共通判定関数の一本化

`lib/llm/stages/assemble.ts:276` の `eventTotalsMatchFinalScore` は LLM ステージに置かれているが、取り込み層から参照するのは依存方向として不適切。**判定ロジックを `lib/ingestion/event-integrity.ts`（新規）へ移し、`assemble.ts` と `lib/data-integrity/audit.ts` はそこから import する**（`assemble.ts` からの再エクスポートでも可。既存の呼び出し側シグネチャは変えない）。

`scripts/backfill-nations-championship-match-events.ts:155` の再定義は削除し、共通実装を import する。

### 2. `lib/ingestion/events.ts` — `upsertMatchEvents` のガード

`upsertMatchEvents` の引数に、検証に必要な情報を追加する（現在は `homeTeamId` / `awayTeamId` のみ）。**共通入口を import する 11 箇所に加え、Nations Championship の別名経由 1 箇所を更新する。**

**共通入口を通らない独立実装が 2 つある**: `scripts/import-world-rugby-full.ts:505` と `scripts/import-league-one-full.ts:335` の同名ローカル関数。**これらは本 spec のガードが効かない。** 別経路として AC に列挙し、対応するか意図的に対象外とするかを明示すること。

追加する検証は次の 4 つ。**いずれかに該当したら書き込まず、理由付きで拒否する。**

| # | 検証 | 拒否条件 |
|---|---|---|
| V1 | スコア整合 | 試合が `finished` かつ `home_score` / `away_score` が非 null のとき、イベント合計が最終スコアと**完全一致しない**（超過・不足の両方向） |
| V2 | 第三チーム | **解決後の `team_id` を検査してはならない。** `events.ts:82-83` は `teamSide` から `homeTeamId`/`awayTeamId` を選ぶだけなので、解決後の値はこの2つのいずれかに必ずなり、検査は常に合格して無意味になる。検査対象は**入力側**とする: 呼び出し元が渡した `homeTeamId` / `awayTeamId` が当該 `match_id` の `matches.home_team_id` / `away_team_id` と一致すること、およびパーサが出典側のチーム識別子を返す場合はそれが当該2チームに対応すること |
| V3 | 署名重複 | 投入しようとするイベント群の `(minute, type, metadata.player_name)` 署名列が、**別の match_id に既存のイベント群の署名列と完全一致**する。`player_name` は列ではなく `metadata: Json` の中にある |
| V4 | fixture 同一性 | 取り込み元 fixture の識別子（`external_ids` の該当キー、または引数で渡す source fixture id）が、別の match_id に既に紐付いている |

V1 の得点換算は **`lib/format/match-event-points.ts` の `pointsForMatchEvent` を使う**。これが換算の唯一の正であり、`assemble.ts:159` `live-ingest.ts:241` `player-stats.ts:76` が既に参照している。**独自に得点表を書き直さないこと**（`penalty_try` を 5 点として扱う誤りが 2026-06 に実在した。`specs/fix-penalty-try-scoring.md` 参照）。penalty try は独立した `type` ではなく `type = "try"` に `metadata.is_penalty_try` が立つ形で保存される。

V3はイベントを安定ソートした多重集合として比較し、重複数を保持する。名前はmetadataの文字列へNFKC・空白正規化を適用し、欠損名を空文字だけで同一人物とみなさない。4件閾値は暫定の候補抽出基準であり汚染確定ではない。自動拒否の採否は正常試合の反例テストを確認してOwnerが仕様改訂時に確定する。

### 3. 位置ベース帰属の扱い

L83 の `event.teamSide === "home" ? params.homeTeamId : params.awayTeamId` 自体は残してよいが、**その結果が V1〜V4 を通ることを書き込みの必要条件にする**。「日本のサイトで日本が左に出ている」ことと「日本が home である」ことを同一視しない、という監査の指摘（D-1 対処3）は V1 で実効的に担保される（帰属が反転すれば合計が入れ替わり、非対称スコアでは必ず不一致になる）。

V4 は既に別 match_id に登録された同一 source namespace・fixture ID の重複を検出する。対称スコアでのチーム帰属反転は V4 でも一般には検出できず、本仕様では未解決として残す。完全に防ぐ変更は、出典側のチーム識別子と試合日を入力契約へ追加して照合する別仕様で定める。「同一性を保証した」と完了報告しない。

### 4. 拒否時の挙動

- 例外を投げず、**戻り値で拒否理由を返す**（`{ inserted: number; rejected: Array<{ reason: "score_mismatch" | "third_team" | "duplicate_signature" | "fixture_conflict"; detail: string }> }` 相当）
- 呼び出し側の cron / スクリプトは、拒否があった場合に**その run を失敗として扱う**（`exit 1` 相当。`cron-weekend-preview-refresh` が PR #758 で採った失敗伝播と同じ方針）
- 拒否内容を `console.warn` に加えて Discord ops 通知へ送る。通知は `lib/llm/notify.ts` の既存パターンに合わせ、**match_id と該当試合の URL を含める**（件数だけの通知にしない。本 spec の背景で述べた埋没の再発防止）

## 受け入れ条件

**テスト実行の条件**: 既定の `pnpm test` は `vitest.config.ts:16` の `exclude` により次を実行しない — `tests/ingestion/events.test.ts` / `tests/llm/pipeline.test.ts` / `tests/llm/stages/assemble.test.ts` / `tests/health.test.ts` / `tests/db/**`。**本 spec の受け入れテストはこれらに該当する領域なので、「`pnpm test` が green」を完了根拠にしてはならない。**

次のいずれかで**実際に実行されること**を条件とする。

- (a) DB と LLM をモックした単体テストとして、除外されていない新規ファイルに置く
- (b) 除外を外した実行コマンドを用意する

**PR 本文に、実行したコマンドと結果を貼ること。**


1. `lib/ingestion/event-integrity.ts` が存在し、`eventTotalsMatchFinalScore` の実装が 1 箇所のみである。`grep -rn "function eventTotalsMatchFinalScore" lib scripts` の結果が 1 件になる
2. 共通入口を import する 11 箇所と NC の別名経由 1 箇所が、新しい引数を渡すよう更新されている。**呼び出し一覧を PR 本文に列挙すること。** `grep` の件数一致を網羅性の証拠にしない（別名 import とローカル同名関数を数えられない）
2-b. `scripts/import-world-rugby-full.ts:505` と `scripts/import-league-one-full.ts:335` の独立実装について、対応済みか意図的な対象外かが PR 本文に明記されている
3. **回帰テスト（必須）**: 第2戦 `f01f68e2-bdd6-47c8-8910-0ea37a382b0a` の状況を再現した fixture（最終スコア 56–17、投入イベント合計 32–35）で、**V1 により拒否される**ことを検証するテストがある
4. V2: 当該試合に属さない `team_id` を含むイベント群が拒否されることを検証するテストがある
5. V3: 4 件以上の署名列が別 match_id と完全一致する場合に拒否され、**3 件以下では拒否されない**ことを検証するテストがある
6. V4: 同一の source fixture 識別子が別 match_id に紐付いている場合に拒否されることを検証するテストがある
7. V1適用時はスコアが完全一致し、V2～V4にも違反しない入力だけを正常系とする。未終了試合はV1だけを省略し、他の判定は省略しない。
8. 拒否時に呼び出し元が非ゼロ終了する。`scripts/fill-event-gaps.ts` を拒否が起きる fixture で実行すると exit code が 1 になる
9. Discord 通知に match_id と `https://www.trylinerugby.com/matches/<id>` 形式の URL が含まれる
10. `scripts/backfill-nations-championship-match-events.ts` の `eventTotalsMatchFinalScore` 再定義が削除され、共通実装を import している
11. `scripts/fill-event-gaps.ts` の超過限定判定（L314-327）が共通実装に置き換わり、**不足方向も拒否する**
12. `pnpm typecheck` が green。テストは下記「テスト実行の条件」を満たすこと
13. 拒否・検証読出し失敗時はmatch_eventsへの変更がゼロで、既存行が保持される。正常な既存取り込みの置換動作と、今回行わない本番データ修復を区別する。正常時のdelete→insertの途中失敗への原子性対応は別途明示し、このガードだけで解決済みとしない。

## 未解決の質問

**実装前に Owner が決めること。決まるまで着手しない。**

1. **V4 の fixture 識別子**: `external_ids` のどのキーを source fixture id とするか、namespace をどう区切るか、欠損時に拒否するか通すか、日付の粒度をどう扱うか。既存の `fix-live-ingest-event-key-collision.md` と `feat-nations-championship-event-source.md` のキー設計と衝突しない形を確定する
   **2026-09-06 確定追記**: `specs/fix-external-identifier-key-policy.md` により、許可リストは `match_url` / `league_one_match_id` / `world_rugby_match_id` / `top14_lnr_id` / `top14_lnr_match_path` の 5 キーとする。`lib/ingestion/external-identifiers.ts` の `extractFixtureIdentifiers` を共有し、キーを namespace とした `${key}=${value}` 形式で扱う。`wikipedia_event_id` / `wikipedia_url` / `top14_lnr_url` は fixture 識別子としない。本番では 327 / 1,372 試合（24%）だけが許可キーを持ち、1,045 試合（76%）には使える識別子が無い。Wikipedia 系は V1〜V3 が主防御、V4 は補助であり、識別子欠損から fixture 重複とは判定しない。この追記は識別子の解釈の確定のみで、取り込み時ガードの実装は含まない。
2. **V3 を自動拒否に使うか**: 4 件という閾値は候補抽出の暫定基準であり、汚染の確定ではない。正常な試合が誤って拒否される反例テストを見たうえで、自動拒否とするか警告に留めるかを決める
3. **共通入口を通らない 2 実装の扱い**: `scripts/import-world-rugby-full.ts:505` と `scripts/import-league-one-full.ts:335` を本 spec で共通化するか、別 spec に回すか

**本 spec で解決しないと明示するもの**:

- **対称スコア（例: 24–24）でのチーム帰属反転は V1 でも V4 でも検出できない。** 完全に防ぐには出典側のチーム識別子と試合日を入力契約に加えて照合する必要があり、パーサ改修を含む別 spec で定める。**「同一性を保証した」と完了報告しないこと**
- **正常時の `delete` → `insert`（`events.ts:69`/`:102`）は原子的でない。** ガード通過後に insert が失敗すると既存イベントが失われる。本 spec のガードはこれを解決しない
