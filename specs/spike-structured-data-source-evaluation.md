# spike-structured-data-source-evaluation

> 種別: 調査スパイク（実装ではなく評価）。成果物は意思決定メモであり、本番コード・取り込み経路は変更しない。

## 背景

現状、ほぼ全大会のイベントデータは **Wikipedia の HTML スクレイピング**に依存している（例外: League One = league-one.jp、World Rugby JSON API = PNC/Autumn 等の WR 主催大会のみ）。

このため2つの根深い品質問題が出ている（いずれも Wikipedia HTML パースの脆さが根因）:

- **イベント欠落（undercount）**: URC 2025-26 で 138試合中 79試合、Rugby Championship 2025 でほぼ全12試合がイベント不足（最悪 SA×Arg は 97点中 40点分しか拾えていない）
- **幽霊イベント（overcount）**: `minute=null` の重複得点（[`fix-phantom-null-minute-scoring-events`](./fix-phantom-null-minute-scoring-events.md) で対処中）

得点推移・派生スタッツを差別化機能として訴求している以上、構造化フィードへの切替/補完が品質の本丸になりうる。本スパイクは「切替/補完する価値があるか」を**少量・読み取りのみ**で実測し、意思決定する。

## スコープ

対象（測るもの）:
- 候補ソースが、欠落の激しい大会（**URC / Rugby Championship**）と現行良好な大会（**SRP**）について、**分付きの得点イベント**を構造化形式で提供するか
- 提供する場合、サンプル試合でイベント合計が最終スコアと一致する精度（reconciliation 率）
- 大会カバレッジ（6N / Premiership / URC / Top14 / SRP / RC / Autumn / PNC のうちどれを賄えるか）
- ライセンス / ToS / robots の姿勢（採用可否の最重要因子）

対象外:
- 新規取り込み経路の実装（スパイク合格後の別 spec）
- 本番 DB への書き込み
- 既存 Wikipedia ソースの撤去

## 評価候補

| ソース | 想定粒度 | コスト | ToS/robots 懸念 |
|---|---|---|---|
| ESPN 非公式 JSON API（`site.api.espn.com` / `sports.core.api.espn.com`） | scoreboard＋summary で得点プレー（分付き）想定 | 無料・キー不要 | **非公式・明示ライセンス無し**。要 Owner 判断 |
| API-Sports（api-rugby） | games/standings は確実、イベント粒度は要検証 | 無料枠~100req/日、以降有料 | 公式・規約明確 |
| TheSportsDB | 結果中心、得点タイムラインは薄い想定 | 無料 | 寛容 |
| 商用（Sportradar / Stats Perform 等） | 完全・正確 | エンタープライズ（高額） | 明確だが予算外 |

## 進め方（読み取りのみ・少量）

各候補について、**1大会×2〜3試合**だけサンプル取得して比較する（同一試合の Wikipedia 版と突き合わせ）。

1. **ライセンス/ToS を先に確認**（robots.txt・利用規約・API ドキュメント）。グレーなものは「採用不可候補」として明記し、技術評価は参考に留める
2. 対象サンプル試合（既知のスコアで突き合わせやすいもの）:
   - URC 2025-26: undercount が確認されている試合（例: Connacht×Leinster 2026-01-24、スコア合計57 vs implied 37）
   - Rugby Championship 2025: South Africa×Argentina 2025-09-27（合計97 vs implied 40）
   - SRP 2026: Chiefs×Crusaders 2026-06-12（49-12、現行は +2 overcount）
3. 各ソースから当該試合の得点イベント（種別・分・チーム）を取得し、イベント合計 vs 公式スコアの一致を確認
4. 結果を比較表にまとめる

**重要**: 外部 URL への通信は Owner の明示承認下でのみ実行する（CLAUDE.md）。スパイク担当は実行前に対象 URL とリクエスト回数を提示すること。User-Agent 偽装・レート回避は行わない。

## 成果物

`docs/data-source-evaluation-2026-06.md`（意思決定メモ）:
- 候補ごとの ToS 判定（採用可 / グレー / 不可）
- サンプル試合での粒度・reconciliation 結果の比較表
- カバレッジ表（どの大会をどのソースで賄えるか）
- 推奨: 「Wikipedia 維持」/「特定大会のみ別ソースで補完（ハイブリッド）」/「全面切替」のいずれか＋根拠
- 採用する場合のフォローオン spec の概要（取り込み経路の追加範囲）

## 受け入れ条件

1. 4候補すべてについて ToS/ライセンス判定が記載されている
2. 少なくとも URC・RC・SRP の各1試合で、採用可候補のイベント取得結果が Wikipedia 版と並べて比較されている
3. 「採用可」候補が1つ以上ある場合、reconciliation 率（サンプル内でイベント合計＝スコアの割合）が数値で示されている
4. 明確な推奨（維持/ハイブリッド/切替）と次アクションが1つに絞られている

## 結論（2026-06-13 更新・スパイク事実上クローズ）

本番生HTML（`match_raw_data.payload.html`）の直接検証で、**URC/RC の undercount は「ソース欠落」ではなく「Wikipedia パーサの取りこぼし」**と確定した。`Con:`/`Pen:` の集約キッカー形式（`キッカー (made/att) 分', 分',…`）を `parseScoringCell` が落としているだけで、データは Wikipedia に完全に存在する。

→ **新ソース導入は不要。** 対処は [`fix-urc-rc-kicker-section-events`](./fix-urc-rc-kicker-section-events.md)（パーサ修正・無料・ToS クリーン）。

外部ソースの位置づけ（参考、break-glass 用）:
- **ESPN 非公式 API**: 分付き得点イベントを持つ唯一の無料候補だが ToS グレー（商用再配信）。Wikipedia に本当にデータが無い大会が出た場合のみ Owner 判断で検討
- **API-Sports / TheSportsDB**: イベント粒度不足で不適
- **Sportradar 等商用**: 完全だが予算外

## 決定事項・前提

- 本スパイクは **SRP 決勝の X 施策（6/27）には不要**。決勝は現行 Wikipedia で preview/recap が出ており、本スパイクの結論を待たない
- 系統2（データ品質の本丸）は外部ソースでなく **parser 修正**で進める（上記結論）。本スパイク spec は「外部ソース＝break-glass のみ」の記録として残す

## 未解決の質問

1. ESPN 非公式 API の ToS グレーをどこまで許容するか（responsible-builder 方針との整合）。不可とするなら API-Sports 有料枠の費用対効果を別途見積もるか
2. ハイブリッド採用時、大会ごとにソースを切り替える複雑さを許容するか（取り込み経路の保守コスト増）
