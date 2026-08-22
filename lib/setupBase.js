import { DIM_NETHER, dimScale } from "./dimensions.js";
import { markPixelated } from "./pixelated.js";
import { shouldCreateTile, resolveTileUrl } from "./tileUrl.js";

export function setupBase(mymap) {
  const {
    tileSize,
    minZoom,
    maxZoom,
    minNativeZoom,
    maxNativeZoom,
    tilePath,
    errorTileUrl,
    fileDates,
    timeline,
  } = mymap.dimData;
  const SIGIL = "***"; // this string is replaced by a valid date (if one exists)
  const UPDATED = "***UPDATED***"; // replaced by the last git commit time during minification
  const base = L.tileLayer.fallback(`{tilePath}/{z}/{x}/{y}/${SIGIL}.png`, {
    attribution: `TPA(Minecraft)<br>最終更新：${UPDATED}`,
    tileSize,
    noWrap: true,
    // TODO: if minZoom and maxZoom for the nether are tweaked in build-data.mjs
    // instead of here, the tiles seem to be drawn with the wrong scale.
    // something to fix in mcProject / mcUnproject?
    minZoom: minZoom + (mymap.dim === DIM_NETHER ? -3 : 0),
    maxZoom: maxZoom + (mymap.dim === DIM_NETHER ? -3 : 0),
    minNativeZoom,
    maxNativeZoom,
    infinite: true,
    tilePath,
    errorTileUrl,
    opacity: mymap.dim === DIM_NETHER ? 0.2 : 1,
  });

  base._originalIsValidTile = base._isValidTile;
  base._isValidTile = function (tilePoint) {
    // for performance reasons at low zoom levels (when zoomed out),
    // do not create missing background tile divs.
    // they will be replaced by InfiniteBackgroundLayer
    const key = `${tilePoint.z}/${tilePoint.x}/${tilePoint.y}`;
    const tileDates = fileDates[key];
    const replacements = mymap.dimData.timeline.tileReplacements[key];
    if (
      !shouldCreateTile(
        this._map.getZoom(),
        this.options.minNativeZoom,
        tileDates,
        replacements
      )
    )
      return false;
    return this._originalIsValidTile(tilePoint);
  };

  // if there are missing tiles which "contain" tiles that exist at higher zoom,
  // (encoded in the tileReplacements dictionary)
  // replace those tiles with a div containing those tile images.
  base._originalCreateTile = base.createTile;
  base.createTile = function (coords, done) {
    const key = `${coords.z}/${coords.x}/${coords.y}`;
    const replacements = mymap.dimData.timeline.tileReplacements[key];
    if (replacements) {
      const tileSize = this.getTileSize();

      const tile = document.createElement("div");
      const loadPromises = [];
      for (const child of replacements) {
        const childImg = tile.appendChild(document.createElement("img"));
        // position child within the tile
        const cx = child.scale * tileSize.x;
        const cy = child.scale * tileSize.y;
        loadPromises.push(
          new Promise((res) => {
            childImg.onload = () => {
              // A tile smaller than the box it is drawn into is being
              // magnified, and must not be smoothed. The child's box is cx,
              // not the whole tile, so it is measured against that.
              markPixelated(childImg, cx);
              res();
            };
          })
        );
        childImg.style.position = "absolute";
        childImg.style.width = cx + "px";
        childImg.style.height = cy + "px";
        childImg.style.left = cx * child.pos_x + "px";
        childImg.style.top = cy * child.pos_z + "px";
        // Last: assigning src is what starts the load, so onload must be set.
        childImg.src = `${this.options.tilePath}/${child.key}/${child.date}.png`;
      }
      Promise.all(loadPromises).then(() => done());
      return tile;
    } else {
      const tile = base._originalCreateTile(coords, done);
      if (tile && tile.tagName === "IMG") {
        // addEventListener rather than onload: L.TileLayer.createTile has
        // already put _tileOnLoad there, and overwriting it would break
        // loading entirely.
        const boxWidth = this.getTileSize().x;
        tile.addEventListener("load", () => markPixelated(tile, boxWidth));
      }
      return tile;
    }
  };

  // this "original" getTileUrl comes from the fallback addon
  base._originalGetTileUrl = base.getTileUrl;
  // we override it to prevent attempting to load tiles at minNativeZoom which do not exist
  // and to implement the timestamp logic
  base.getTileUrl = function (tilePoint) {
    const key = `${tilePoint.z}/${tilePoint.x}/${tilePoint.y}`;
    const tileDates = fileDates[key];
    const originalUrl = this._originalGetTileUrl(tilePoint);
    return resolveTileUrl(
      key,
      tileDates,
      timeline,
      originalUrl,
      SIGIL,
      this.options.errorTileUrl,
      this.options.minNativeZoom,
      tilePoint.z
    );
  };

  base.addTo(mymap);
  return base;
}

export function setupGrid(mymap, tileSize) {
  // TODO: set grid above everything else?
  const minZoom = mymap.dim === DIM_NETHER ? -3 : 0;
  const maxZoom = mymap.dim === DIM_NETHER ? 1 : 4;
  const grid = L.gridLayer({
    minZoom,
    maxZoom,
    tileSize,
    noWrap: true,
    infinite: true,
  });

  // TODO: dragging this layer is laggy in Chrome??
  // TODO: show dates / format differently depending on whether tile exists?
  // TODO: do something for tiles replaced by higher zoom tiles?
  grid.createTile = function (coords) {
    const tile = L.DomUtil.create("div", "tile-coords");
    const zoom = (mymap.dim === DIM_NETHER ? 1 : 4) - coords.z;
    const label = tile.appendChild(L.DomUtil.create("div", "gridLabelLayer"));
    label.innerText = `縮小率${zoom}: [${coords.x},${coords.y}]`;
    return tile;
  };

  return grid;
}
