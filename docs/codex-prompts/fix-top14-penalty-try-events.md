# Codex 指示書: Top 14 のペナルティトライ対応

仕様: `specs/fix-top14-penalty-try-events.md`（権威。ここに書いていない判断は仕様書に従う）

## 問題

Top 14 のイベント取り込みが `type=Point slugSubType=essai-de-penalite`（ペナルティトライ）で停止している。

```
{"detail":"Unknown Top 14 game-fact subtype: type=Point slugSubType=essai-de-penalite"}
```

**単に `try` へ写像するだけでは不正なデータが入る。** 現在の `scoreEventsForIncrement` は差分 +7 を「トライ＋匿名コンバージョン」に展開するが、**ペナルティトライは7点で変換キックが存在しない**。そのまま通すと (1) 蹴っていないコンバージョンを捏造し、(2) 合計が 7+2=9 になって `eventTotalsMatchFinalScore` に弾かれ、結局その試合は入らない。

## やること

`lib/scrapers/top14-lnr-match-events.ts` の中で完結させる。

1. `eventType` で `Point` + `essai-de-penalite` を `"try"` として扱う
2. ペナルティトライ fact を判定する述語を用意する（`eventType` は型しか返さないので、フラグは別に持つ）
3. `scoreEventsForIncrement` の **+7** を分岐する
   - ペナルティトライ fact 自身のチームの差分なら → `type:"try"` / `isPenaltyTry:true` / 選手名は fact のもの を**1件だけ**返す。**コンバージョンを返さない**
   - 通常のトライなら → 現行どおり `try` ＋ 匿名 `conversion` の2件
4. イベント生成ヘルパの `isPenaltyTry: false` 固定を、フラグを渡せる形にする（カード出力側は `false` のままでよい）
5. ペナルティトライ fact の自チーム差分が +7 以外なら例外（メッセージに差分と分を含める。既存の `Unexpected Top 14 score increment` と同じ様式）

## 触らないこと

**消費側は既に対応済み。** 以下は変更不要で、変更してはいけない。

- `lib/format/match-event-points.ts` — `PENALTY_TRY_POINTS = 7` で既に7点として計算する
- `lib/ingestion/event-integrity.ts` — `computeParsedMatchEventPointTotals` が `pointsForMatchEvent` を使うため、整合チェックは対応済み
- `lib/ingestion/events.ts` — `buildMetadata` が `metadata.is_penalty_try = true` を書く（**`match_events` に専用列は無い**）
- `lib/llm/stages/derived-stats.ts` — ペナルティトライをコンバージョン試投数から除外済み

カード類の変換（`jaune` / `rouge` / `orange`）、レート制限、バッチ上限も対象外。

## フィクスチャについて

**どの試合にペナルティトライがあるかは未特定です。** j1 の未着手4件（バイヨンヌ×トゥーロン 27-26 ／ リヨン×クレルモン 40-36 ／ モンペリエ×ポー 19-27 ／ カストル×ヴァンヌ 29-20）は**すべて同一キックオフ時刻**のため、処理順から絞れませんでした。

既存の robots 対応フェッチャーで4件の `resumes-replays` を確認し、**実データの `game-facts` からフィクスチャを作ること**。複数試合に含まれる可能性もあります。手作り HTML で済ませないこと。

## 完了の定義

仕様書の受け入れ条件1〜8。特に次を省略しない。

- **AC2**: そのペナルティトライから `conversion` が生成されないこと（同じ分・同じ `teamSide` の conversion が0件）を assert する
- **AC3**: 得点合計が**ペナルティトライを7点として**最終スコアと一致すること
- **AC7（意図的破壊）**: 分岐を外して従来の「+7 → トライ＋コンバージョン」に戻すと、AC1・2・3 のテストが**実際に落ちる**ことを確認し、結果を PR 本文に書く

受け入れ条件9〜11（本番実行と DB 照合）は **Owner 承認が必要なので Codex 側では実行しない**。PR 本文に「未実施」と明記すること。

## 検証コマンド

```
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm test` のテスト総数が 311 files / 1,910 tests から減っていないことを PR 本文に書くこと。

## 依存

追加パッケージなし。マイグレーションなし。本番DBへの書き込みなし。
