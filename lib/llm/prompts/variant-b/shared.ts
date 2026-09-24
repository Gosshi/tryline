import { hasConfirmedSourcedFactLineup } from "@/lib/content/fabrication-guard";
import { sanitizeUnconfirmedProjectedLineups, hasConfirmedProjectedLineups } from "@/lib/llm/lineups";
import {
  buildStandingsBlock,
  buildSignalsBlock,
  KICKOFF_TIMEZONE_INSTRUCTION,
  MATCH_DURATION_INSTRUCTION,
  NON_LEAGUE_ONE_PLAYER_NAME_STYLE_INSTRUCTION,
} from "@/lib/llm/prompts/shared-prompt-blocks";

import type { AdditionalSignal, AssembledContentInput, ContentType, TacticalPoint } from "@/lib/llm/types";

export const COMMON_B_PROMPT = `あなたはTrylineの日本語編集担当です。渡された試合の根拠から、読者が試合を見る・振り返る際に役立つ、一つの問いと一つの発見をまとめます。現地取材、映像確認、関係者への取材を行ったように書かないでください。

優先順位は、事実と人物の裏付け、引用・権利の制約、記事構成、文体の順です。字数や見栄えのために上位の条件を破ってはいけません。

【使える根拠】
・この指示に続けて渡される試合データ、sourced_facts、派生スタッツ、チームスタッツ、順位表、戦術ポイントだけを使います。あなたが事前に知っている選手の経歴・所属・役割・統計は使いません。
・戦術ポイントは論点の候補です。元の事実で確認できない主張は採用しません。
・数値には対象チーム・選手、指標、期間を対応させます。欠損値を0と扱いません。反則数のデータがないチームについて、反則の多い少ないや規律を断定しません。
・直近の収録試合の結果を、今季全体や同一大会の成績と読み替えません。
・PG成功数は反則数ではありません。キックは成功本数だけを書き、試投数・成功率・分数表記は使いません。
・時系列や数値の差だけでは、原因、戦術の仕組み、心理、能力は証明できません。記録上の変化は説明できますが、原因には原因を支える観測が必要です。
・日時と順位は対象時点を確認します。試合後の情報を試合前の事情にしません。

【人物と引用】
・人名は、確定メンバー、得点イベント、sourced_factsに出てくる人物だけを使います。表記辞書への掲載だけでは使用許可になりません。
・欠場報道は欠場の根拠であり、出場や他選手の先発を推定する根拠ではありません。
・人名の人数ノルマはありません。根拠のない役割・評価・発言を付けません。
・生テキストの転載はせず自分の日本語で説明します。直接引用は原則避け、必要な場合も15語以内、同一ソースから複数回引用しません。自分の要約を選手や監督の発言のように見せてはいけません。

【編集】
・事実を列挙するだけで終えず、「この対比から何が分かるか」を一段だけ説明します。例えば得点区間の違いは説明できますが、それだけで守備崩壊とは呼べません。
・一つの事実を別の節で再掲する場合は、新しい比較に不可欠な最小限にします。
・答えられない原因、次戦相手、来季の見通しを埋めません。
・材料の不足を本文で説明せず、根拠のある論点に絞ります。それでも字数に届かない場合は、創作や反復で埋めません。
・段落は、どの試合にも当てはまる枠組み（得点力の比較、スコアの形容、「AとBの対決は」、「一発勝負」）ではなく、この試合だけの瞬間・決定・文脈から書き始めます。
・最初の見出し直後は通常の段落です。箇条書きや引用ブロックだけにしません。
・指定された節を「# 」の見出しで出力し、別の記事タイトルを先頭に追加しません。強調記号やコードブロックは本文に使いません。`;

