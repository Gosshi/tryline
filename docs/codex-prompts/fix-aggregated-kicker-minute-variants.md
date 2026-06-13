# Codex プロンプト: 集約キッカーの分マーカー一般化（Pen: 取りこぼし根治）

仕様: `specs/fix-aggregated-kicker-minute-variants.md` を参照（インライン展開しない）。

## タスク

PR #424 は `Con: キッカー (made/att) 分',…` の分数形式だけ対応した。だが URC の `Pen:` は分数を持たない多様な形式で書かれ、全て落ちている（本番検証: undercount 80/91 が pg=0）:

```
Pen: Feinberg-Mngomezulu 5', 43'      （裸・括弧なし）
Pen: Doak (3) 5', 25', 43'            （(3)=本数のみ・分数でない）
Pen: Naughton (74')                   （分が括弧内）
Pen: Sheedy 70'                       （裸・単発）
```

`parseAggregatedKickerText` の `(\d+/\d+)` 必須制約を外し、**「セクション内の分マーカーを数えて1分=1イベント」**に一般化する。

## 変更（`lib/scrapers/wikipedia-match-events.ts`）

`parseAggregatedKickerText` を緩める:

1. 分数 `(\d+/\d+)` を**必須にしない**。テキストから分マーカー `\d{1,3}(?:\+\d{1,2})?'` を全抽出し、**各分につき1イベント**を当該 type で生成
2. キッカー名 = 先頭から最初の `(` または最初の分マーカーまでのテキスト（trim、best-effort）。空でも分があればイベント生成は行う
3. `(\d+/\d+)` 分数が**存在する場合のみ**、made 値と分件数の不一致を `console.warn`（既存の健全性チェック維持）
4. `(3)` のような単一数値の括弧は分マーカー（`'` 必須）に混入しないので自然に無視される
5. 分マーカーが0なら従来どおりイベント生成しない

`flushAggregatedKickerText` の発火条件（currentType が conversion/penalty_goal/drop_goal かつ currentPlayer 未確定の text ノード）は維持。`<a>` リンク付きキッカー（Six Nations/SRP）は既存パスのままで二重生成しないこと。

RC パーサ `lib/scrapers/wikipedia-rc-match-details.ts` の `parseScoringEntry` も、裸の `Kicker 分', 分'`（括弧なし）まで同基準で拾えるか確認し、必要なら分マーカー基準に揃える。

## テスト（`tests/scrapers/`）

実HTMLフラグメントで:
1. `Pen: Feinberg-Mngomezulu 5', 43'` → penalty_goal 2件（minute 5, 43）
2. `Pen: Doak (3) 5', 25', 43'` → penalty_goal 3件（5,25,43。件数が3で `(3)` を分に混入しない）
3. `Pen: Naughton (74')` → penalty_goal 1件（74）
4. `Pen: Sheedy 70'` → penalty_goal 1件（70）
5. `Con: le Roux (7/8) 4', 15', 31', 50', 63', 70', 78'` → conversion 7件（#424 回帰なし）
6. 後方互換: 既存の `<a>` リンク Con:（Six Nations/SRP）テストが緑のまま

## 受け入れ条件（完了の定義）

- ビルド・typecheck・lint 緑、既存テスト緑
- 上記テスト1-6 が通る
- （Owner 実行）`backfill --reparse-existing` 再実行で URC 2025-26 undercount が 80件規模→一桁

## 注意

- 本番再パースは Owner。Codex はパーサ修正＋テストまで
- 二重生成に注意（`<a>` リンクキッカーと集約テキストの両方で同じ得点を作らない）
- penalty try（`isPenaltyTry`）の扱いは変更しない

## 参考パターン

- `#424` で追加した `parseAggregatedKickerText` / `flushAggregatedKickerText`（`lib/scrapers/wikipedia-match-events.ts`）
- RC の非分数フォールバックは `wikipedia-rc-match-details.ts` の `parseScoringEntry` 第2分岐
