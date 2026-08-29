/**
 * Build a permalink URL from the current map state.
 *
 * @param {{ origin: string, pathname: string }} url
 * @param {string} dim - current dimension code
 * @param {{ dD: object }} hashObj
 * @param {boolean} includeDate - whether to include timeline hash data
 * @param {string} [photo] - a photo stem to open on arrival (`ph`)
 * @returns {string}
 */
export function buildPermalinkUrl(url, dim, hashObj, includeDate, photo) {
  const dD = {};
  for (const [d, data] of Object.entries(hashObj.dD)) {
    if (!data) continue;
    dD[d] = { c: data.c, v: data.v };
    if (includeDate) {
      dD[d].h = data.h;
    }
  }
  const params = [`d="${dim}"`, `dD=${encodeURIComponent(JSON.stringify(dD))}`];
  // A photo link names one screenshot and nothing else about it: which layer
  // holds it, and which pin, are answered at the far end by looking it up. The
  // key is top-level rather than inside `dD` because it is an arrival
  // instruction — consumed once, not per-dimension state.
  if (photo) {
    params.push(`ph=${encodeURIComponent(JSON.stringify(photo))}`);
  }
  return `${url.origin}${url.pathname}#${params.join("&")}`;
}
