/**
 * Coordinate conversion between Minecraft [X, Z] and Leaflet LatLng.
 *
 * Leaflet with L.CRS.Simple maps:
 *   project({lat, lng}, zoom) → {x: 2^zoom * lng, y: -(2^zoom) * lat}
 *   unproject({x, y}, zoom)  → {lat: -y / 2^zoom, lng: x / 2^zoom}
 *
 * The engine's coordinate system maps Minecraft X to Leaflet lng and
 * Minecraft Z to (negated) Leaflet lat, with an origin offset (X0, Z0)
 * and a scaling ratio.
 */

/**
 * Convert a Leaflet LatLng to Minecraft [X, Z] coordinates.
 *
 * Equivalent to the mcProject() method attached to the Leaflet map.
 *
 * @param {{ lat: number, lng: number }} latlng
 * @param {{ X0: number, Z0: number, ratio: number, minZoom: number }} dimData
 * @returns {[number, number]} [mcX, mcZ]
 */
export function mcProject(latlng, dimData) {
  const { X0, Z0, ratio, minZoom } = dimData;
  const scale = Math.pow(2, minZoom);
  return [
    ratio * scale * latlng.lng + X0,
    -(ratio * scale * latlng.lat) + Z0,
  ];
}

/**
 * Convert Minecraft [X, Z] coordinates to a Leaflet LatLng-compatible object.
 *
 * Equivalent to the mcUnproject() method attached to the Leaflet map.
 *
 * @param {[number, number]} coords - [mcX, mcZ]
 * @param {{ X0: number, Z0: number, ratio: number, minZoom: number }} dimData
 * @returns {{ lat: number, lng: number }}
 */
export function mcUnproject([X, Z], dimData) {
  const { X0, Z0, ratio, minZoom } = dimData;
  const scale = Math.pow(2, minZoom);
  return {
    lat: -(Z - Z0) / (ratio * scale),
    lng: (X - X0) / (ratio * scale),
  };
}
