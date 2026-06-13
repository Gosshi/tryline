# Codex プロンプト: backfill に --reparse-existing を追加（既存 URC 試合の再パース）

仕様: `specs/feat-backfill-reparse-existing-urc-events.md` を参照（インライン展開しない）。

## タスク

PR #424 でパーサは直ったが、既に finished の URC 試合は古い undercount イベントのまま。ライブ cron は新規 finished のみ、backfill は events 皆無の試合のみが対象で、**既存試合を再パースできない**。

`scripts/backfill-urc-match-events.ts` に **`--reparse-existing` フラグ**を足し、events を持つ finished URC 試合も再パース対象に含められるようにする。`upsertMatchEvents` は delete→insert で冪等なので二重計上は起きない。

## 変更（1ファイル）

`scripts/backfill-urc-match-events.ts`:

1. `CliOptions` に `reparseExisting: boolean` を追加。`parseOptions` で `--reparse-existing` を解釈（default false）
2. `loadTargetMatches` のフィルタ（現状）:
   ```ts
   return (data ...).filter(
     (match) =>
       match.match_events.length === 0 &&
       getWikipediaSource(match.external_ids) !== null,
   );
   ```
   を、`reparseExisting` を引数で受け取り条件分岐:
   - `reparseExisting === true` → `getWikipediaSource(match.external_ids) !== null` のみ（events 有無を問わない）
   - false → 現状維持
   `main()` から `options.reparseExisting` を `loadTargetMatches` に渡す
3. ログ `Target finished URC matches without events: N` を、reparse 時は `Target finished URC matches (reparse-existing): N` に分岐
4. 書き込みは従来どおり `--confirm-owner-approved` 必須（dry-run 既定は維持）

## テスト

- `parseOptions(["--reparse-existing"])` が `reparseExisting: true` を返す
- フラグ無しなら `reparseExisting: false`
- `loadTargetMatches` のフィルタ純化が可能なら、events>0 の行が reparse=true で含まれ false で除外されることを単体テスト（フィルタ部を純関数に切り出して可）

## 受け入れ条件（完了の定義）

- ビルド・typecheck・lint 緑、既存テスト緑
- `--reparse-existing` フラグが解釈され、対象選定が events 有無を無視する
- フラグ無しの既存挙動は不変
- （Owner 実行）`--reparse-existing --confirm-owner-approved --season=2025-26` 後に URC undercount が 79→一桁に減る

## 注意

- 本番実行は Owner（`--confirm-owner-approved`）。Codex は実装＋テストまで
- ノックアウト試合（events 0・別パーサ問題）は本タスク対象外
- マッチングは既存のチーム名照合ロジックをそのまま使う（変更しない）
