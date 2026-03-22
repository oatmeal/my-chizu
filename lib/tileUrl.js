import { selectTileDate } from "./tileDate.js";

/**
 * Determine whether a tile at the given coordinates should be created.
 * At low zoom levels, tiles that have no data and no replacements are
 * skipped for performance (InfiniteBackgroundLayer handles the background).
 *
 * @param {number} zoom - current map zoom level
 * @param {number} minNativeZoom - lowest zoom that has real tile images
 * @param {string[]|undefined} tileDates - available dates for this tile key
 * @param {object[]|undefined} replacements - higher-zoom child replacements
 * @returns {boolean} false to skip tile creation
 */
export function shouldCreateTile(zoom, minNativeZoom, tileDates, replacements) {
  if (zoom < minNativeZoom && !tileDates && !replacements) return false;
  return true;
}

/**
 * Resolve the URL for a tile image based on available dates, timeline
 * settings, and display mode.
 *
 * @param {string} key - tile key "z/x/y"
 * @param {string[]|undefined} tileDates - sorted ascending dates for this tile
 * @param {object} timeline - timeline state: { date, exact, fill, skip }
 * @param {string} originalUrl - URL template with SIGIL placeholder
 * @param {string} sigil - placeholder string to replace with a date
 * @param {string} errorTileUrl - URL returned for low-zoom missing tiles
 * @param {number} minNativeZoom - lowest zoom with real tile images
 * @param {number} zoom - tile's zoom level
 * @returns {string} resolved URL, or "data:," to suppress the request
 */
export function resolveTileUrl(
  key,
  tileDates,
  timeline,
  originalUrl,
  sigil,
  errorTileUrl,
  minNativeZoom,
  zoom
) {
  const noRequest = "data:,";

  if (zoom <= minNativeZoom && !tileDates) {
    return errorTileUrl;
  }

  if (!tileDates) {
    return noRequest;
  }

  const mode = timeline.exact ? "e" : timeline.fill ? "f" : "b";
  const date = selectTileDate(tileDates, timeline.date, mode);
  if (!date) return noRequest;

  if (timeline.fill && timeline.skip[key]) {
    return noRequest;
  }

  return originalUrl.replace(sigil, date);
}
