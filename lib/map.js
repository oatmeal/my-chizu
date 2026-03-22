import { parseHash } from "./hash.js";
import {
  DIM_OVERWORLD,
  DIM_NETHER,
  DIM_END,
  DIM_NAMES,
  NETHER_SCALE,
  dimScale,
} from "./dimensions.js";
import {
  mcProject as mcProjectCoords,
  mcUnproject as mcUnprojectCoords,
} from "./coords.js";
import { resolveStartView, initTimeline } from "./viewState.js";
import { setupBase, setupGrid } from "./setupBase.js";
import { ensureLayerLoaded, setupLayerPanel } from "./setupLayers.js";
import { getTileReplacements, setupTimelinePanel } from "./setupTimeline.js";
import { setupPermalinkPanel } from "./setupPermalink.js";
import { setupCoordinatePanel } from "./setupCoordinates.js";

const InfiniteBackgroundLayer = L.Layer.extend({
  options: {
    backgroundImage: "url('tiles/overworld.png')",
    tileSize: 256,
    minNativeZoom: 1,
  },

  initialize: function (options) {
    L.setOptions(this, options);
  },

  onAdd: function (map) {
    this._container = L.DomUtil.create("div");
    this._map = map;
    this._container.style.backgroundImage = this.options.backgroundImage;
    L.DomUtil.addClass(this._container, "infinite-background-layer");
    map.getContainer().appendChild(this._container);

    map.on("viewreset", this._update, this);
    map.on("zoomanim", this._zoomAnim, this);
    map.on("move", this._move, this);
    this._update();
  },

  onRemove: function (map) {
    L.DomUtil.remove(this._container);
    map.off("viewreset", this._update, this);
    map.off("zoomanim", this._zoomAnim, this);
    map.off("move", this._move, this);
  },

  _zoomAnim: function (e) {
    this._container.style.backgroundSize =
      this.options.tileSize / Math.pow(2, this.options.minNativeZoom - e.zoom) +
      "px";
    const { x, y } = this._map.getPixelBounds().min;
    this._container.style.backgroundPosition = `${-x}px ${-y}px`;
    // animation is out of sync with the tileLayer zoom
    // probably hard to fix, since that uses CSS transform animation
    // and this uses a simple backgroundSize animation
  },

  _move: function (e) {
    const { x, y } = this._map.getPixelBounds().min;
    this._container.style.backgroundPosition = `${-x}px ${-y}px`;
  },

  _update: function () {
    if (this._map) {
      this._container.style.backgroundSize =
        this.options.tileSize /
          Math.pow(2, this.options.minNativeZoom - this._map.getZoom()) +
        "px";
      const { x, y } = this._map.getPixelBounds().min;
      this._container.style.backgroundPosition = `${-x}px ${-y}px`;
    }
  },
});

function createMap(mapid) {
  const mymap = L.map(mapid, {
    zoomControl: false,
    crs: L.CRS.Simple,
  });
  L.control
    .zoom({
      zoomInTitle: "ズームイン",
      zoomOutTitle: "ズームアウト",
    })
    .addTo(mymap);

  // map coords -> MC coords
  mymap.mcProject = function (latlng) {
    return mcProjectCoords(latlng, this.dimData);
  };
  // MC coords -> map coords
  mymap.mcUnproject = function ([X, Z]) {
    const { lat, lng } = mcUnprojectCoords([X, Z], this.dimData);
    return L.latLng(lat, lng);
  };

  mymap.dimCache = {};
  mymap.layerCache = {};

  return mymap;
}

