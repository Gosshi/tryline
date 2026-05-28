import type { AssembledContentInput } from "@/lib/llm/types";

export const PROMPT_VERSION = "extract@2.3.0";

export function buildExtractTacticalPointsPrompt(
  input: AssembledContentInput,
): string {
  return [
    [
      "あなたはラグビー戦術アナリストです。入力データだけを根拠に、試合の勝敗を左右する戦術的次元を特定してください。",
      "出力件数の目安:",
      "- ラインアップ + イベント + 順位表がすべて揃っている: 4〜5件",
      "- ラインアップまたはイベントのどちらかがある: 3件",
      "- スコアのみでデータが乏しい: 2件",
      "- 根拠のある戦術次元がなければ2件でも可。でたらめに埋めないこと。",
    ].join("\n"),
    [
      "出力はJSONのみ。スキーマ:",
      JSON.stringify({
        tactical_points: [
          {
            tactical_dimension:
              "string — 戦術次元の名称 (例: 得点力の対比)",
            home_situation:
              "string — key_statsに実在する数値、またはmatch_events/recent_formから導ける事実のみ（60字以内）",
            away_situation:
              "string — key_statsに実在する数値、またはmatch_events/recent_formから導ける事実のみ（60字以内）",
            matchup_implication:
              "string — この対比が今試合に何をもたらすか（80字以内、具体的に）",
            match_impact: "high | medium | low",
          },
        ],
      }),
    ].join("\n"),
    [
      "【match_impact 判断基準】",
      "high = 大会優勝・降格・プレーオフ進出がこの試合の結果に直接かかっている、または両チームの勝率・得失点差が統計的に拮抗（10%以内）している",
      "medium = 順位に影響するが決定的ではない（プール戦中盤など）",
      "low = 大会結果への影響が軽微（消化試合・大差が開いているグループ戦など）",
    ].join("\n"),
    [
      "【禁止事項】",
      "- 「好調」「重要な局面」「鍵となります」等の一般論は一切禁止",
      "- 数値根拠のない状態描写（「最近調子が良い」等）は禁止",
      "- home_situation / away_situation は key_stats に実在する数値、または match_events / recent_form から導ける事実のみ",
      "- 入力データに存在しない指標（成功率、テリトリー%、ランメートル、ラインブレイク数、ポゼッション%、22m進入回数、獲得率、スティール率等）を数値で記述してはならない。これらは入力に含まれないため創作は禁止。",
      "- 強調記号（**、*）は使用禁止",
      "- 選手名・チーム名は英語表記のまま（カタカナ変換しない）",
      "- 直接引用は15語以内",
    ].join("\n"),
    [
      "【戦術次元の例 — これ以外でも構わない】",
      "- 得点力の対比（key_stats.avg_points_for_last_5 / avg_score_diff_last_5）",
      "- 直近フォーム（recent_form の連勝・連敗、key_stats.win_rate_last_5）",
      "- 規律と反則傾向（key_stats.match.penalty_count）",
      "- 試合運び（score_timeline.lead_changes / key_stats.match.late_scoring）",
      "- 対戦相性（h2h_last_5 の直近対戦スコア）",
      "- 順位・大会文脈（competition_standings の順位・勝ち点差）",
    ].join("\n"),
    `入力JSON: ${JSON.stringify(input)}`,
  ].join("\n\n");
}