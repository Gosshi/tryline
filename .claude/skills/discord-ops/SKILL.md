---
name: discord-ops
description: Discord への配信・コミュニティ運用の下書きをするときに使う。「Discord に流す文面」「Discord の運用」「公式サーバーへの返信案」と言われたら起動。notify-discord パイプラインとの関係と文面ルール。
---

# Discord 運用（下書き支援）

Discord まわりの文面作成・運用相談。**送信・投稿するのは Owner**。

## 既存の仕組み（前提）

- **自動通知**: recap 公開時の通知は `app/api/cron/notify-discord` が担う（X 自動投稿を停止した際にこちらへ一本化。`specs/fix-disable-x-auto-post.md`）。この cron の挙動変更は spec 経由で Codex へ
- **公式サーバーへの返信下書き**: `specs/fix-discord-official-reply-draft.md` の運用（大会公式・コミュニティサーバーでの返信）
- **コミュニティ構想**: Tryline 自前の Discord（growth-playbook C3、「チャットの熱量が非会員に見えない」への対策）は未着手。着手判断は Owner

## 文面ルール

- X と同じ制約: 実データのみ（捏造統計禁止）・引用15語以内・実在ロゴ画像等は使わない
- Discord はコミュニティの場。**宣伝臭を消す**: リンクを貼るなら「何がわかるか」を一言添える（`x-reply` スキルと同じ原則）
- 他人のサーバーではそのサーバーのルール（自己宣伝チャンネルの有無等）を最初に確認してから文面を作る

## 使いどころ

| 依頼 | やること |
|------|---------|
| 試合スレッドへの参加文面 | 該当試合の実データ（得点経過・H2H）で価値ある一言＋必要ならリンク |
| notify-discord の文面調整 | 現行テンプレを確認 → 変更は spec 化して Codex へ（直接編集しない） |
| 自前サーバー開設の相談 | C3 の位置づけ（I=3, E=3）と運用コストを `biz-strategy` の枠で整理 |

## 計測

Discord 経由の流入は GA4 の referral / UTM（`specs/feat-utm-attribution.md` の `ShareSource: "discord"`）で確認。
