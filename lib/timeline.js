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
 * A stream that covers the map session only partway through can carry a start
 * offset, which YouTube takes as `&t=<seconds>s`. The offset lives in its own
 * field rather than being tacked onto the id, so the id stays a bare YouTube id
 * for `scripts/sync-vods.mjs` to match against playlist entries.
 *
 * @param {string} id - YouTube video id
 * @param {number} [t] - start offset in seconds; ignored unless positive
 * @returns {string}
 */
export function vodUrl(id, t) {
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  const start = Math.floor(Number(t));
  return Number.isFinite(start) && start > 0 ? `${url}&t=${start}s` : url;
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
 * Timeline entry kinds, in the order their counts appear in a group summary.
 *
 * A group heading reads e.g. `2022年03月 (🗓2) (<VOD icon>1)`. Adding a kind is
 * one entry here plus counting it at the call site — no signature changes — so
 * photos and chat logs can join without touching every caller.
 */
export const SUMMARY_KINDS = [
  { kind: "date", icon: () => "🗓" },
  { kind: "vod", icon: () => vodIconHtml(11, "VOD") },
];

/**
 * Build the summary innerHTML for a year or month group in the timeline.
 *
 * Kinds with a zero or missing count are left out entirely, so a month holding
 * only VODs shows only the VOD count.
 *
 * @param {{ prefix: string, counts: Object<string, number> }} group
 * @returns {string} HTML string
 */
export function groupSummaryHtml({ prefix, counts }) {
  const parts = SUMMARY_KINDS.filter(({ kind }) => counts?.[kind] > 0).map(
    ({ kind, icon }) => ` (${icon()}${counts[kind]})`
  );
  return `${prefix}${parts.join("")}`;
}

/**
 * Merge the timeline's tile dates with the other kinds of entry that sit
 * between them, into one ordered list for the panel to render.
 *
 * Tile dates are the timeline's backbone; everything else — VODs today, photos
 * and chat logs later — is placed by date against them. An entry from a stream
 * sorts ahead of the first tile date it falls on or before, and entries dated
 * after every tile date land at the end. Streams sharing a date keep the order
 * they were declared in, and each stream must already be sorted by date.
 *
 * @param {string[]} dates - tile dates, ascending
 * @param {Array<{kind: string, entries: Array<{date: string}>}>} [streams]
 * @returns {Array<{kind: string, date: string, entry?: object}>}
 */
export function buildTimelineEntries(dates, streams = []) {
  const cursors = streams.map(() => 0);
  const merged = [];

  // Emit everything from every stream that is dated on or before `limit`;
  // a null limit drains the streams completely.
  function drain(limit) {
    streams.forEach(({ kind, entries }, s) => {
      while (
        cursors[s] < entries.length &&
        (limit === null || entries[cursors[s]].date <= limit)
      ) {
        const entry = entries[cursors[s]];
        merged.push({ kind, date: entry.date, entry });
        cursors[s] += 1;
      }
    });
  }

  for (const date of dates) {
    drain(date);
    merged.push({ kind: "date", date });
  }
  drain(null);

  return merged;
}
