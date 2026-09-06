/**
 * Detects supplied facts that contain team-level match statistics.
 *
 * This module deliberately has no data-access or LLM dependencies so both the
 * sourced-facts fetch retry and QA prompt construction use the same criterion.
 */
export const STATISTICAL_FACT_PATTERN =
  /\d+(?:\.\d+)?\s*%|\b(?!penalt\w*\s+(?:try|tries|goal|goals)\b)penalt\w*\b|\b(?:tackles?|possession|territory|turnovers?|lineouts?|scrums?|carries|metres?|meters?)\b|(?=[^\n]*(?:ポゼッション|テリトリー|タックル|ラインアウト|スクラム|ターンオーバー|キャリー|ゲイン|反則))(?=[^\n]*(?:\d+(?:\.\d+)?\s*(?:%|回|本)|\d+\s*(?:\/|対)\s*\d+))/i;

export function containsStatisticalFact(fact: string): boolean {
  return STATISTICAL_FACT_PATTERN.test(fact);
}
