export const UNSUPPORTED_STATISTIC_ISSUE =
  "データに存在しない統計値を含む";

const UNSUPPORTED_STATISTIC_PATTERN =
  /\d+\s*%|成功率|テリトリー|支配率|ポゼッション|ランメートル|ラインブレイク|獲得率|スティール率|22m進入/;

export function containsUnsupportedStatistic(text: string): boolean {
  return UNSUPPORTED_STATISTIC_PATTERN.test(text);
}