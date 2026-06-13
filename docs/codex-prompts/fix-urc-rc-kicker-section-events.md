# Codex プロンプト: URC/RC の Con:/Pen: 集約キッカー形式パース

仕様: `specs/fix-urc-rc-kicker-section-events.md` を参照（内容はインライン展開しない）。

## タスク

URC/RC の undercount（イベント得点合計 < 最終スコア）の根因を直す。Wikipedia には全データが載っているが、`parseScoringCell` が `Con:`/`Pen:` の**集約キッカー形式**を取りこぼしている。

### 確定済みの根因

`lib/scrapers/wikipedia-match-events.ts` の `parseScoringCell` は `<a>` リンク付き選手にしかイベントを生成しない。URC/RC の得点セルは:

```html
<b>Try:</b> <a>le Roux</a> 3' c<br><a>Moodie</a> 14' c<br><a>Jooste</a> 23' m<br>...
<b>Con:</b> le Roux (7/8) 4', 15', 31', 50', 63', 70', 78'<br>
<b>Pen:</b> Libbok (1/1) 46'<br>
```

- トライ: `<a>`＋分 → **既存ロジックで拾えている**（末尾 `c`/`m` は無視されている）
- Con:/Pen:/Drop: は **プレーンテキスト「キッカー (made/att) 分', 分', …」** → 現状**丸ごと無視**され、コンバージョン・PG が全欠落

## 着手前の確認（重要）

URC/RC の実際の取り込みで `parseScoringCell` を経由する関数（`parseMatchEventsFromVeventHtml` td0/td2 か `parseMatchEventsFromUrcDetailRowHtml` td1/td3）のどちらが使われているかをトレースし、本修正が実経路に効くことを確認する。URC 検出行は **td[0]=時刻 / td[1]=home / td[2]=Reportリンク / td[3]=away** のセル構成（`live-ingest.ts` が td0/td2 前提の関数を使っていれば、そちらの是正も必要）。

## 変更内容

### `lib/scrapers/wikipedia-match-events.ts` — `parseScoringCell`

ボールドラベル（`Con:` / `Pen:` / `Drop goal:` / `Drop goals:`）の区間で、後続が**プレーンテキストの集約形式**（`<a>` を伴わず `(\d+/\d+)` と分リストを含む）の場合の分岐を追加:

- 区間テキストから分リストを抽出: 正規表現 `/(\d{1,3})(?:\+\d{1,2})?'/g`
- **抽出した各分につき1イベント**を当該 type（conversion / penalty_goal / drop_goal）で生成
- 選手名 = キッカーのプレーンテキスト（先頭から `(` 直前まで、trim）。`<a>` があればそのテキストを優先
- `(made/att)` の made 値と抽出分件数が不一致なら `console.warn` で記録（イベント生成は分リスト件数を正とする）
- **後方互換**: 後続が従来の `<a>` リンク付き形式なら既存ロジックを維持（Six Nations / SRP を壊さない）

`flush()` / text ノード処理の現行構造を尊重し、集約形式の検出は「currentType が conversion/penalty_goal/drop_goal かつ currentPlayer が未確定のまま分数・分リストを含む text に遭遇」した時点で行う。

## テスト（`tests/scrapers/` に追加）

実HTMLフラグメントを使う:

1. **URC home cell**: `Try:` 8トライ（`<a>`＋分、末尾 c×7/m×1）＋ `Con: le Roux (7/8) 4', 15', 31', 50', 63', 70', 78'`
   → try 8件 + conversion **7件**（implied 54）
2. **URC away cell**: `Try:` 3トライ ＋ `Con: Roger (2/3) 21', 60'` → try 3 + conversion **2**（implied 19）
3. **RC cell**: `Con: Libbok (5/6) 25', 43', 61', 73', 79'` ＋ `Pen: Libbok (1/1) 46'`
   → conversion **5** + penalty_goal **1**
4. **後方互換**: 既存の `<a>` リンク付き Con:（旧形式）が従来通り1件ずつ生成される
5. **クロスチェック**: 生成された conversion 数 == トライ末尾 `c` の個数

## 受け入れ条件（完了の定義）

- ビルド・typecheck・lint 緑、既存テスト緑
- 上記テスト1-5 が通る
- URC/RC の実経路で `parseScoringCell` 修正が効くことをトレースで確認済み
- （Owner 実行）パーサ修正後に URC 2025-26 を再取り込みすると undercount 試合が 79 → 一桁に減る

## エッジケース・注意事項

- 分の重複表記（`63', 63'` 等）はそのまま件数通り生成（Wikipedia の記載を正とする）
- penalty try（`isPenaltyTry`）の扱いは変更しない
- 取り込み・再取り込みの本番実行は Owner。Codex はパーサ修正＋テスト＋（必要なら）バックフィルスクリプトの引数追加まで
- **RC 2025 は生HTML未保存（シード由来）**。パーサ修正だけでは更新されない旨をPR説明に明記（再シードは別タスク）

## 参考パターン

- `parseScoringCell` の bold ラベル / text ノード処理の現行実装（`lib/scrapers/wikipedia-match-events.ts`）
- URC セルの正しい読み取りは `parseMatchEventsFromUrcDetailRowHtml`（td1/td3）
- 点数換算・イベント型は同ファイルの型定義
