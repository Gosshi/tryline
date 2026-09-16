# Top 14 のペナルティトライでイベント取り込みが停止し、変換キックを捏造しかねない問題

## 背景

2026-09-16、オレンジカード対応（PR #843）を本番反映したあと取り込みを実行したところ、2試合が追加で入り、次の語彙で停止した。

```
HTTP 500
{"detail":"Unknown Top 14 game-fact subtype: type=Point slugSubType=essai-de-penalite"}
```

**ペナルティトライ（essai de pénalité）が未対応。** j1 の進捗は7試合中3試合。

| 試合 | イベント | 得点合計の照合 |
|---|---:|---|
| 9/06 ラ・ロシェル × トゥールーズ | 19件 | 30-27 で一致 |
| 9/05 ボルドー × ラシン92 | 20件 | 64-5 で一致（オレンジ→レッド1件を含む） |
| 9/05 スタッド・フランセ × ペルピニャン | 17件 | 28-26 で一致 |
| 9/05 バイヨンヌ × トゥーロン（27-26） | 0件 | 未着手 |
| 9/05 リヨン × クレルモン（40-36） | 0件 | 未着手 |
| 9/05 モンペリエ × ポー（19-27） | 0件 | 未着手 |
| 9/05 カストル × ヴァンヌ（29-20） | 0件 | 未着手 |

**停止した試合は未着手の4件のいずれかだが、4件とも同一キックオフ時刻（17:05Z）のため特定できない。** 実装時に実ページで確認すること。

### 語彙を足すだけでは間違ったデータが入る

現在の `scoreEventsForIncrement` は、スコア差分 **+7 を「トライ＋匿名コンバージョン」** に展開する。これは通常のトライ＋成功した変換キックを前提とした導出である。

**ペナルティトライは7点だが、変換キックは存在しない。** そのまま `try` へ写像すると次の2つが同時に起きる。

1. **実際には蹴っていないコンバージョンを1件捏造する**
2. 得点合計が 7 + 2 = **9点**になり、`eventTotalsMatchFinalScore` に弾かれて**結局その試合は入らない**

### 正しい表現はコード側に既に用意されている

- `lib/format/match-event-points.ts`: `PENALTY_TRY_POINTS = 7` / `TRY_POINTS = 5`。`pointsForMatchEvent` は `type === "try"` かつ `isPenaltyTry`（または `is_penalty_try`）なら **7点**を返す
- `lib/ingestion/event-integrity.ts:287` `computeParsedMatchEventPointTotals` は `pointsForMatchEvent` を使う。**整合チェックはペナルティトライに対応済み**
- `lib/ingestion/events.ts` `buildMetadata` は `isPenaltyTry` が真のとき `metadata.is_penalty_try = true` を書く。**`match_events` に専用の列は無い**（列は id / match_id / minute / type / team_id / player_id / metadata / created_at）
- `lib/llm/stages/derived-stats.ts:90` は `is_penalty_try` のトライをコンバージョン試投数から除外する

**つまり消費側は揃っていて、生成側が無い。** リポジトリ全体で `isPenaltyTry: true` を生成している箇所は1つも存在せず、Top 14 スクレイパーは2箇所（`lib/scrapers/top14-lnr-match-events.ts:91` と `:174`）で `isPenaltyTry: false` をハードコードしている。**本 spec がこのフラグの最初の生成元になる。**

## スコープ

**対象:**
- `lib/scrapers/top14-lnr-match-events.ts` — `essai-de-penalite` の解釈と、`isPenaltyTry` を立てたトライの生成
- `tests/scrapers/top14-lnr-match-events.test.ts` — 変換の検証

**対象外:**
- `lib/ingestion/event-integrity.ts`・`lib/format/match-event-points.ts`・`lib/ingestion/events.ts`・`lib/llm/stages/derived-stats.ts`（**いずれも既に対応済み。触らない**）
- `match_events` のスキーマ変更（`metadata` に入るためマイグレーション不要）
- カード類の変換（`jaune` / `rouge` / `orange`）
- レート制限とバッチ上限
- **未知語彙でバッチ全体を停止させる設計**（未解決の質問2）
- 既に投入済みの3試合の再取得

## データモデル変更

**なし。マイグレーション不要。**

## API サーフェス

`lib/scrapers/top14-lnr-match-events.ts` 内で完結する。