async function changeDim(mymap, newDim) {
  if (mymap.dim === newDim) return;
  if (mymap.dim) {
    // cleanup current dimension
    mymap.eachLayer(function (layer) {
      layer.remove();
    });
  }
  mymap.dim = newDim;

  // load and read dimension data file
  let tileDataJsonUrl;
  if (mymap.dim === DIM_END) {
    tileDataJsonUrl = `data/${DIM_NAMES[DIM_END]}.json`;
  } else if (mymap.dim === DIM_NETHER) {
    await loadTileData(mymap, DIM_OVERWORLD, `data/${DIM_NAMES[DIM_OVERWORLD]}.json`);
    tileDataJsonUrl = `data/${DIM_NAMES[DIM_NETHER]}.json`;
  } else {
    // default to overworld
    mymap.dim = DIM_OVERWORLD;
    tileDataJsonUrl = `data/${DIM_NAMES[DIM_OVERWORLD]}.json`;
  }
  mymap.hashObj.d = mymap.dim;

  await loadTileData(mymap, mymap.dim, tileDataJsonUrl);
  if (mymap.dim === DIM_NETHER) {
    mymap.dimCache[DIM_NETHER].dates = mymap.dimCache[DIM_OVERWORLD].dates;
    mymap.dimCache[DIM_NETHER].fileDates = mymap.dimCache[DIM_OVERWORLD].fileDates;
  }

  mymap.dimData = mymap.dimCache[mymap.dim];
  const southWest = mymap.mcUnproject([mymap.dimData.minX, mymap.dimData.maxZ]);
  const northEast = mymap.mcUnproject([mymap.dimData.maxX, mymap.dimData.minZ]);
  mymap.setMaxBounds(new L.LatLngBounds(southWest, northEast));

  // starting view
  const hashDimData =
    mymap.hashObj && mymap.hashObj.dD && mymap.hashObj.dD[mymap.dim];
  const { startX, startZ, startZoom } = resolveStartView(
    mymap.dimData,
    hashDimData
  );

  // initialize timeline settings from hashObj or defaults
  initTimeline(mymap.dimData, hashDimData);
  // reset hashObj (will get filled in properly by permalinkPanel)
  if (!mymap.hashObj.dD) {
    mymap.hashObj.dD = {};
  }
  mymap.hashObj.dD[mymap.dim] = {
    c: { X: startX, Z: startZ, z: startZoom },
    v: Array.from(mymap.dimData.visibleLayers),
    h: {
      d: mymap.dimData.timeline.date,
      e: mymap.dimData.timeline.exact,
      f: mymap.dimData.timeline.fill,
    },
  };

  await getTileReplacements(mymap);

  // notify panels of dimension change (must happen before nether lines
  // and visible layer restore, which depend on the layer cache being
  // populated by the layer panel's dimchange handler)
  const dimName = DIM_NAMES[mymap.dim];
  document.getElementById(`locate-dimension-${dimName}`).checked = true;
  document.getElementById(`layers-dimension-${dimName}`).checked = true;
  mymap.fire("dimchange");

  // setup base layer
  // this will zoom the map to a weird place if the previous zoom level
  // is out of bounds of the new base layer
  if (!mymap.dimData.base) {
    mymap.dimData.base = setupBase(mymap);
  } else {
    mymap.dimData.base.addTo(mymap);
  }

  // setup infinite background
  if (!mymap.dimData.bg) {
    mymap.dimData.bg = new InfiniteBackgroundLayer({
      backgroundImage: `url(${mymap.dimData.errorTileUrl})`,
      tileSize: mymap.dimData.tileSize,
      minNativeZoom: mymap.dimData.minNativeZoom,
    }).addTo(mymap);
  } else {
    mymap.dimData.bg.addTo(mymap);
  }

  // setup grid layer
  const gridCheckbox = document.getElementById("grid-checkbox");
  if (!mymap.layerCache["g" + mymap.dim]) {
    const gridLayer = setupGrid(mymap, mymap.dimData.tileSize);
    mymap.layerCache["g" + mymap.dim] = {
      dataLayer: gridLayer,
      check: gridCheckbox,
    };
  }
  gridCheckbox.onchange = function () {
    const gridLayer = mymap.layerCache["g" + mymap.dim].dataLayer;
    if (gridCheckbox.checked) {
      mymap.dimData.visibleLayers.add("g" + mymap.dim);
      gridLayer.addTo(mymap);
    } else {
      mymap.dimData.visibleLayers.delete("g" + mymap.dim);
      gridLayer.remove();
    }
  };
  gridCheckbox.checked = false;

  // draw lines on nether layer
  if (mymap.dim === DIM_NETHER) {
    if (!mymap.layerCache["nether-lines"]) {
      // map will get screwed up
      // if the dimension is changed again before this completes.
      // for now, the radio buttons are disabled temporarily
      const netherLines = L.layerGroup([]);
      for (const layer of mymap.dimData.layers) {
        await ensureLayerLoaded(mymap, layer.id);
        const { data, dataLayer } = mymap.layerCache[layer.id];
        if (data.lines)
          for (const { pts } of data.lines) {
            const scale = NETHER_SCALE;
            const line = pts.map(([x, y, z]) =>
              mymap.mcUnproject([scale * x, scale * z])
            );
            netherLines.addLayer(
              // TODO: styling?
              L.polyline(line, { color: "gray" })
            );
          }
      }
      mymap.layerCache["nether-lines"] = { dataLayer: netherLines };
    }
    mymap.layerCache["nether-lines"].dataLayer.addTo(mymap);
  }

  // restore previous displayed layers, if any
  // (draw on top of the grayed-out nether lines)
  for (const id of mymap.dimData.visibleLayers) {
    if (!mymap.layerCache[id]) {
      mymap.dimData.visibleLayers.delete(id);
      continue;
    }
    mymap.layerCache[id].check.checked = true;
    await ensureLayerLoaded(mymap, id);
    mymap.layerCache[id].check.parentElement.style.backgroundColor = `hsla(${
      215 + 360 * mymap.layerCache[id].fraction
    }, 100%, 60%, 0.5)`;
    mymap.layerCache[id].dataLayer.addTo(mymap);
  }

  mymap.setView(mymap.mcUnproject([startX, startZ]), startZoom, {
    animate: false,
  });

  // notify panels that need the map view to be ready (e.g. coord panel
  // calls getCenter() in its reset function)
  mymap.fire("dimviewready");
}

