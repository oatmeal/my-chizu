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

/** Provider icon for VOD links, in the deployed static assets. */
export const VOD_ICON = "youtube.svg";

/**
 * Watch URL for a VOD entry's video id.
 *
 * @param {string} id - YouTube video id
 * @returns {string}
 */
export function vodUrl(id) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

/**
 * <img> tag for the VOD provider icon.
 *
 * Only the height is set: the mark is landscape, so the width follows from the
 * SVG's own aspect ratio rather than being pinned to a square.
 *
 * @param {number} height - rendered height in px
 * @param {string} [alt] - empty for a decorative icon sitting next to its label
 * @returns {string} HTML string
 */
export function vodIconHtml(height, alt = "") {
  return `<img src="${VOD_ICON}" height="${height}" alt="${alt}">`;
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
    group.vods > 0 ? ` (${vodIconHtml(11, "VOD")}${group.vods})` : "";
  return `${group.prefix}${datePart}${vodPart}`;
}
