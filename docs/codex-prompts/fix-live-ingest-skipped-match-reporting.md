# Codex プロンプト: fix-live-ingest-skipped-match-reporting

`specs/fix-live-ingest-skipped-match-reporting.md` の受け入れ条件に従って実装してください。**仕様の内容をここで繰り返しません。先に spec を全文読んでください。**

## やること

`lib/ingestion/live-ingest.ts` だけを変更します。チームを解決できずに捨てた試合の件数と内訳を、戻り値に含めてください。

## 先に読むファイル

```
specs/fix-live-ingest-skipped-match-reporting.md
lib/ingestion/live-ingest.ts     ← :32-42 型 / :286-288 unknownTeamNames / :335-349 捨てる箇所 / :322-331 早期リターン / :483-496 通常の戻り値
```

## 一番間違えやすいところ

**`unknown_teams` に混ぜないでください。**

`unknown_teams` は `fetched.unknownTeamNames`（`:286-288`）由来で、**「ソースが報告した未知チーム名」**という別の意味を持ちます。Top 14 とプレミアシップはこれを使っています。捨てた試合の件数はここに足さず、**`skipped_matches` という別のカウンタを新設してください。** 受け入れ条件7はこれを守らせるためのテストです。

**捨てた試合があっても失敗させないでください。**

「0件でないなら異常」と扱いたくなりますが、**ここでは逆です。** ノックアウトのプレースホルダ（`Winner SF1 vs Winner SF2` など）は正常に発生します。PNC は準決勝が終わるまで毎回2件、RWC 2027 は1年以上にわたって出続けます。**例外を投げたり非200を返したりしないでください。** 受け入れ条件6がこれを守らせます。

**戻り値は2箇所あります。** `:322-331` の早期リターンを忘れないでください。そこは `flatMap` に到達していないので **`skipped_matches: 0`** です。

**0件のときはキーごと省いてください。** `undefined` を代入するのではなく、`rejections` と同じ `...(skippedMatches.length > 0 ? { skippedMatches } : {})` の形にしてください（`:495` に前例があります）。受け入れ条件4は `"skippedMatches" in result === false` で確認します。**`result.skippedMatches === undefined` での確認にしないでください**（キーが存在しても通ってしまいます）。

## テストは RED から始めてください

**RED になるのは受け入れ条件3だけです。**

| # | 内容 | 現行実装 |
|---|---|---|
| 3 | 2件捨てたとき `skipped_matches: 2` と内訳が返る | **落ちる（RED）** |
| 4 | 0件のとき `"skippedMatches" in result === false` | 通る（キーが無いので） |
| 6 | 2件捨てても例外を投げない | 通る（既存動作の保護） |
| 7 | Top 14 で `unknown_teams` が従来値と一致 | 通る（回帰防止） |

先に3を書いて落ちることを確認してから実装し、PR 本文にその出力を貼ってください。

## 触ってはいけないもの

```
lib/ingestion/sources/**            ソース側は変更しない
lib/format/schedule-coverage.ts     別 spec
matches テーブルのスキーマ           home_team_id の nullable 化は別判断
unknown_teams / unknownTeamNames の算出
rejections の扱い
```

## console の文言

`console.warn` の `Skipping unknown team:` の行は**残してください**。ログからの追跡を壊さないためです。

`console.info`（`:483-485`）には `skipped=<件数>` を**末尾に追加**してください。既存項目の順序と表記は変えないでください。

```
[pnc-2026] inserted=0 updated=2 events_inserted=0 unknown_teams=0 skipped=2
```

## 完了の定義

1. spec の受け入れ条件11項目すべてを満たす
2. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
3. PR 本文に次を貼る
   1. 受け入れ条件3が実装前に落ちた出力（RED → GREEN）
   2. 受け入れ条件4を `"skippedMatches" in result` で確認した出力
   3. PNC 2026 相当の入力（4試合中2件が slug 解決不可）での `counts` の実際の出力

**期待値を手で書き写さないでください。** 実際にテストを走らせた出力を貼ってください。