export function buildVariantBDataBlocks(options: {
  assembled: AssembledContentInput;
  tacticalPoints: TacticalPoint[];
  contentType: ContentType;
  additionalSignals: AdditionalSignal[];
}): string[] {
  const { assembled, contentType, tacticalPoints, additionalSignals } = options;
  const standingsBlock = buildStandingsBlock(
    assembled.competition_standings,
    contentType,
    assembled.standings_freshness,
  );
  const sanitizedAssembled = sanitizeUnconfirmedProjectedLineups({
    ...assembled,
    competition_standings: standingsBlock ? assembled.competition_standings : [],
  });
  const glossary = assembled.japanese_name_glossary ?? [];
  const glossaryBlock = glossary.length === 0
    ? ""
    : [
        "【日本語表記グロッサリ】チーム名・大会名・選手名は以下の日本語表記を必ず使うこと。source の英語表記は本文に出さないこと。",
        JSON.stringify(glossary),
      ].join("\n");
  const nameStyle = assembled.match.competition?.family === "league-one"
    ? "選手名は日本語表記を使用すること。外国人選手は英語の人名をカタカナに変換し、姓名の間に中点（・）を入れること。チーム名は日本語または通称表記を使用すること。"
    : NON_LEAGUE_ONE_PLAYER_NAME_STYLE_INSTRUCTION;
  const hasPlayers = hasConfirmedProjectedLineups(assembled.projected_lineups)
    || hasConfirmedSourcedFactLineup(assembled.sourced_facts)
    || assembled.match_events.length > 0;
  const playerRule = hasPlayers
    ? "選手名は入力データ（確定projected_lineups・match_events・sourced_facts）に含まれるものだけを使い、未確定ラインアップの選手名は使いません。"
    : "選手名は確定メンバー・match_events・sourced_factsにあるものだけを使います。該当する人物がいない場合は人物名に触れません。";
  const sourceFactsBlock = assembled.sourced_facts.length === 0
    ? "出典付きの事実: なし。外部記事や事前知識の負傷・欠場・統計・発言は使わない。"
    : [
        "出典付きの事実（自分の日本語で言い換えて使う。使うかどうかは本文の問いに沿うかで決める）:",
        JSON.stringify(assembled.sourced_facts),
      ].join("\n");
  const signals = buildSignalsBlock(additionalSignals);
  const blocks = [
    COMMON_B_PROMPT,
    KICKOFF_TIMEZONE_INSTRUCTION,
    MATCH_DURATION_INSTRUCTION,
    playerRule,
    glossaryBlock,
    nameStyle,
    `試合データ: ${JSON.stringify(sanitizedAssembled)}`,
    contentType === "preview" ? "" : buildRecapDataBlocks(assembled),
    standingsBlock
      ? `大会順位表（この試合の対象時点のもの）:\n${JSON.stringify(assembled.competition_standings)}`
      : "",
    sourceFactsBlock,
    `戦術ポイント（論点の候補。元の事実で確認できる範囲で使う）:\n${JSON.stringify(tacticalPoints)}`,
    signals,
  ];
  return blocks.filter(Boolean);
}

function buildRecapDataBlocks(assembled: AssembledContentInput): string {
  if (assembled.match_events.length === 0) {
    throw new Error("B recap prompts require at least one match event");
  }
  const timeline = assembled.score_timeline;
  const values: string[] = [];
  if (timeline) {
    const home = assembled.match.home_team?.name ?? "ホーム";
    const away = assembled.match.away_team?.name ?? "アウェー";
    values.push(
      `- 前半終了時スコア: ${home} ${timeline.ht_home} — ${away} ${timeline.ht_away}`,
      "- 全得点時点の累計スコア: 本文で使うスコアはこの表の値をそのまま使い、自分で加算しないこと。",
      `- 表記順は常にホーム — アウェー（ホーム: ${home}、アウェー: ${away}）:`,
      ...timeline.score_progression.map((score) => {
        const team = score.team === "home" ? home : away;
        const player = score.player ? ` ${score.player}` : "";
        return `  - ${score.minute}分: ${team}${player}（${score.type}）→ ${home} ${score.home} — ${away} ${score.away}`;
      }),
    );
    values.push(timeline.lead_changes.length === 0
      ? "- リード変化: なし（一方が終始リード）"
      : `- リード変化: ${timeline.lead_changes.map((change) => `${change.minute}分: ${change.new_leader === "home" ? home : change.new_leader === "away" ? away : "同点"} ${change.home}—${change.away}`).join(" → ")}`);
    if (timeline.winning_score) {
      const winner = timeline.winning_score.team === "home" ? home : away;
      values.push(`- 勝利を決めた得点: ${timeline.winning_score.minute}分 ${winner} ${timeline.winning_score.player}（${timeline.winning_score.type}）`);
    }
  }
  return [
    `得点イベント（得点者・種別・時刻の根拠）:\n${JSON.stringify(assembled.match_events)}`,
    ...(values.length ? [`スコア推移サマリー（スコアを書くときの根拠）:\n${values.join("\n")}`] : []),
    ...(assembled.derived_stats ? [`派生スタッツ（得点イベントから機械的に算出した値）:\n${JSON.stringify(assembled.derived_stats)}`] : []),
    ...(assembled.team_stats ? [`チームスタッツ（公式の試合統計。キーが無い項目には触れない。値が0と明示されている場合だけ0と書ける）:\n${JSON.stringify(assembled.team_stats)}`] : []),
  ].join("\n\n");
}

export function buildMatchPhaseFacts(assembled: AssembledContentInput): string {
  const phase = assembled.match_phase;
  const competition = [assembled.match.competition?.name, assembled.match.competition?.season]
    .filter(Boolean)
    .join(" ");
  if (phase === "playoff_final") return `この試合は${competition}の決勝戦です。勝者がチャンピオンとなります。`;
  if (phase === "playoff_semifinal") return "この試合はプレーオフ準決勝です。";
  if (phase === "playoff_third_place") return "この試合は3位決定戦です。決勝ではありません。3位（ブロンズ）を懸けた試合で、「決勝」「チャンピオン」「優勝」「タイトル」という表現を使いません。";
  if (phase === "playoff_other") return "この試合はプレーオフ戦です。";
  return "";
}
