# fix-urc-rc-kicker-section-events

## 背景

URC 2025-26 は finished 138試合中 **79試合**でイベント由来の得点合計が最終スコアを下回る（undercount）。Rugby Championship 2025 もほぼ全試合が不整合。得点推移・派生スタッツを差別化機能として訴求している以上、致命的な品質欠陥。

本番 DB の生HTML（`match_raw_data.payload.html`）を直接検証（2026-06-13）し、**これはソースの欠落ではなくパーサの取りこぼし**と確定した。Wikipedia には必要なデータが完全に載っている。

### 実証（Bulls 54-19 Zebre Parma の URC 生HTML）

```html
<b>Try:</b> <a href="...">le Roux</a> 3' c<br><a href="...">Moodie</a> 14' c<br>
  <a>Jooste</a> 23' m<br><a>Petersen</a> 30' c<br>...<a>Rudolph</a> 77' c<br>
<b>Con:</b> le Roux (7/8) 4', 15', 31', 50', 63', 70', 78'<br>
```

- **トライ**: `<a>` リンク付き選手＋分。各トライ末尾に `c`（成功）/`m`（失敗）サフィックス
- **コンバージョン**: `<b>Con:</b> キッカー名 (成功/試投) 分', 分', …` の**集約プレーンテキスト**（`<a>` 無し・分数・カンマ区切り分リスト）
- **ペナルティ**: 存在時は `<b>Pen:</b> キッカー名 (成功/試投) 分', …`（同形式）

### 根因（パーサ）

`lib/scrapers/wikipedia-match-events.ts` の `parseScoringCell` は **`<a>` リンク付き選手にのみイベントを生成**する（ボールドラベルで種別切替 → 直後の `<a>` で選手確定 → 分パース）。

URC/RC の `Con:`/`Pen:` セクションはキッカーが**プレーンテキスト**（`<a>` 無し）で、得点は `(7/8)` の分数と分リストで表現される。`parseScoringCell` の text ノード処理は currentPlayer が null のとき "Penalty try" 判定しか行わないため、**`Con:`/`Pen:` セクションを丸ごと無視**。結果、トライだけ拾われコンバージョン・PG が全て欠落 → undercount。

- 例: Bulls の `Con: le Roux (7/8)` = 7本(14点)が消失。これが大半の URC 試合の undercount を説明する
- **URC と RC は同一形式**（RC: `Con: Libbok (5/6) 25', 43', 61', 73', 79'` / `Pen: Libbok (1/1) 46'`）。同一修正で両方解決

関連: 既存 spec [`fix-score-event-integrity-check`](./fix-score-event-integrity-check.md)（検知のみ）、[`fix-derived-stats-event-integrity-gate`](./fix-derived-stats-event-integrity-gate.md)（不正確時の派生スタッツ抑制）の前提となるデータ自体を本 spec で修正する。[`spike-structured-data-source-evaluation`](./spike-structured-data-source-evaluation.md) の結論（外部ソース不要・parser修正で解決）の実装。他の URC 系 spec（feat-urc-srp-match-events=取得率ゼロ解消 / fix-urc-knockout-parser=KO の eventID 正規表現 / p5-urc-event-seed=シード HTML 構造）とは**別問題**（本 spec は集約キッカー形式のパース）。

## スコープ

対象:
- `parseScoringCell`（`lib/scrapers/wikipedia-match-events.ts`）を拡張し、`Con:`/`Pen:`/`Drop goal:` の**集約キッカー形式**（`キッカー (made/att) 分', 分', …`）を解釈して、**分リストの各分につき1イベント**（conversion / penalty_goal / drop_goal）を生成する
- 既存の `<a>` リンク付き形式（Six Nations 等）の後方互換を維持する
- URC/RC のイベント再取り込み（パーサ修正後にライブ経路 or バックフィルで再生成）

対象外:
- トライ末尾 `c`/`m` サフィックスからのコンバージョン推定（`Con:` セクションが authoritative。`c`/`m` は受け入れ条件のクロスチェックにのみ使用、イベント生成には使わない）
- recap 再生成（別途、影響 match を `--match-ids` で。本 spec はイベント修正まで）
- 派生スタッツ計算ロジック自体の変更

## データモデル変更

なし（既存 `match_events` へ正しいイベントを追加取り込みするのみ）。

## 取り込み経路の確認（Codex が着手前に確認）

URC のライブ取り込み（`lib/ingestion/live-ingest.ts`）は `parseMatchEventsFromVeventHtml`（td[0]=home / td[2]=away 前提）を使う。しかし URC 検出行のセル構成は **td[0]=時刻 / td[1]=home得点 / td[2]=Reportリンク / td[3]=away得点** であり、`parseMatchEventsFromUrcDetailRowHtml`（td[1]/td[3]）が正しい。両関数とも内部で `parseScoringCell` を共有する。

→ Codex は **URC/RC の実際の取り込みでどの関数が使われているか**をトレースし、`parseScoringCell` の修正が実経路に効くことを保証すること（必要なら live-ingest 側のパーサ選択も是正）。

## 変更詳細（パーサ）

`parseScoringCell` のボールドラベル区間処理に、集約キッカー形式の分岐を追加する。

- `<b>Con:</b>` / `<b>Pen:</b>` / `<b>Drop goal(s):</b>` の後続が **プレーンテキスト**（`(made/att) min', min', …`）の場合:
  - 正規表現で分リスト（`\d{1,3}(?:\+\d{1,2})?'`）を抽出し、**各分につき1イベント**を生成（type は当該ラベル種別）
  - 選手名はキッカーのプレーンテキスト（`(made/att)` と分リストを除いた部分）。`<a>` があればそのテキスト
  - `(made/att)` の made 値が抽出分リストの件数と一致することを検証（不一致は warn ログ）
- 後続が従来の `<a>` リンク形式の場合は既存ロジックを維持（後方互換）

## 受け入れ条件

1. ユニットテスト: Bulls 54-19 Zebre の実 URC セル HTML を入力 →
   - home: トライ8 + `Con: le Roux (7/8)` から **コンバージョン7** → home implied = 8×5 + 7×2 = 54
   - away: トライ3 + `Con: Roger (2/3)` から **コンバージョン2** → away implied = 19
2. ユニットテスト: RC の実セル HTML（`Con: Libbok (5/6) ...` / `Pen: Libbok (1/1) ...`）→ コンバージョン5・ペナルティ1 が生成される
3. 既存の `<a>` リンク形式（Six Nations / SRP）のテストが回帰しない（後方互換）
4. パーサ修正後に URC 2025-26 を再取り込みすると、undercount（team の implied < actual）試合が大幅に減る（目標: 79 → 一桁）
5. トライ末尾 `c`/`m` サフィックスは無視されてもよいが、`Con:` 由来コンバージョン数が `c` の個数と一致することをテストで確認（データ健全性のクロスチェック）
6. ビルド・typecheck・lint・既存テスト緑

## 決定事項・未解決の質問

- **RC 2025 は生HTML未保存（シード由来）**。パーサ修正だけでは更新されない。修正後に RC 2025 をどの経路で再取り込み/再シードするかは別タスク（本 spec はパーサ修正＋ライブ経路の URC/RC 2026 まで）。RC 2025 を Owner がやるか要判断
- 再取り込みは段階適用（まず URC 数試合で検証 → 全 URC → RC）。一括再取り込みで既存イベントを壊さないよう upsert の冪等性を確認
- 取り込み後、undercount が解消した match の recap 再生成は `--match-ids` で別途（試し焼き必須）
