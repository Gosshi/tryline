---
name: today
description: 日次・週次の状況整理。「今日のやること」「朝会」「今週の運用」「週次ルーティン」「/today」と言われたら起動。収集・整理と承認済みの作業を進め、Ownerに必要な判断だけを示す。
---

# today

共通参照: [運用方針と測定基準](../today/references/operating-baseline.md)。

最初に `docs/decisions.md` と `.claude/skills/today/references/operating-baseline.md` を確認する。weekly-opsの司令塔機能は本スキルへ統合した。

## 収集
- 現在日付、`git status --short`、mainの直近コミット、対象PRの状態、`tools/ops/codex-queue.sh` の存在と読取専用性を確認して状況を集める。
- 前回記録と最新のActions結果を照合する。マージ済みの施策は新規タスクに戻さない。情報を取得できなければ項目単位で未確認とし、他の作業を進める。
- 検出数だけでなく、影響URL・公開状態・最初と最後の検出時刻・担当・次の行動を拾う。

## 日次・週次の振り分け
| 契機 | 確認と実働先 |
|---|---|
| 日次 | データ異常はproduction-data-integrity→prod-investigation。課金異常はbilling-monitor。PRレビューはcodex-review。 |
| 週次 | 同期間のGA4ユーザー/セッションとBWT/GSCをgrowth-analysisで比較。配信済みメールをemail-delivery-qaで検品。 |
| 日本代表戦の翌日 | note A型のみをnote-weeklyで準備。B型停止、C型保留。ブリーフの不足だけを聞く。 |
| 木・金・火の調査締切前 | docs/chatgpt-prompts/README.mdの現行調査手順と事実入力の実施状況を確認する。旧ニュース収集cronを再開しない。 |
| 大会開幕前・各節終了後 | hub-auditで日程・順位・放送確認日・導線を点検する。日程は固定した古いカレンダーでなく現在の公式情報から確認する。 |
| 月次リンク保守 | X bio・noteプロフィール・pricing・サンプルのURLを確認し、古いサンプルはcontent-qaへ渡す。 |
| 月次 | RWC情報の鮮度はrwc2027、検索クエリはbing-webmaster-analysis、実ユーザー性能はperformance-rumへ。note C型を月次だからと着手しない。 |
| 2026年10月第1週 | D019のX判定。t.coユーザー数/28日とX投稿別CSV、Owner工数を揃える。方針変更はOwner判断。 |

## 出力
実施済みの収集・下書き、未確認情報、Ownerが判断する項目、次の確認日を分ける。判断項目は推奨案と根拠・対象・見積を付け最大5件（表示上の整理目安）に絞る。
承認済みの調査や下書きを「実施してよいか」と再質問しない。投稿・公開・送信・マージはその対象についての明示的な許可の範囲でのみ扱う。実装はCodexへ渡す。
