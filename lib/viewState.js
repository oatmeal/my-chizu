/**
 * Pure functions for resolving the initial view state when switching dimensions.
 *
 * Priority: dimData.startX/Z/Zoom (programmatic override) → hash value → default.
 */

/**
 * Resolve a single start coordinate (X or Z) from dimData and hash.
 *
 * @param {number|undefined} startVal  - dimData.startX or dimData.startZ
 * @param {*} hashVal                  - hashDimData.c.X or hashDimData.c.Z
 * @param {number} defaultVal          - dimData.defaultX or dimData.defaultZ
 * @returns {number}
 */
function resolveCoord(startVal, hashVal, defaultVal) {
  if (startVal === 0) return 0;
  if (startVal) return startVal;
  if (hashVal === 0) return 0;
  if (typeof hashVal === "number") return hashVal;
  return defaultVal;
}

/**
 * Resolve the initial view (X, Z, zoom) for a dimension change.
 *
 * @param {{ startX?: number, startZ?: number, startZoom?: number,
 *           defaultX: number, defaultZ: number, defaultZoom: number,
 *           minZoom: number, maxZoom: number }} dimData
 * @param {{ c?: { X?: *, Z?: *, z?: * } } | null | undefined} hashDimData
 * @returns {{ startX: number, startZ: number, startZoom: number }}
 */
export function resolveStartView(dimData, hashDimData) {
  const hc = hashDimData?.c;
  const startX = resolveCoord(dimData.startX, hc?.X, dimData.defaultX);
  const startZ = resolveCoord(dimData.startZ, hc?.Z, dimData.defaultZ);

  // Zoom has an additional bounds check
  let startZoom;
  if (dimData.startZoom === 0) {
    startZoom = 0;
  } else if (dimData.startZoom) {
    startZoom = dimData.startZoom;
  } else {
    const hcz = hc?.z;
    if (hcz === 0) {
      startZoom = 0;
    } else if (
      Number.isInteger(hcz) &&
      hcz <= dimData.maxZoom &&
      hcz >= dimData.minZoom
    ) {
      startZoom = hcz;
    } else {
      startZoom = dimData.defaultZoom;
    }
  }

  return { startX, startZ, startZoom };
}

/**
 * Initialize timeline settings from hash data or defaults.
 * Mutates dimData.timeline in place (creates it if missing).
 *
 * @param {{ dates: string[], timeline?: object }} dimData
 * @param {{ h?: { d?: string, e?: boolean, f?: boolean } } | null | undefined} hashDimData
 */
export function initTimeline(dimData, hashDimData) {
  if (dimData.timeline === undefined) {
    dimData.timeline = { dateCache: {} };
  }
  const hh = hashDimData?.h;
  if (dimData.timeline.date === undefined) {
    dimData.timeline.date =
      (dimData.dates.includes(hh?.d) && hh.d) ||
      dimData.dates[dimData.dates.length - 1];
  }
  if (dimData.timeline.exact === undefined) {
    dimData.timeline.exact = hh?.e === true;
  }
  if (dimData.timeline.fill === undefined) {
    dimData.timeline.fill = !(hh?.f === false);
  }
}