async function loadTileData(mymap, dim, tileDataJsonUrl) {
  if (!mymap.dimCache[dim]) {
    const {
      X0,
      Z0,
      defaultX,
      defaultZ,
      defaultZoom,
      minZoom,
      maxZoom,
      minNativeZoom,
      maxNativeZoom,
      minX,
      maxX,
      minZ,
      maxZ,
      dates,
      fileDates,
      layers,
      tilePath,
      errorTileUrl,
      tileSize,
      ratio,
    } = await (await fetch(tileDataJsonUrl)).json();
    mymap.dimCache[dim] = {
      // data from JSON
      X0,
      Z0,
      defaultX,
      defaultZ,
      defaultZoom,
      minZoom,
      maxZoom,
      minNativeZoom,
      maxNativeZoom,
      minX,
      maxX,
      minZ,
      maxZ,
      dates,
      fileDates,
      layers,
      tilePath,
      errorTileUrl,
      tileSize,
      ratio,
      // other data
      visibleLayers: new Set(
        (Array.isArray(
          mymap.hashObj.dD && mymap.hashObj.dD[dim] && mymap.hashObj.dD[dim].v
        ) &&
          mymap.hashObj.dD[dim].v) ||
          (dim === DIM_NETHER
            ? // default to showing all layers in the nether
              layers.map(({ id }) => id)
            : [])
      ),
    };
    // HACK: used for styling the layers
    mymap.dimCache[dim].layers.forEach((layer, i) => {
      layer.fraction = i / mymap.dimCache[dim].layers.length;
    });
    console.log(dim, "reset");
  }
}

const myScale = L.Control.Scale.extend({
  _update: function () {
    var map = this._map,
      y = map.getSize().y / 2;

    const p1 = map
      .mcProject(map.containerPointToLatLng([0, y]))
      .map((c) => (c / dimScale(map.dim)));
    const p2 = map
      .mcProject(map.containerPointToLatLng([this.options.maxWidth, y]))
      .map((c) => (c / dimScale(map.dim)));

    var maxMeters = p2[0] - p1[0];

    this._updateScales(maxMeters);
  },
});

async function init(mapid) {
  // workaround for 100vh not working right on mobile
  // https://ilxanlar.medium.com/you-shouldnt-rely-on-css-100vh-and-here-s-why-1b4721e74487
  function calculateH() {
    document.documentElement.style.setProperty(
      "--h",
      `${window.innerHeight}px`
    );
  }
  calculateH();
  window.addEventListener("resize", calculateH);
  window.addEventListener("orientationchange", calculateH);

  const mymap = createMap(mapid);

  // read data from hash params in URL
  mymap.url = new URL(window.location.href);
  mymap.hashObj = parseHash(mymap.url.hash);
  console.log("hash", JSON.stringify(mymap.hashObj));
  mymap.updateHash = () => {
    // update hashObj with current coords
    const [newX, newZ] = mymap.mcProject(mymap.getCenter()).map(Math.round);
    const newZoom = mymap.getZoom();
    mymap.hashObj.dD[mymap.dim].c = { X: newX, Z: newZ, z: newZoom };
    console.log("updateHash", JSON.stringify(mymap.hashObj));
  };

  mymap.sidebar = L.control
    .sidebar({
      autopan: false, // whether to maintain the centered map point when opening the sidebar
      closeButton: true, // whether to add a close button to the panes
      container: "sidebar", // the DOM container or #ID of a predefined sidebar container that should be used
      position: "left", // left or right
    })
    .addTo(mymap);

  // setup dimension switching elements
  const dimRadioIds = [
    // coordinate tool tab
    "locate-dimension-overworld",
    "locate-dimension-nether",
    "locate-dimension-end",
    // layers tab
    "layers-dimension-overworld",
    "layers-dimension-nether",
    "layers-dimension-end",
  ];
  function disable() {
    for (const id of dimRadioIds) {
      document.getElementById(id).disabled = true;
    }
  }
  function enable() {
    for (const id of dimRadioIds) {
      document.getElementById(id).disabled = false;
    }
  }

  for (const id of dimRadioIds) {
    const el = document.getElementById(id);
    el.onchange = async () => {
      disable();
      // save coords to startX, startZ, startZoom
      [mymap.dimData.startX, mymap.dimData.startZ] = mymap
        .mcProject(mymap.getCenter())
        .map(Math.round);
      mymap.dimData.startZoom = mymap.getZoom();
      // update hashObj with non-coord settings
      mymap.hashObj.dD[mymap.dim].v = Array.from(mymap.dimData.visibleLayers);
      // TODO: other settings?
      mymap.updateHash();
      // HACK: workaround for initial zoom not being set properly
      // if previous zoom was out of zoom bounds
      // I don't know why 3 works here and not 0
      mymap.setZoom(3, { animate: false });
      await changeDim(mymap, el.value);
      enable();
    };
  }

  setupLayerPanel(mymap);
  await setupTimelinePanel(mymap);
  setupPermalinkPanel(mymap);
  setupCoordinatePanel(mymap);

  // set up base layers
  await changeDim(mymap, mymap.hashObj.d || DIM_OVERWORLD);

  new myScale({ imperial: false, maxWidth: 200 }).addTo(mymap);

  window.mymap = mymap;
  return mymap;
}

window.init = init;
