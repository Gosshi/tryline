# fix-aggregated-kicker-minute-variants

## 背景

[`fix-urc-rc-kicker-section-events`](./fix-urc-rc-kicker-section-events.md)（PR #424）で URC の `Con:` 集約形式 `キッカー (made/att) 分', 分',…` を拾えるようになり、URC 2025-26 の **58試合が exact に改善**した。

しかし再パース後も **91試合中 80試合が undercount のまま**で、本番DB検証（2026-06-13）の結果、**主因はペナルティ（`Pen:`）の取りこぼし**と確定（undercount の 80/91 が `pg=0`）。

`#424` の `parseAggregatedKickerText` は `(\d+/\d+)` の **made/att 分数を必須**にしている。だが URC の `Pen:`（と一部 `Con:`）は分数を持たない**多様な形式**で書かれており、全て落ちている:

| 実例（本番生HTML） | 落ちている得点 |
|---|---|
| `Pen: Feinberg-Mngomezulu 5', 43'`（裸・括弧なし） | PG 2 |
| `Pen: Doak (3) 5', 25', 43'`（`(3)`=本数のみ・分数でない） | PG 3 |
| `Pen: Naughton (74')`（分が括弧内） | PG 1 |
| `Pen: Sheedy 70'`（裸・単発） | PG 1 |

## 方針（whack-a-mole を止める一般化）

形式を個別に追うのをやめ、**「`Con:`/`Pen:`/`Drop goal:` セクション内の分マーカー（`\d{1,3}(?:\+\d{1,2})?'`）を抽出し、1分につき1イベント生成」**に一般化する。`(7/8)` や `(3)` は `'` を含まないため分マーカーに混入しない（自然に除外される）。

これにより全バリアントを一掃でき、`#424` の分数形式も包含する。

## スコープ

対象:
- `lib/scrapers/wikipedia-match-events.ts` の集約キッカー処理（`#424` の `parseAggregatedKickerText` / `flushAggregatedKickerText`）から **`(\d+/\d+)` 必須の制約を外し**、分マーカー件数でイベント生成する
- 分数 `(made/att)` が存在する場合は made 値と分件数の不一致を warn（既存の健全性チェックは維持）
- RC パーサ（`lib/scrapers/wikipedia-rc-match-details.ts`）も同じ分マーカー基準に揃える（既に `(...)` フォールバックあり。裸の `Kicker 分', 分'` まで拾えるか確認・必要なら合わせる）

対象外:
- `<a>` リンク付きキッカー形式（Six Nations / SRP）は既存パスで動作継続＝**後方互換維持**（変更しない）
- トライのパース（`Try:` は選手別・既存どおり）
- ノックアウト試合の events 0（別問題）

## データモデル変更

なし。

## 変更詳細

`parseAggregatedKickerText`（または相当処理）を次のように緩める:

- 入力テキスト（`Con:`/`Pen:`/`Drop goal:` ラベル後の区間）から:
  - 分マーカー `\d{1,3}(?:\+\d{1,2})?'` を全抽出 → **各分につき1イベント**（当該 type）
  - キッカー名 = 先頭から最初の `(` または最初の分マーカーまでのテキスト（trim、best-effort）
  - `(\d+/\d+)` 分数が**ある場合のみ** made 値と分件数の不一致を warn
  - 分マーカーが1つも無ければイベント生成しない（現状どおり）
- `<a>` リンク付きキッカーが先頭にある場合は既存パス（currentPlayer 経由）を維持し、二重生成しないこと

## 受け入れ条件

1. ユニットテスト（実HTMLフラグメント）:
   - `Pen: Feinberg-Mngomezulu 5', 43'` → penalty_goal 2件（5,43）
   - `Pen: Doak (3) 5', 25', 43'` → penalty_goal 3件（5,25,43。`(3)` を分に混入しない）
   - `Pen: Naughton (74')` → penalty_goal 1件（74）
   - `Pen: Sheedy 70'` → penalty_goal 1件（70）
   - `Con: le Roux (7/8) 4', 15', 31', 50', 63', 70', 78'` → conversion 7件（#424 の回帰なし）
2. 後方互換: Six Nations / SRP の `<a>` リンク Con: テストが回帰しない
3. （Owner 実行）パーサ修正後に `backfill --reparse-existing` を再実行すると、URC 2025-26 の undercount が **80件規模 → 一桁**に減る
4. ビルド・typecheck・lint・既存テスト緑

## 運用（Owner 実行・マージ後）

```
git fetch origin && git reset --hard origin/main
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/backfill-urc-match-events.ts --season=2025-26 --reparse-existing --dry-run
# 確認後
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/backfill-urc-match-events.ts --season=2025-26 --reparse-existing --confirm-owner-approved
```
→ 私が本番 SQL で undercount を再検証。

## 未解決の質問

- 残る undercount（pg>0 でも未充足の 11件規模）は別の小バリアントの可能性。再検証後に必要なら追加調査
- RC 2025 はシード由来で別経路（本 spec はパーサ一般化のみ）
