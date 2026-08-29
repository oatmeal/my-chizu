/**
 * Pure logic for the screenshot photo layer.
 *
 * Photos are located, dated screenshots pinned where they were taken. They ride
 * the timeline the tiles already ride -- the same three modes mean the same
 * three things about a photo as about a tile -- and they cluster, because the
 * set is severely concentrated: 40% of them sit in one 500-block cell and the
 * default view stacks over a hundred pins on the main base.
 *
 * Everything here is free of Leaflet and of the DOM; `setupPhotos.js` does the
 * drawing.
 */

/**
 * Which photos to show for a timeline date, and which to dim.
 *
 * The modes are the tile modes, and they are chosen to mean the same thing:
 *
 *   "e" (exact)  - only photos taken on the selected date
 *   "b" (before) - every photo up to and including it
 *   "f" (fill)   - photos from any date, dimmed if they postdate the selection
 *
 * Scrubbing backward empties the map of photos that had not been taken yet, so
 * the world visibly fills with memories as you move forward. No new control and
 * no new mental model -- which is the whole reason not to invent a filter of
 * its own.
 *
 * @param {Array<{date: string}>} photos
 * @param {string} date - the selected date, YYYYMMDD
 * @param {"e"|"f"|"b"} mode
 * @returns {Array<{photo: object, dimmed: boolean}>}
 */
export function selectPhotos(photos, date, mode) {
  const out = [];
  for (const photo of photos) {
    if (mode === "e") {
      if (photo.date === date) out.push({ photo, dimmed: false });
    } else if (mode === "f") {
      out.push({ photo, dimmed: photo.date > date });
    } else if (photo.date <= date) {
      out.push({ photo, dimmed: false });
    }
  }
  return out;
}

/**
 * The timeline mode letter for a timeline state, matching `getTileReplacements`.
 *
 * @param {{exact: boolean, fill: boolean}} timeline
 * @returns {"e"|"f"|"b"}
 */
export function timelineMode({ exact, fill }) {
  return exact ? "e" : fill ? "f" : "b";
}

/**
 * Group photos into clusters by screen position.
 *
 * Clustering is in **screen pixels at the current zoom**, not in world
 * coordinates. World-coordinate cells are stable and cacheable, but they look
 * wrong at both ends: a cell that separates two builds when zoomed in merges
 * half the map when zoomed out. Pixels are what the eye is actually judging, so
 * a fixed pixel cell gives one consistent density at every zoom, and the
 * clusters break apart as you zoom in without any per-zoom tuning.
 *
 * Each photo carries an [x, y] already projected to screen pixels. The
 * representative is the newest photo in the cell, so a cluster shows the most
 * recent thing that happened there.
 *
 * @param {Array<{photo: {date: string}, x: number, y: number, dimmed: boolean}>} placed
 * @param {number} cellSize - cluster cell edge in pixels
 * @returns {Array<{photos: object[], x: number, y: number, lead: object,
 *                  count: number, dimmed: boolean}>}
 */
export function clusterPhotos(placed, cellSize) {
  const cells = new Map();
  for (const item of placed) {
    const key = `${Math.floor(item.x / cellSize)},${Math.floor(item.y / cellSize)}`;
    const cell = cells.get(key);
    if (cell) cell.push(item);
    else cells.set(key, [item]);
  }

  const clusters = [];
  for (const items of cells.values()) {
    // Newest first, so the lead photo is the most recent one taken here. Ties
    // fall back to the file stem, which keeps the choice stable across renders.
    const sorted = items.slice().sort((a, b) =>
      a.photo.date === b.photo.date
        ? a.photo.f < b.photo.f
          ? 1
          : -1
        : a.photo.date < b.photo.date
        ? 1
        : -1
    );
    const lead = sorted[0];
    clusters.push({
      photos: sorted.map((i) => i.photo),
      // Anchor on the lead photo rather than the cell's centroid: the pin then
      // sits where a real photo was taken instead of in the average of a bay.
      x: lead.x,
      y: lead.y,
      lead: lead.photo,
      count: sorted.length,
      // A cluster is dim only when everything in it is.
      dimmed: sorted.every((i) => i.dimmed),
    });
  }
  // Southernmost last, so nearer pins paint over farther ones.
  clusters.sort((a, b) => a.y - b.y);
  return clusters;
}

/**
 * Resolve a photo's image URLs.
 *
 * The two bases come from the data repo's `site.json` and are relative by
 * default. If the set ever outgrows the repo, pointing them at another origin
 * is a config edit and a file move: a plain `<img>` loads cross-origin without
 * CORS, so no code changes with it.
 *
 * @param {{f: string}} photo
 * @param {{baseUrl: string, thumbUrl: string}} config
 * @returns {{full: string, thumb: string}}
 */
export function photoUrls(photo, { baseUrl, thumbUrl }) {
  return {
    full: `${baseUrl}${photo.f}.webp`,
    thumb: `${thumbUrl}${photo.f}.webp`,
  };
}

/**
 * The caption under a photo in the lightbox.
 *
 * Reads as: an optional hand-written title, the date, the time when the taskbar
 * clock gave one, and the position a player would type. Coordinates are quoted
 * dimension-native, exactly as marker popups quote them.
 *
 * @param {{title?: string, date: string, time?: string, pos: number[]}} photo
 * @param {(date: string) => string} formatDate
 * @returns {string}
 */
export function photoCaption(photo, formatDate) {
  const [x, y, z] = photo.pos;
  const when = photo.time ? `${formatDate(photo.date)} ${photo.time}` : formatDate(photo.date);
  const where = y === null || y === undefined
    ? `[X=${x}, Z=${z}]`
    : `[X=${x}, Y=${y}, Z=${z}]`;
  return [photo.title, when, where].filter(Boolean).join(" ・ ");
}

/**
 * Count photos per date, as an ordered timeline stream.
 *
 * The timeline merges *dates*, not photos: forty screenshots from one session
 * are one row saying so, not forty rows. Sorted ascending because
 * `buildTimelineEntries` requires each stream to be.
 *
 * @param {Array<{date: string}>} photos
 * @returns {Array<{date: string, photos: object[]}>}
 */
export function photoDates(photos) {
  const byDate = new Map();
  for (const photo of photos) {
    const group = byDate.get(photo.date);
    if (group) group.push(photo);
    else byDate.set(photo.date, [photo]);
  }
  return [...byDate.keys()]
    .sort()
    .map((date) => ({ date, photos: byDate.get(date) }));
}

/**
 * The tile date to show the terrain at, for a photo taken on `date`.
 *
 * Most photo dates have no tiles at all -- most of the raw folders are
 * screenshots with no map in them -- so a photo row cannot select a tile date
 * of its own. The nearest *earlier* tile date is what "what did this place look
 * like when the photo was taken" actually means; falling forward to the
 * earliest available date is only for a photo that predates the whole map.
 *
 * @param {string[]} dates - tile dates, ascending
 * @param {string} date
 * @returns {string|undefined}
 */
export function terrainDateFor(dates, date) {
  let best;
  for (const candidate of dates) {
    if (candidate <= date) best = candidate;
    else break;
  }
  return best ?? dates[0];
}
