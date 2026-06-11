# Codex プロンプト: イベントブロック照合のチームリンク厳密化

仕様: `specs/fix-event-block-team-link-matching.md` を参照（診断結果・コード全文は仕様書に記載）。

## タスク

`findEventBlockByTeams`（`scripts/fill-event-gaps.ts`）の照合を2段階化する。チーム名の単純部分一致がレフェリー国籍等に誤マッチして候補が爆発し、Autumn Nations の回収が 16/32 にとどまったバグの修正。

## 変更内容

`findEventBlockByTeams` を仕様書のコードに置き換える:

1. **第1段階（新規）**: `"{homeTeamName} national rugby union team"` と `"{awayTeamName} national rugby union team"` の両方を含むブロックで照合。1件なら採用、複数なら日付絞り込み
2. **第2段階（従来ロジック）**: 第1段階が0件のとき（クラブチーム等）、現行の部分一致＋日付絞り込みにフォールバック

他の関数・呼び出し側・ログ・ガードは変更しない。

## テスト

`tests/scripts/fill-event-gaps.test.ts` に追加・更新:

- レフェリー国籍として第3国名を含むフィクスチャ（例: `Referee: ... (Australia)` を含む England v Fiji ブロック）が、Australia の試合の候補にならないこと
- ナショナルチームリンク形式（`title="X national rugby union team"` 相当の文字列）を含むフィクスチャで厳密照合が機能すること
- クラブチーム名のみのフィクスチャで第2段階フォールバックが機能すること
- 既存テストのフィクスチャが厳密照合に該当しない場合は第2段階で通るはず（必要に応じてフィクスチャ調整可）

## 完了の定義

- `pnpm tsc --noEmit` が通る
- `pnpm test` が通る
- 変更ファイル: `scripts/fill-event-gaps.ts`・`tests/scripts/fill-event-gaps.test.ts` のみ
- **PR の base は必ず `main` にすること**
