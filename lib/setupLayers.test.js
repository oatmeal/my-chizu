import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `setupLayers.js` talks to Leaflet and the DOM through globals, and caches
 * marker icon classes at module scope. These tests stub both globals and
 * re-import the module for each test so the icon cache starts empty.
 *
 * `mcUnproject` is the identity here, so an asserted coordinate is the
 * Minecraft coordinate after `dimScale` — which is the thing worth checking.
 */

let created;
let styles;

/** Record every Leaflet object the module builds, in creation order. */
function stubLeaflet() {
  created = { markers: [], polylines: [], groups: [] };
  styles = [];

  const layerStub = (record) => ({
    ...record,
    bindPopup(content) {
      record.popup = typeof content === "string" ? content : content.innerHTML;
      return this;
    },
    setZIndexOffset(n) {
      record.zIndexOffset = n;
    },
  });

  globalThis.L = {
    featureGroup(initial) {
      const group = { added: [...initial], addLayer: (l) => group.added.push(l) };
      created.groups.push(group);
      return group;
    },
    marker(latlng, opts) {
      const record = { latlng, iconClass: opts.icon.className };
      created.markers.push(record);
      return layerStub(record);
    },
    polyline(pts, opts) {
      const record = { pts, ...opts };
      created.polylines.push(record);
      return layerStub(record);
    },
    Icon: {
      Default: {
        extend({ options }) {
          return function Icon() {
            this.className = options.className;
          };
        },
      },
    },
  };

  globalThis.document = {
    head: { appendChild: (el) => el },
    // The module creates <style> elements for icon hues and <div>s for popup
    // bodies, and sets innerHTML on both — so only the style tags are recorded.
    createElement: (tag) => ({
      set innerHTML(value) {
        this._html = value;
        if (tag === "style") styles.push(value);
      },
      get innerHTML() {
        return this._html;
      },
    }),
  };
}

/** Import a fresh copy of the module, with `data` as the only fetchable layer. */
async function loadModule(data) {
  vi.resetModules();
  stubLeaflet();
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ json: () => Promise.resolve(data) })
  );
  return import("./setupLayers.js");
}

/** Run `setupLayer` via its only public entry point and return the cache slot. */
async function loadLayer(data, { dim = "o", url = "data/x.json", fraction = 0 } = {}) {
  const mod = await loadModule(data);
  const mymap = {
    dim,
    mcUnproject: ([x, z]) => [x, z],
    layerCache: { L1: { url, fraction } },
  };
  await mod.ensureLayerLoaded(mymap, "L1");
  return { mod, mymap, cached: mymap.layerCache.L1 };
}

const MARKER_LAYER = {
  id: 1,
  name: "レイヤー",
  markers: [{ name: "拠点", pos: [100, 64, -200] }],
};

const LINE_LAYER = {
  id: 2,
  name: "線",
  lines: [{ name: "道", pts: [[10, 64, 20], [30, 64, 40]] }],
};

beforeEach(() => {
  created = undefined;
  styles = undefined;
});

describe("setupLayer content dispatch", () => {
  it("builds markers for a layer that only has markers", async () => {
    await loadLayer(MARKER_LAYER);
    expect(created.markers).toHaveLength(1);
    expect(created.polylines).toHaveLength(0);
  });

  it("builds polylines for a layer that only has lines", async () => {
    await loadLayer(LINE_LAYER);
    expect(created.polylines).toHaveLength(1);
    expect(created.markers).toHaveLength(0);
  });

  it("builds both when a layer carries both", async () => {
    await loadLayer({ ...MARKER_LAYER, ...LINE_LAYER });
    expect(created.markers).toHaveLength(1);
    expect(created.polylines).toHaveLength(1);
  });

  it("builds an empty group for a layer with no drawable content", async () => {
    const { cached } = await loadLayer({ id: 3, name: "空" });
    expect(created.markers).toHaveLength(0);
    expect(created.polylines).toHaveLength(0);
    expect(cached.dataLayer.added).toHaveLength(0);
  });

  it("adds everything it builds to the layer's feature group", async () => {
    const { cached } = await loadLayer({ ...MARKER_LAYER, ...LINE_LAYER });
    expect(cached.dataLayer.added).toHaveLength(2);
  });

  it("returns the parsed layer data alongside the group", async () => {
    const { cached } = await loadLayer(MARKER_LAYER);
    expect(cached.data.name).toBe("レイヤー");
  });
});

