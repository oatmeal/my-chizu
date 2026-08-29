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

const overworldDim = makeDimData({
  layers: [
    { id: 1, name: "Test Layer", url: "data/overworld/test.json" },
    {
      id: 102,
      name: "スクリーンショット",
      url: "data/overworld/photos.json",
      // `build-data.mjs` copies this out of the layer file so the viewer can
      // tell a photo layer from a marker layer before fetching either.
      kind: "photos",
    },
  ],
  // 20240115 has photos but no tiles, which is the common case: most photo
  // dates are sessions where nobody screenshotted a map.
  photoDates: { "20240101": 2, "20240115": 3 },
});
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

const photoLayerData = {
  id: 102,
  name: "スクリーンショット",
  kind: "photos",
  photos: [
    { f: "20240101/a", date: "20240101", pos: [0, 64, 0], src: "filename" },
    { f: "20240101/b", date: "20240101", pos: [500, 64, 500], src: "filename" },
    { f: "20240115/c", date: "20240115", pos: [0, null, 0], src: "filename" },
    { f: "20240115/d", date: "20240115", pos: [900, null, 900], src: "filename" },
    { f: "20240115/e", date: "20240115", pos: [-900, null, -900], src: "filename" },
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
    "data/overworld/photos.json": photoLayerData,
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
          <li><a href="#photos" role="tab"></a></li>
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
        <div class="leaflet-sidebar-pane" id="photos">
          <input type="checkbox" id="photos-persist">
          <div id="photos-status"></div>
          <div id="photos-list"></div>
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

describe("photo layer integration", () => {
  let mymap;

  // One Leaflet map per jsdom container, so this continues with the map the
  // suite above left behind -- in the nether, after its last dimension switch.
  beforeAll(async () => {
    mymap = window.mymap;
    if (mymap.dim !== "o") {
      [mymap.dimData.startX, mymap.dimData.startZ] = mymap
        .mcProject(mymap.getCenter())
        .map(Math.round);
      mymap.dimData.startZoom = mymap.getZoom();
      mymap.hashObj.dD[mymap.dim].v = Array.from(mymap.dimData.visibleLayers);
      mymap.updateHash();
      mymap.setZoom(3, { animate: false });
      await document.getElementById("locate-dimension-overworld").onchange();
    }
  });

  it("caches the photos layer without giving it a layers-panel row", () => {
    // Photos are switched on by opening the photos tab, not from the layers
    // panel, so the layer is loadable but has no checkbox of its own.
    expect(mymap.layerCache[102]).toBeDefined();
    expect(mymap.layerCache[102].url).toBe("data/overworld/photos.json");
    expect(mymap.layerCache[102].check).toBeUndefined();
    expect(document.getElementById("map-layer-102")).toBeNull();
    // The marker layer beside it still gets one.
    expect(document.getElementById("map-layer-1")).not.toBeNull();
  });

  it("starts the photo filter on the selected tile date", () => {
    expect(mymap.dimData.timeline.photoDate).toBe(mymap.dimData.timeline.date);
  });

  it("gives a photo-only date its own row", () => {
    const rows = document.querySelectorAll(".timeline-photo-div");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("3枚");
  });

  it("does not give a tile date a second row", () => {
    // 20240101 has both tiles and photos: the radio it already has is enough.
    const rows = [...document.querySelectorAll(".timeline-photo-div")];
    expect(rows.some((r) => r.textContent.includes("20240101"))).toBe(false);
  });

  it("counts every photo in the month summary, row or no row", () => {
    const summaries = [...document.querySelectorAll(".timeline-details-summary")]
      .map((e) => e.innerHTML)
      .filter((h) => h.includes("📷"));
    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries.some((h) => h.includes("(📷5)"))).toBe(true);
  });

  it("draws no pins until the photos tab is opened", () => {
    expect(document.querySelectorAll(".photo-pin")).toHaveLength(0);
    expect(mymap.dimData.visibleLayers.has(102)).toBe(false);
  });

  it("draws pins as soon as the photos tab is opened", async () => {
    mymap.sidebar.open("photos");
    await mymap.photosApplied;
    expect(document.querySelectorAll(".photo-pin").length).toBeGreaterThan(0);
  });

  it("counts a tile date's own photos on its row", () => {
    // 20240101 has two photos and tiles of its own. Before this, the only rows
    // advertising photos were the ones with no tiles, which read as though a
    // mapping day never has screenshots.
    const label = document.querySelector(
      `label[for="map-timeline-20240101"]`
    );
    expect(label.innerHTML).toContain("(📷2)");
  });

  it("leaves a date with no photos unadorned", () => {
    const label = document.querySelector(
      `label[for="map-timeline-20240201"]`
    );
    expect(label.innerHTML).not.toContain("📷");
  });

  it("a photo-only row keeps the terrain on the nearest earlier tile date", async () => {
    await document.querySelector(".timeline-photo-div").onclick();
    expect(mymap.dimData.timeline.photoDate).toBe("20240115");
    expect(mymap.dimData.timeline.date).toBe("20240101");
  });

  it("marks the photo row it selected", () => {
    expect(
      document.querySelector(".timeline-photo-div").classList.contains(
        "timeline-photo-current"
      )
    ).toBe(true);
  });

  it("setTimelineDate pairs a photo with the terrain of its day", async () => {
    await mymap.setTimelineDate("20240201");
    expect(mymap.dimData.timeline.photoDate).toBe("20240201");
    expect(mymap.dimData.timeline.date).toBe("20240201");
    expect(document.getElementById("map-timeline-20240201").checked).toBe(true);
  });

  it("scrubbing back to before the first photo empties the map", async () => {
    document.getElementById("timeline-checkbox-exact").checked = true;
    await document.getElementById("timeline-checkbox-exact").onchange();
    await mymap.setTimelineDate("20240201");
    expect(document.querySelectorAll(".photo-pin")).toHaveLength(0);
  });

  it("carries the photo date into the permalink hash", () => {
    expect(mymap.hashObj.dD.o.h.p).toBeDefined();
  });

  it("keeps photos up past a tab close when told to persist", async () => {
    const persist = document.getElementById("photos-persist");
    persist.checked = true;
    await persist.onchange();
    expect(mymap.dimData.visibleLayers.has(102)).toBe(true);
    mymap.sidebar.close();
    await mymap.photosApplied;
    expect(mymap.hasLayer(mymap.layerCache[102].dataLayer)).toBe(true);

    persist.checked = false;
    await persist.onchange();
    expect(mymap.hasLayer(mymap.layerCache[102].dataLayer)).toBe(false);
    expect(mymap.dimData.visibleLayers.has(102)).toBe(false);
  });
});
