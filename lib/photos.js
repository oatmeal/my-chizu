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
 * Order the photos of a cluster, newest first.
 *
 * Ties fall back to the file stem, which keeps the order stable across renders
 * however the input happened to be ordered.
 */
function byNewest(a, b) {
  if (a.photo.date !== b.photo.date) return a.photo.date < b.photo.date ? 1 : -1;
  return a.photo.f < b.photo.f ? 1 : -1;
}

/**
 * The photo a group of placed photos should show.
 *
 * The newest one, **preferring one that is not dimmed**. That preference is
 * what stops a mixed cluster from lying: in fill mode a cluster holding photos
 * from before and after the selected date used to render its newest photo,
 * which is a future one, at full brightness -- so a photo the timeline had
 * decided did not exist yet looked exactly like one that did. Leading with the
 * newest photo that *does* exist means the image on the pin is always a photo
 * you have scrubbed far enough forward to have taken.
 *
 * @param {Array<{photo: {date: string, f: string}, dimmed: boolean}>} items
 * @returns {{photo: object, x: number, y: number, dimmed: boolean}}
 */
function leadOf(items) {
  const sorted = items.slice().sort(byNewest);
  return sorted.find((i) => !i.dimmed) ?? sorted[0];
}

/**
 * Who took the photos of a cluster, and how many each, for the pin's accent.
 *
 * **Only the photos the timeline says exist**, where any of them do. A pin
 * already refuses to wear a future photo (`leadOf`) and already splits its
 * count rather than folding the future in (`3+2`); an accent bar drawn over the
 * whole stack would be the one part of the pin still claiming otherwise. A
 * wholly future cluster falls back to all of them, because a bar of nothing is
 * not an improvement on a bar that is dimmed along with the pin.
 *
 * Ordered by id, not by count, so one author's segment is in the same place on
 * every pin and the bar can be read across the map rather than pin by pin.
 *
 * @param {Array<{photo: {by?: number}, dimmed: boolean}>} items
 * @returns {Array<{by: number, count: number}>}
 */
