/**
 * @vitest-environment jsdom
 *
 * Integration tests for init() and changeDim().
 * Verifies that the full initialization flow works for all three
 * dimensions, catching ordering bugs and missing cache entries.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

// Minimal dimension data matching the shape produced by build-data.mjs
function makeDimData(overrides = {}) {
  return {
    X0: 0,
    Z0: 0,
    defaultX: 0,
    defaultZ: 0,
    defaultZoom: 2,
    minZoom: 0,
    maxZoom: 4,
    minNativeZoom: 1,
    maxNativeZoom: 4,
    minX: -1000,
    maxX: 1000,
    minZ: -1000,
    maxZ: 1000,
    dates: ["20240101", "20240201"],
    fileDates: {},
    layers: [
      { id: 1, name: "Test Layer", url: "data/overworld/test.json" },
    ],
    tilePath: "tiles/overworld",
    errorTileUrl: "tiles/overworld.png",
    tileSize: 256,
    ratio: 1,
    ...overrides,
  };
}

const overworldDim = makeDimData();
const netherDim = makeDimData({
  defaultZoom: 1,
  tilePath: "tiles/overworld",
  errorTileUrl: "tiles/nether.png",
  layers: [
    { id: 10, name: "Nether Layer", url: "data/nether/test.json" },
  ],
});
const endDim = makeDimData({
  tilePath: "tiles/end",
  errorTileUrl: "tiles/end.png",
  layers: [],
});

const layerData = {
  id: 1,
  name: "Test Layer",
  markers: [
    { name: "Spawn", pos: [0, 64, 0] },
  ],
};

const netherLayerData = {
  id: 10,
  name: "Nether Layer",
  markers: [
    { name: "Portal", pos: [100, 64, 100] },
  ],
  lines: [
    { name: "Path", pts: [[0, 64, 0], [100, 64, 100]] },
  ],
};

const datesJson = { "20240101": "1月1日", "20240201": "2月1日" };
const vodsJson = [];
const tileReplacements = { tileReplacements: {}, skip: {} };

// Route fetch requests to fixture data
function mockFetch(url) {
  const routes = {
    "data/overworld.json": overworldDim,
    "data/nether.json": netherDim,
    "data/end.json": endDim,
    "data/dates.json": datesJson,
    "data/vods.json": vodsJson,
    "data/overworld/test.json": layerData,
    "data/nether/test.json": netherLayerData,
  };
  // tile replacement cache: match data/{dim}/{date}-{mode}.json
  const tileReplMatch = url.match(/^data\/\w+\/\d{8}-[efb]\.json$/);
  if (tileReplMatch) {
    return Promise.resolve({
      json: () => Promise.resolve(tileReplacements),
    });
  }
  if (routes[url]) {
    return Promise.resolve({
      json: () => Promise.resolve(JSON.parse(JSON.stringify(routes[url]))),
    });
  }
  return Promise.reject(new Error(`Unmocked fetch: ${url}`));
}

let initFn;

beforeAll(async () => {
  // jsdom doesn't implement scrollIntoView or setSelectionRange
  Element.prototype.scrollIntoView = function () {};
  HTMLInputElement.prototype.setSelectionRange = function () {};

  // Load Leaflet and plugins into the jsdom global
  const L = (await import("leaflet")).default;
  globalThis.L = L;

  // Load sidebar plugin (attaches to L.control.sidebar)
  await import("leaflet-sidebar-v2");

  // Load fallback plugin (attaches to L.tileLayer.fallback)
  await import("leaflet.tilelayer.fallback");

  // Stub fetch globally
  globalThis.fetch = vi.fn(mockFetch);

  // Build the DOM structure that init() expects
  document.body.innerHTML = `
    <div id="mapid" style="width:800px;height:600px"></div>
    <div id="sidebar" class="leaflet-sidebar collapsed">
      <div class="leaflet-sidebar-tabs">
        <ul role="tablist">
          <li><a href="#locate" role="tab"></a></li>
          <li><a href="#layers" role="tab"></a></li>
          <li><a href="#timeline" role="tab"></a></li>
          <li><a href="#link" role="tab"></a></li>
          <li><a href="#info" role="tab"></a></li>
        </ul>
      </div>
      <div class="leaflet-sidebar-content">
        <div class="leaflet-sidebar-pane" id="locate">
          <span class="dimension-radio">
            <input type="radio" name="locate-dimension" id="locate-dimension-overworld" value="o">
          </span>
          <span class="dimension-radio">
            <input type="radio" name="locate-dimension" id="locate-dimension-nether" value="n">
          </span>
          <span class="dimension-radio">
            <input type="radio" name="locate-dimension" id="locate-dimension-end" value="e">
          </span>
          <div id="locate-current-coords"></div>
          <div id="locate-center-tool"></div>
          <button id="locate-go-home"></button>
          <input type="checkbox" id="coord-checkbox">
          <div id="locate-marker-div"></div>
          <input type="checkbox" id="grid-checkbox">
        </div>
        <div class="leaflet-sidebar-pane" id="layers">
          <span class="dimension-radio">
            <input type="radio" name="layers-dimension" id="layers-dimension-overworld" value="o">
          </span>
          <span class="dimension-radio">
            <input type="radio" name="layers-dimension" id="layers-dimension-nether" value="n">
          </span>
          <span class="dimension-radio">
            <input type="radio" name="layers-dimension" id="layers-dimension-end" value="e">
          </span>
          <div id="layers-select"></div>
          <div id="layers-details">placeholder</div>
        </div>
        <div class="leaflet-sidebar-pane" id="timeline">
          <input type="checkbox" id="timeline-checkbox-exact">
          <input type="checkbox" id="timeline-checkbox-after">
          <label id="timeline-checkbox-after-label"></label>
          <div id="timeline-radio"></div>
          <button id="timeline-button-left"></button>
          <div id="timeline-current"></div>
          <button id="timeline-button-right"></button>
        </div>
        <div class="leaflet-sidebar-pane" id="link">
          <input type="checkbox" id="permalink-checkbox-date">
          <input type="text" id="permalink-text" readonly>
          <button id="permalink-button"></button>
          <span id="permalink-copy-status"></span>
        </div>
        <div class="leaflet-sidebar-pane" id="info"></div>
      </div>
    </div>
  `;

  // Import map.js — this defines window.init
  await import("../lib/map.js");
  initFn = window.init;
});

describe("init and changeDim integration", () => {
  let mymap;

  it("initializes with overworld without errors", async () => {
    mymap = await initFn("mapid");
    expect(mymap).toBeDefined();
    expect(mymap.dim).toBe("o");
    expect(mymap.dimData).toBeDefined();
    expect(mymap.dimData.X0).toBe(0);
  });

  it("has populated layer cache after overworld init", () => {
    // The layer panel's dimchange handler should have created cache entries
    expect(mymap.layerCache[1]).toBeDefined();
    expect(mymap.layerCache[1].check).toBeDefined();
  });

  it("has timeline state initialized", () => {
    expect(mymap.dimData.timeline).toBeDefined();
    expect(mymap.dimData.timeline.date).toBe("20240201"); // last date
    expect(mymap.dimData.timeline.fill).toBe(true);
    expect(mymap.dimData.timeline.exact).toBe(false);
  });

  it("has timeline DOM populated", () => {
    const radio = document.getElementById("timeline-radio");
    // should have date entries
    expect(radio.innerHTML).toContain("20240101");
  });

  it("switches to nether without errors", async () => {
    // This is the scenario that was broken — nether requires layer cache
    // to be populated before the nether lines section runs
    // Simulate what the dimension radio change does
    const netherRadio = document.getElementById("locate-dimension-nether");
    // Save current state as changeDim expects
    [mymap.dimData.startX, mymap.dimData.startZ] = mymap
      .mcProject(mymap.getCenter())
      .map(Math.round);
    mymap.dimData.startZoom = mymap.getZoom();
    mymap.hashObj.dD[mymap.dim].v = Array.from(mymap.dimData.visibleLayers);
    mymap.updateHash();
    mymap.setZoom(3, { animate: false });

    // Import changeDim indirectly by using the radio's onchange
    // Actually, changeDim is not exported, so let's trigger it via the radio
    // We need to call changeDim("n") — but it's internal to map.js
    // The radio's onchange handler calls changeDim
    // However, jsdom doesn't fire onchange on programmatic value changes
    // So we set the value and call the handler directly
    await netherRadio.onchange();

    expect(mymap.dim).toBe("n");
    expect(mymap.dimData).toBeDefined();
  });

  it("has nether layer cache populated", () => {
    expect(mymap.layerCache[10]).toBeDefined();
    expect(mymap.layerCache[10].check).toBeDefined();
  });

  it("has nether lines layer", () => {
    expect(mymap.layerCache["nether-lines"]).toBeDefined();
    expect(mymap.layerCache["nether-lines"].dataLayer).toBeDefined();
  });

  it("switches to end without errors", async () => {
    [mymap.dimData.startX, mymap.dimData.startZ] = mymap
      .mcProject(mymap.getCenter())
      .map(Math.round);
    mymap.dimData.startZoom = mymap.getZoom();
    mymap.hashObj.dD[mymap.dim].v = Array.from(mymap.dimData.visibleLayers);
    mymap.updateHash();
    mymap.setZoom(3, { animate: false });

    const endRadio = document.getElementById("locate-dimension-end");
    await endRadio.onchange();

    expect(mymap.dim).toBe("e");
    expect(mymap.dimData).toBeDefined();
  });

  it("switches back to overworld without errors", async () => {
    [mymap.dimData.startX, mymap.dimData.startZ] = mymap
      .mcProject(mymap.getCenter())
      .map(Math.round);
    mymap.dimData.startZoom = mymap.getZoom();
    mymap.hashObj.dD[mymap.dim].v = Array.from(mymap.dimData.visibleLayers);
    mymap.updateHash();
    mymap.setZoom(3, { animate: false });

    const owRadio = document.getElementById("locate-dimension-overworld");
    await owRadio.onchange();

    expect(mymap.dim).toBe("o");
    // Original overworld data should still be cached
    expect(mymap.dimCache["o"]).toBeDefined();
  });

  it("switches to nether a second time (cached path)", async () => {
    [mymap.dimData.startX, mymap.dimData.startZ] = mymap
      .mcProject(mymap.getCenter())
      .map(Math.round);
    mymap.dimData.startZoom = mymap.getZoom();
    mymap.hashObj.dD[mymap.dim].v = Array.from(mymap.dimData.visibleLayers);
    mymap.updateHash();
    mymap.setZoom(3, { animate: false });

    const netherRadio = document.getElementById("locate-dimension-nether");
    await netherRadio.onchange();

    expect(mymap.dim).toBe("n");
    // Nether lines should still exist from first visit
    expect(mymap.layerCache["nether-lines"]).toBeDefined();
  });
});
