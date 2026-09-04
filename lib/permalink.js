/**
 * Build a permalink URL from the current map state.
 *
 * @param {{ origin: string, pathname: string }} url
 * @param {string} dim - current dimension code
 * @param {{ dD: object, by?: number[], pv?: unknown }} hashObj
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
  // The photos pane's author filter, as the ids it is letting through. Read off
  // `hashObj` rather than taken as an argument, because unlike `ph` it is state
  // and not an instruction: it describes the map the link was copied from.
  //
  // Top-level rather than inside `dD`, because the filter is one filter for the
  // whole map -- author ids are global and the pane keeps a single set, so
  // filing it per dimension would promise a per-dimension thing that does not
  // exist. Absent means everybody, which is how the pane stores it; `[]` is
  // every author switched off and is carried faithfully, since a link that
  // disagreed with the pane it was copied from would be worse than one that
  // arrives showing nothing on purpose.
  if (Array.isArray(hashObj.by)) {
    params.push(`by=${encodeURIComponent(JSON.stringify(hashObj.by))}`);
  }
  // Whether the map keeps photos up with the photos tab shut. One flag for the
  // whole map, next to `by` rather than inside `dD`, because the checkbox it
  // stands for outlives a dimension switch -- filing it per dimension would
  // promise a per-dimension thing that does not exist.
  //
  // It replaces spelling the same state as the photo layer's id in `v`, which
  // published a build-assigned number as the public interface for a checkbox
  // and made the shortest link to a photo-covered map far longer than it needed
  // to be. Old links are still read; see `hashPhotosVisible`.
  if (hashObj.pv) {
    params.push("pv=1");
  }
  // A photo link names one screenshot and nothing else about it: which layer
  // holds it, and which pin, are answered at the far end by looking it up. The
  // key is top-level rather than inside `dD` because it is an arrival
  // instruction — consumed once, not per-dimension state.
  if (photo) {
    params.push(`ph=${encodeURIComponent(JSON.stringify(photo))}`);
  }
  return `${url.origin}${url.pathname}#${params.join("&")}`;
}