1. **`eventType`**: `type === "Point"` かつ `slugSubType === "essai-de-penalite"` を **`"try"`** として扱う。
2. **ペナルティトライの判定**: fact がペナルティトライかどうかを判定する述語を用意する（`type === "Point" && slugSubType === "essai-de-penalite"`）。`eventType` の戻り値は型だけなので、フラグは別に持つ。
3. **`scoreEventsForIncrement`**: 差分 **+7** の扱いを分岐する。
   - **その差分がペナルティトライ fact 自身のチームのものである場合**: `type: "try"` / `isPenaltyTry: true` / `playerName` は fact の選手名（LNR が選手を持たない場合は空文字） のイベントを**1件だけ**返す。**コンバージョンを生成しない。**
   - それ以外（通常のトライ）: 現行どおり `try` ＋ 匿名 `conversion` の2件。
4. **イベント生成ヘルパ**: 現在 `isPenaltyTry: false` を固定している箇所を、フラグを受け取れる形にする。カード出力側（`:174` 付近）は `false` のままでよい。
5. **異常系**: ペナルティトライ fact の自チーム差分が **+7 以外**のときは例外を投げる。メッセージに差分の値と分を含める（既存の `Unexpected Top 14 score increment` と同じ様式）。

## UI サーフェス

なし。既存のイベント表示・得点推移がそのまま適用される（`pointsForMatchEvent` が7点として扱う）。

## LLM 連携

なし。スクレイパーと DB 書き込みのみ。**LLM 費用の増減はゼロ。**

## 受け入れ条件

1. `type = "Point"` / `slugSubType = "essai-de-penalite"` で自チーム差分 +7 の fact から、**イベントが1件だけ**生成される。`type = "try"`、`isPenaltyTry = true`、`minute` と `teamSide` は fact のもの。
2. **その fact から `conversion` イベントが生成されない。** 同じ分・同じ `teamSide` の `conversion` が0件であることを assert する。
3. そのフィクスチャ全体の `teamSide` 別得点合計が、**ペナルティトライを7点として**最終スコアと一致する（`computeParsedMatchEventPointTotals` と `eventTotalsMatchFinalScore` を通して確認する）。
4. **通常のトライ（+7）の挙動が変わっていない。** `try`（`isPenaltyTry = false`）＋匿名 `conversion` の2件が生成される既存テストが通り続ける。
5. ペナルティトライ fact の自チーム差分が +7 以外（例: +5）のとき例外を投げ、メッセージに差分の値と分が含まれる。
6. `essai-de-penalite` 以外の未知 subtype は引き続き例外を投げる（既存テスト `rejects an unknown game-fact subtype instead of ignoring it` が通り続ける）。
7. **意図的破壊の確認**: ペナルティトライの分岐を外して従来の「+7 → トライ＋コンバージョン」に戻すと、受け入れ条件1・2・3のテストが**実際に落ちる**ことを確かめ、結果を PR 本文に書く。
8. `pnpm typecheck` / `pnpm lint` / `pnpm test` が通る。テスト総数が **311 files / 1,910 tests** から減っていない。

### 本番での検証（Owner 承認のうえ実施。Codex は実行しない）

9. 手動 `workflow_dispatch` の実行後、**j1 の残り4試合すべてにイベントが入る**。各試合で `teamSide` 別合計（ペナルティトライは7点）が `matches.home_score` / `away_score` と一致する。
10. 該当のペナルティトライが `match_events` に `type = 'try'` かつ **`metadata->>'is_penalty_try' = 'true'`** で保存されている（専用列は無い）。
11. Top 14 2026-27 の `finished` 14試合で、イベント0件の試合が**0件**になる。

## 未解決の質問

1. **どの試合にペナルティトライがあるかは未特定。** 未着手4件は同一キックオフ時刻のため処理順から絞れない。実装時に4件の `resumes-replays` を確認すること。**複数試合に含まれる可能性もある。**
2. **未知語彙でバッチ全体を止める設計を変えるか。** `rouge` → `orange` → `essai-de-penalite` と3回続けて同じ止まり方をしている。ただし**ペナルティトライは得点に関わる事実であり、「非得点の未知語彙だけスキップする」案では今回は防げなかった**。得点系で止めるのはスコア整合を守るうえで正しい動作なので、**この件は「止め方」ではなく「既知語彙をどこまで先回りして揃えるか」の問題**として扱うべきかもしれない。
3. **ドロップゴールが未観測。** 4回目の停止が起きる可能性が高い。既知の subtype 一覧をコード内に明記し、未知に当たったときに「何が既知か」を即座に見せる形にするかは Owner 判断。
