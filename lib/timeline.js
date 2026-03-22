/**
 * Format a YYYYMMDD date string for display.
 * Uses a lookup table of display names; falls back to Japanese date format.
 *
 * @param {string} date - YYYYMMDD date string (may have a suffix, e.g. "20211114-1")
 * @param {Object<string, string>} displayNames - map of date strings to display names
 * @returns {string}
 */
export function formatDate(date, displayNames) {
  return (
    displayNames[date] ||
    `${date.slice(0, 4)}年${date.slice(4, 6)}月${date.slice(6)}日`
  );
}

/**
 * Build the summary innerHTML for a year or month group in the timeline.
 *
 * @param {{ prefix: string, dates: number, vods: number }} group
 * @returns {string} HTML string
 */
export function groupSummaryHtml(group) {
  const datePart =
    group.dates > 0 ? ` (🗓${group.dates})` : "";
  const vodPart =
    group.vods > 0
      ? ` (<img src="TwitchGlitchPurple.svg" height="14">${group.vods})`
      : "";
  return `${group.prefix}${datePart}${vodPart}`;
}
