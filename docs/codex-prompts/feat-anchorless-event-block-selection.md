# Codex プロンプト: アンカー無しページのイベントブロック選択

仕様: `specs/feat-anchorless-event-block-selection.md` を参照（背景・関数仕様・運用手順はすべて仕様書に記載）。

## タスク

Autumn Nations 2025 のソースページには試合別 id アンカーが存在しないため、`scripts/fill-event-gaps.ts` に「チーム名＋日付で vevent ブロックを特定する」フォールバックを追加する。

## 変更ファイルと内容

### `scripts/fill-event-gaps.ts`

1. **`findEventBlockByTeams` を新規実装**（export してテスト可能に）— シグネチャ・ロジックは仕様書のコードを使用
   - `.vevent` 要素を列挙し、両チーム名を含むブロックを候補化
   - 候補1件 → 採用。複数 → 日付（前後1日許容）で絞り、1件になれば採用。それ以外は `null`
2. **`blockContainsDate` ヘルパーを実装** — vevent 内の日付文字列（`1 November 2025` 形式等）を `Date` でパースし、`kickoffDate`（YYYY-MM-DD）±1日と照合
3. **`fillMatch` のフロー変更**:
   - `extractEventHtml` が `null` のとき `findEventBlockByTeams` を試す
   - チーム名照合は `english_name` があれば優先、なければ `name`
   - それも `null` なら `console.log("  -> no unique event block found, skipping")` で skip
   - チーム名選択で解決した場合は `console.log("  -> resolved by team-name block selection")`
   - 既存のスコア整合ガードはどちらの経路でも適用
4. **`loadGapMatches`** の select に `kickoff_at` を追加し、`MatchGapRow` 型を更新。チーム select に `english_name` を追加（存在するカラムか確認すること）

## エッジケース

- チーム名が他チーム名の部分文字列になるケース（例: "Australia" は他ブロックの文中にも出現しうる）→ 両チームを含むことを条件にすることで実質回避されるが、テストで「片方しか含まないブロックは候補にならない」ことを確認
- `kickoff_at` が UTC のため現地日付と1日ずれる → ±1日許容で吸収
- vevent ブロックに日付が無い/パース不能 → そのブロックは日付絞り込みで不一致扱い

## テスト

`tests/scripts/fill-event-gaps.test.ts` に追加（固定 HTML フィクスチャ使用）:
- 両チーム名を含む vevent が1個だけ → そのブロックを返す
- 候補0件 → null
- 候補2件・日付で1件に絞れる → 該当ブロックを返す
- 候補2件・日付でも絞れない → null
- 既存の `extractEventHtml` テストが変更なしで通る

## 完了の定義

- `pnpm tsc --noEmit` が通る
- `pnpm test` が通る
- 変更ファイル: `scripts/fill-event-gaps.ts`・`tests/scripts/fill-event-gaps.test.ts` のみ
- マイグレーションなし・DB 書き込みなし（運用 SQL は Owner が別途実行）