function authorSplit(items) {
  const present = items.filter((i) => !i.dimmed);
  const counts = new Map();
  for (const { photo } of present.length ? present : items) {
    if (photo.by === undefined || photo.by === null) continue;
    counts.set(photo.by, (counts.get(photo.by) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([by, count]) => ({ by, count }))
    .sort((a, b) => a.by - b.by);
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
 * A grid on its own is not enough, though, and this is what the first version
 * got wrong. Because a pin is anchored on a real photo's position rather than
 * on the cell centre, two leads either side of a cell edge can be a pixel
 * apart, so cell size bounded the *average* density and nothing bounded the
 * overlap. The sweep below fixes that: cells are visited in a fixed order and a
 * cell joins a neighbouring cluster whose anchor is nearer than one cell, which
 * makes `cellSize` a real minimum separation between rendered pins.
 *
 * Only the eight neighbouring cells need checking, because an anchor two cells
 * away is a full cell width away by construction. Clustering therefore still
 * depends on zoom but *not* on pan, so panning costs nothing.
 *
 * Each photo carries an [x, y] already projected to screen pixels.
 *
 * @param {Array<{photo: {date: string}, x: number, y: number, dimmed: boolean}>} placed
 * @param {number} cellSize - cluster cell edge, and minimum pin separation, in pixels
 * @returns {Array<{photos: object[], x: number, y: number, lead: object,
 *                  leadIndex: number, count: number, dimCount: number,
 *                  authors: Array<{by: number, count: number}>,
 *                  dimmed: boolean}>}
 */
export function clusterPhotos(placed, cellSize) {
  const cells = new Map();
  for (const item of placed) {
    const cx = Math.floor(item.x / cellSize);
    const cy = Math.floor(item.y / cellSize);
    const key = `${cx},${cy}`;
    let cell = cells.get(key);
    if (!cell) cells.set(key, (cell = { cx, cy, items: [] }));
    cell.items.push(item);
  }

  // North to south, then west to east: a fixed sweep order is what makes the
  // merging below deterministic, and it also means the pin of a merged cluster
  // sits on its northernmost cell -- consistently, rather than wherever the
  // input order happened to put it.
  const order = [...cells.values()].sort((a, b) => a.cy - b.cy || a.cx - b.cx);

  // Which cluster occupies a cell. A cell absorbed into a neighbour points at
  // that neighbour, so a run of near-touching cells collapses into one pin
  // instead of into a chain of pairs.
  const owner = new Map();
  const built = [];
  for (const cell of order) {
    const anchor = leadOf(cell.items);
    let host;
    for (let dy = -1; dy <= 1 && !host; dy++) {
      for (let dx = -1; dx <= 1 && !host; dx++) {
        const near = owner.get(`${cell.cx + dx},${cell.cy + dy}`);
        if (!near) continue;
        const gap = Math.hypot(near.x - anchor.x, near.y - anchor.y);
        if (gap < cellSize) host = near;
      }
    }
    if (host) {
      host.items.push(...cell.items);
      owner.set(`${cell.cx},${cell.cy}`, host);
    } else {
      // The anchor is the pin's position: a real photo's spot, so the pin sits
      // where somebody stood rather than in the average of a bay.
      const cluster = { items: [...cell.items], x: anchor.x, y: anchor.y };
      owner.set(`${cell.cx},${cell.cy}`, cluster);
      built.push(cluster);
    }
  }

  const clusters = built.map(({ items, x, y }) => {
    const sorted = items.slice().sort(byNewest);
    const lead = leadOf(sorted);
    return {
      photos: sorted.map((i) => i.photo),
      x,
      y,
      lead: lead.photo,
      // The lightbox opens on the photo the pin was showing, not on whatever
      // sorted first, so clicking a pin gives you the image you clicked.
      leadIndex: sorted.indexOf(lead),
      count: sorted.length,
      // How many of them the timeline says had not been taken yet. The pin
      // shows the split rather than folding it away, because a cluster that is
      // half future is the case the old all-or-nothing dimming misreported.
      dimCount: sorted.filter((i) => i.dimmed).length,
      // And whose they are, which the pin draws as a bar along its foot. A
      // stack is the one place the thumbnail cannot answer this: it wears one
      // photo and stands for a hundred.
      authors: authorSplit(sorted),
      dimmed: lead.dimmed,
    };
  });
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
 * Colours for the author accents, indexed by contributor id.
 *
 * **By id, not by position in the registry.** A layer only lists the authors it
 * credits -- `data/end/photos.json` names two people where the overworld names
 * three -- so colouring by position would give one person two colours depending
 * on which dimension you were looking at, which is precisely the question the
 * accent exists to answer.
 *
 * The hues avoid the two the pins already spend: `#ffd54a`, the hover and
 * highlight yellow, and `#d33`, the count badge. They are read against a white
 * pin border over Minecraft map colours, which are mostly greens, browns and
 * greys.
 */
const AUTHOR_COLORS = [
  "#4d9de0", "#e05d9e", "#43c59e", "#9d6ee0", "#e0873d", "#5fc44a",
];

/**
 * The display name for a photo's author, or nothing.
 *
 * `by` is an id and the names live in the layer file's `authors` block, so an
 * id with no entry renders **no credit at all** rather than a number. That is
 * the honest answer: a photo whose author cannot be named is not a photo by
 * somebody called "3".
 *
 * @param {Object<string, {name: string}>} [authors]
 * @param {number} [by]
 * @returns {string|undefined}
 */
export function authorName(authors, by) {
  return authors?.[by]?.name;
}

/**
 * The accent colour for an author, or nothing when there is no one to tell
 * apart.
 *
 * A single-author set gets **no colour anywhere** -- a data repo whose photos
 * are all one person's should look exactly as it did before this existed, and
 * an accent that is always the same accent is just noise. So the whole scheme
 * switches itself on with the second contributor.
 *
 * @param {Object<string, {name: string}>} [authors]
 * @param {number} [by]
 * @returns {string|undefined}
 */
export function authorColor(authors, by) {
  if (!authors || Object.keys(authors).length < 2 || !authors[by]) return undefined;
  return AUTHOR_COLORS[(by - 1) % AUTHOR_COLORS.length];
}

/**
 * The authors of a set of photos, with a count each: the photos pane's filter.
 *
 * Counts exactly what it is handed, and the pane hands it two different things
 * on every refresh -- the whole dimension, for which chips exist and in what
 * order, and what is on screen, for what each chip says. Keeping the two apart
 * is what lets the numbers follow the view (as the sentence beneath them does)
 * while the chips stay where the cursor left them.
 *
 * Ordered by count, largest first, because that is the order somebody scanning
 * for a name wants; ties fall back to the id so it is stable.
 *
 * An author with no photos in the set is simply absent -- it is a count of
 * these photos, not a roster. The pane draws its chips from the roster pass and
 * reads a missing id as zero.
 *
 * @param {Array<{by?: number}>} photos
 * @param {Object<string, {name: string}>} [authors]
 * @returns {Array<{id: number, name: string, count: number, color: string|undefined}>}
 */
export function authorCounts(photos, authors) {
  const counts = new Map();
  for (const photo of photos) {
    if (authorName(authors, photo.by) === undefined) continue;
    counts.set(photo.by, (counts.get(photo.by) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      name: authorName(authors, id),
      count,
      color: authorColor(authors, id),
    }))
    .sort((a, b) => b.count - a.count || a.id - b.id);
}

/**
 * Narrow a timeline selection to a set of authors.
 *
 * Separate from `selectPhotos` rather than another argument to it, because the
 * two answer different questions and only one of them is about time. Chaining
 * them keeps `selectPhotos` the single account of what the timeline modes mean.
 *
 * `allowed` being null is "everybody", which is not the same as the empty set:
 * unticking every author shows nothing, and it should, or the filter would
 * silently disagree with its own checkboxes.
 *
 * @param {Array<{photo: {by?: number}}>} items
 * @param {Set<number>|null} [allowed]
 */
export function filterByAuthor(items, allowed) {
  if (!allowed) return items;
  return items.filter((item) => allowed.has(item.photo.by));
}

/**
 * The caption under a photo in the lightbox.
 *
 * Reads as: an optional hand-written title, who took it, the date, the time
 * when the taskbar clock gave one, and the position a player would type.
 * Coordinates are quoted dimension-native, exactly as marker popups quote them.
 *
 * The credit is on **every** photo including the site owner's own. `by` is
 * stamped on every published entry for the same reason: an explicit rule reads
 * better than an unwritten default, and a map that credits other people only
 * when it is not the owner's is a map that quietly claims the rest.
 *
 * @param {{title?: string, date: string, time?: string, pos: number[], by?: number}} photo
 * @param {(date: string) => string} formatDate
 * @param {Object<string, {name: string}>} [authors]
 * @returns {string}
 */
export function photoCaption(photo, formatDate, authors) {
  const [x, y, z] = photo.pos;
  const when = photo.time ? `${formatDate(photo.date)} ${photo.time}` : formatDate(photo.date);
  const where = y === null || y === undefined
    ? `[X=${x}, Z=${z}]`
    : `[X=${x}, Y=${y}, Z=${z}]`;
  const name = authorName(authors, photo.by);
  const credit = name && `撮影: ${name}`;
  return [photo.title, credit, when, where].filter(Boolean).join(" ・ ");
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
