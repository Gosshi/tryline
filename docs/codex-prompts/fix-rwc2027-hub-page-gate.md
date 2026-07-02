# Codex プロンプト: RWC2027 大会ページの Coming Soon ゲート解除

仕様: `specs/fix-rwc2027-hub-page-gate.md` を参照（内容はインライン展開しない）。

## タスク

`/c/rwc/2027`（`app/c/rwc/2027/page.tsx`）が、試合データもプール順位表データも完全に揃っているのに「1件でも finished な試合がないとページ全体を Coming Soon に差し替える」条件のせいで、開幕（2027年10月）まで15ヶ月以上ずっと空の Coming Soon 表示になっている。この条件を外し、データがあれば常にプール順位表・全日程を表示するようにする。

## 変更ファイルと内容（1ファイルのみ）

`app/c/rwc/2027/page.tsx`

1. `allScheduled` による早期 return（L94-103）を削除し、代わりに `matches.length === 0` のときだけ `PendingState` を返す
2. `tournamentStarted`（`status === "finished" || "live"` のいずれかが1件でもあるか）を計算する
3. 通常のレンダリングパス内、`<header>` の直後・プール順位表セクションの前に、`tournamentStarted` が false のときだけ表示する軽量バナー `PreTournamentBanner` を新規追加する
4. 使われなくなる `ComingSoonState` 関数は削除する（`PendingState` は残す）

具体的なbefore/afterコードは spec の「実装詳細」節にそのまま記載されているので、そのとおりに適用すること。

## 受け入れ条件

- ビルド・TypeScriptエラーなし
- 試合が1件もfinishedでなくても、matchesが存在すればプール順位表（6プール×4チーム）と全36試合の日程が表示される
- `matches.length === 0` のときのみ従来通り `PendingState`
- `/c/rwc/2027/bracket` には触らない
- テストを追加または更新し、「全試合scheduled」のケースでプール順位表・日程が描画されることを検証すること

## エッジケース・注意事項

- `/c/rwc/2027/bracket`（ノックアウトブラケットページ）は対象外。触らないこと。データが無いので現状の「準備中」表示のままでよい
- `poolStandings` や `groupMatchesByRound` / `SeasonMatchGroups` のデータ取得・整形ロジック自体は変更不要（既に正しく動く）。表示条件だけを直す
- `PreTournamentBanner` の文言はspec記載のものをそのまま使ってよい（デザイン調整はOwnerが後で行う）