describe("dimension scaling", () => {
  it("leaves overworld coordinates alone", async () => {
    await loadLayer(MARKER_LAYER, { dim: "o" });
    expect(created.markers[0].latlng).toEqual([100, -200]);
  });

  it("leaves end coordinates alone", async () => {
    await loadLayer(MARKER_LAYER, { dim: "e" });
    expect(created.markers[0].latlng).toEqual([100, -200]);
  });

  it("scales nether marker coordinates by 8", async () => {
    await loadLayer(MARKER_LAYER, { dim: "n" });
    expect(created.markers[0].latlng).toEqual([800, -1600]);
  });

  it("scales nether line coordinates by 8", async () => {
    await loadLayer(LINE_LAYER, { dim: "n" });
    expect(created.polylines[0].pts).toEqual([
      [80, 160],
      [240, 320],
    ]);
  });

  it("drops the Y coordinate, which the map has no axis for", async () => {
    await loadLayer(LINE_LAYER);
    expect(created.polylines[0].pts).toEqual([
      [10, 20],
      [30, 40],
    ]);
  });
});

describe("marker popups", () => {
  it("shows the unscaled Minecraft coordinates, including Y", async () => {
    await loadLayer(MARKER_LAYER, { dim: "n" });
    // The marker sits at the scaled position, but the popup quotes the
    // coordinates a player would actually type.
    expect(created.markers[0].popup).toContain("拠点");
    expect(created.markers[0].popup).toContain("[X=100, Y=64, Z=-200]");
  });

  it("labels a line with its own name", async () => {
    await loadLayer(LINE_LAYER);
    expect(created.polylines[0].popup).toBe("道");
  });

  it("falls back to the layer name for an unnamed line", async () => {
    await loadLayer({ id: 2, name: "線レイヤー", lines: [{ pts: [[0, 0, 0]] }] });
    expect(created.polylines[0].popup).toBe("線レイヤー");
  });
});

describe("per-layer styling", () => {
  it("injects one hue-rotate rule and points the icon at its class", async () => {
    await loadLayer(MARKER_LAYER, { fraction: 0.25 });
    expect(styles).toHaveLength(1);
    expect(styles[0]).toContain("hue-rotate(0.25turn)");
    expect(created.markers[0].iconClass).toBe("layer-icon-0p25");
  });

  it("injects the rule only once for repeated markers of one layer", async () => {
    await loadLayer({
      id: 1,
      name: "多",
      markers: [
        { name: "a", pos: [0, 0, 0] },
        { name: "b", pos: [1, 0, 1] },
      ],
    });
    expect(created.markers).toHaveLength(2);
    expect(styles).toHaveLength(1);
  });

  it("injects no style for a layer with no markers", async () => {
    await loadLayer(LINE_LAYER);
    expect(styles).toHaveLength(0);
  });

  it("derives the polyline colour from the layer's fraction", async () => {
    await loadLayer(LINE_LAYER, { fraction: 0.5 });
    expect(created.polylines[0].color).toBe("hsla(395, 100%, 60%, 1)");
  });

  it("lets a line's own options override the derived colour", async () => {
    await loadLayer({
      id: 2,
      name: "線",
      lines: [{ name: "赤", pts: [[0, 0, 0]], color: "red", dashArray: "4" }],
    });
    expect(created.polylines[0].color).toBe("red");
    expect(created.polylines[0].dashArray).toBe("4");
  });
});

describe("z-index HACK", () => {
  // Reaching into the data repo's filenames from the engine; a `zIndex` field
  // on the layer JSON would do this properly. Pinned so a refactor keeps it.
  it("raises gate markers above the rest", async () => {
    await loadLayer(MARKER_LAYER, { url: "data/overworld/gate.json" });
    expect(created.markers[0].zIndexOffset).toBe(1000);
  });

  it("raises bastion markers above the rest", async () => {
    await loadLayer(MARKER_LAYER, { url: "data/nether/bastion.json" });
    expect(created.markers[0].zIndexOffset).toBe(1000);
  });

  it("leaves every other layer at the default", async () => {
    await loadLayer(MARKER_LAYER, { url: "data/overworld/sikatetudou.json" });
    expect(created.markers[0].zIndexOffset).toBeUndefined();
  });
});

describe("ensureLayerLoaded", () => {
  it("fetches the layer once and keeps its panel state", async () => {
    const { mod, mymap, cached } = await loadLayer(MARKER_LAYER);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(cached.url).toBe("data/x.json");

    await mod.ensureLayerLoaded(mymap, "L1");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(created.markers).toHaveLength(1);
  });

  it("carries the checkbox element through the load", async () => {
    const mod = await loadModule(MARKER_LAYER);
    const check = { id: "map-layer-1" };
    const mymap = {
      dim: "o",
      mcUnproject: ([x, z]) => [x, z],
      layerCache: { L1: { url: "data/x.json", fraction: 0, check } },
    };
    await mod.ensureLayerLoaded(mymap, "L1");
    expect(mymap.layerCache.L1.check).toBe(check);
  });
});
