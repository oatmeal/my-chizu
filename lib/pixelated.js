/**
 * Decide, per tile image, whether the browser should smooth it.
 *
 * Tiles are drawn into a fixed CSS box (256 px by default) but they are not all
 * the same size on disk. The historical set is 437x437 or 600x600 — an upsample
 * of a 128x128 Minecraft map — and is *downscaled* into the box, where
 * smoothing is correct and nearest-neighbour would alias. Tiles cut by the
 * lattice extractor are the map's own 128x128 and are *upscaled* into the box,
 * where smoothing turns crisp map pixels into mush.
 *
 * So the rule is per image, not per layer: a tile declares its own kind by
 * being smaller than the box it is drawn into. That needs no metadata and no
 * build change, and it degrades correctly during the mixed period when one
 * coordinate has 437 px tiles on old dates and 128 px tiles on new ones.
 *
 * Putting `.pixelated` on the whole tile layer instead would make every legacy
 * tile downsample nearest-neighbour, which aliases them — it would make every
 * existing tile worse in order to fix the new ones.
 */

export const PIXELATED_CLASS = "pixelated";

/**
 * @param {number} naturalWidth - the image's own width in pixels
 * @param {number} boxWidth - the CSS box the image is drawn into
 * @returns {boolean} true when the image is being magnified
 */
export function shouldPixelate(naturalWidth, boxWidth) {
  if (!naturalWidth || !boxWidth) return false;
  return naturalWidth <= boxWidth;
}

/**
 * Apply the decision to an image, if it is being magnified.
 *
 * Safe to call before the image has loaded — `naturalWidth` is 0 then and the
 * class is simply not added — so callers hook it to the load event.
 *
 * @param {{naturalWidth: number, classList: {add: Function}}} img
 * @param {number} boxWidth
 */
export function markPixelated(img, boxWidth) {
  if (img && shouldPixelate(img.naturalWidth, boxWidth)) {
    img.classList.add(PIXELATED_CLASS);
  }
}
