/**
 * Select which tile date to display for a given tile, based on the
 * available dates for that tile, the user-selected target date, and the
 * display mode.
 *
 * Modes:
 *   "e" (exact)  – only show the tile if it exists on exactly targetDate
 *   "f" (fill)   – show the latest tile ≤ targetDate; if none, use the
 *                   earliest available (fills gaps with future tiles)
 *   "b" (before) – show the latest tile ≤ targetDate; undefined if none
 *
 * @param {string[]} tileDates - sorted ascending array of YYYYMMDD date
 *   strings available for this tile
 * @param {string} targetDate - the currently selected date (YYYYMMDD)
 * @param {"e"|"f"|"b"} mode
 * @returns {string|false|undefined} the date string to use, or
 *   false/undefined when no tile should be shown
 */
export function selectTileDate(tileDates, targetDate, mode) {
  if (mode === "e") {
    return tileDates.includes(targetDate) && targetDate;
  }
  if (mode === "f") {
    return tileDates.find(
      (_e, i, t) => i === t.length - 1 || t[i + 1] > targetDate
    );
  }
  // mode === "b"
  return tileDates.find(
    (e, i, t) =>
      e <= targetDate && (i === t.length - 1 || t[i + 1] > targetDate)
  );
}
