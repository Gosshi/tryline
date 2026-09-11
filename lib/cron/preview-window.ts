const PREVIEW_RELEASE_HOUR_JST = 15;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * 「JST キックオフ日の前日 15:00」に到達している試合の kickoff_at の排他的上限を ISO 文字列で返す。
 * この値より前の kickoff_at を持つ試合が、その時点で生成期限に達している。
 */
export function previewDueUpperBound(now: Date): string {
  // now を JST の壁時計に移す（UTC の getter で JST の年月日時が読める状態にする）
  const jst = new Date(now.getTime() + JST_OFFSET_MS);

  // 直近に過ぎた JST 15:00
  const todayReleaseJst = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate(),
    PREVIEW_RELEASE_HOUR_JST,
    0,
    0,
    0,
  );
  const lastReleaseJst =
    jst.getUTCHours() < PREVIEW_RELEASE_HOUR_JST
      ? todayReleaseJst - 24 * HOUR_MS
      : todayReleaseJst;

  // その 15:00 が担当する JST キックオフ日は「翌日」。翌々日 00:00 を排他的上限にする。
  return new Date(lastReleaseJst + 33 * HOUR_MS - JST_OFFSET_MS).toISOString();
}
