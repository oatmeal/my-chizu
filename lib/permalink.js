/**
 * Build a permalink URL from the current map state.
 *
 * @param {{ origin: string, pathname: string }} url
 * @param {string} dim - current dimension code
 * @param {{ dD: object }} hashObj
 * @param {boolean} includeDate - whether to include timeline hash data
 * @returns {string}
 */
export function buildPermalinkUrl(url, dim, hashObj, includeDate) {
  const dD = {};
  for (const [d, data] of Object.entries(hashObj.dD)) {
    if (!data) continue;
    dD[d] = { c: data.c, v: data.v };
    if (includeDate) {
      dD[d].h = data.h;
    }
  }
  return `${url.origin}${url.pathname}#d="${dim}"&dD=${encodeURIComponent(
    JSON.stringify(dD)
  )}`;
}
