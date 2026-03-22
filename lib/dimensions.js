/**
 * Dimension short codes used in URL hashes and internal state.
 */
export const DIM_OVERWORLD = "o";
export const DIM_NETHER = "n";
export const DIM_END = "e";

/**
 * Map short dimension code → full name (used for file paths, JSON keys).
 */
export const DIM_NAMES = {
  [DIM_OVERWORLD]: "overworld",
  [DIM_NETHER]: "nether",
  [DIM_END]: "end",
};

/**
 * The nether uses 1:8 coordinate scaling relative to the overworld.
 */
export const NETHER_SCALE = 8;

/**
 * Return the coordinate scale factor for a dimension.
 * The nether uses 1:8 scaling; overworld and end use 1:1.
 *
 * @param {string} dim - short dimension code ("o", "n", "e")
 * @returns {number}
 */
export function dimScale(dim) {
  return dim === DIM_NETHER ? NETHER_SCALE : 1;
}

/**
 * Return the tile storage path key for a dimension.
 * Nether tiles are stored alongside overworld tiles.
 *
 * @param {string} dim - short dimension code
 * @returns {string} "overworld" or "end"
 */
export function dimTilePath(dim) {
  return dim === DIM_END ? "end" : "overworld";
}
