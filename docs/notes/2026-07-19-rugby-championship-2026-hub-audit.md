# ラグビーチャンピオンシップ 2026 ハブ監査（開幕前）

2026-07-19 実施。開幕予定: 2026年8月。監査期限: 2026年7月末（hub-audit 開幕カレンダー通り）。

## 結論: フィクスチャ未取り込み — ハブページが404

- `/c/rugby-championship-2026` は実際にブラウザで確認すると **404（ページが見つかりません）**。`<title>` は正しく生成されている（`Rugby Championship 2026 順位表・日程・日本での視聴方法 | Tryline`）ため、メタデータ生成後に `notFound()` へ落ちている
- DB実測: `competitions.slug = 'rugby-championship-2026'`（id: `f72d231f-e0c8-454f-bc14-3361ba1111e7'`) に対して
  - `matches`: **0件**
  - `competition_standings`: **0件**
- 比較: `rugby-championship-2025` は `matches` 12件（正常に取り込み済み）
- `app/c/[competition]/page.tsx:97` の `if (seasons.length === 0) notFound();` で落ちていると推定（`listSeasonsByFamily` が2026シーズンを検出できていない = 試合データが1件も無いため）

## 影響

- 開幕まで残り2〜3週間の段階でハブページが完全に404。チェックリストの他項目（順位表・視聴方法・内部リンク等）は判定不能（そもそもページが存在しない）
- 過去大会（2025年12試合）が正常に入っていることから、パイプライン自体は機能する。2026シーズンのフィクスチャがまだスクレイプ/シードされていないだけと推定

## 次のアクション（Owner 判断待ち）

- フィクスチャ取り込み（スクレイパー実行 or Wikipedia等からのシード）が必要。原因調査＋spec化は別途 `prod-investigation` → `spec-writing` へ
- このメモでは実装しない（hub-audit は読み取り専用）
