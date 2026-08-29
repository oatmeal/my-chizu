// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `setupPhotos.js` talks to Leaflet through a global and builds real DOM for
 * the lightbox and the pane, so these run under jsdom with only Leaflet stubbed.
 *
 * `mcUnproject` is the identity and `project` scales by the zoom, so an
 * asserted pin position is the Minecraft coordinate after `dimScale` -- which
 * is the thing worth checking -- and clustering can be driven by zoom the way
 * the real map drives it.
 */

let created;

function stubLeaflet() {
  created = { markers: [], groups: [] };
  globalThis.L = {
    // The panel's "zoom to layer" button walks the group asking each child for
    // its bounds, so the photo group has to be one that can answer.
    featureGroup(initial) {
      const group = {
        layers: [...initial],
        addLayer: (l) => group.layers.push(l),
        clearLayers: () => (group.layers.length = 0),
        getBounds: () => ({ isValid: () => group.layers.length > 0 }),
      };
      created.groups.push(group);
      return group;
    },
    layerGroup(initial) {
      const group = {
        layers: [...initial],
        addLayer: (l) => group.layers.push(l),
        clearLayers: () => (group.layers.length = 0),
      };
      created.groups.push(group);
      return group;
    },
    divIcon: (options) => options,
    marker(latlng, { icon }) {
      const record = { latlng, icon, handlers: {} };
      record.on = (event, fn) => (record.handlers[event] = fn);
      created.markers.push(record);
      return record;
    },
  };
}

/** A map stubbed down to what the photo layer actually reaches for. */
function stubMap({ dim = "o", date = "20230101", exact = false, fill = false } = {}) {
  const listeners = {};
  const mymap = {
    dim,
    dimData: {
      timeline: { date, photoDate: date, exact, fill },
      // The pane switches photos on by id, so it reads the dimension's layer
      // list and picks out the ones the build marked `kind: "photos"`.
      layers: [{ id: 102, name: "スクリーンショット", kind: "photos" }],
      visibleLayers: new Set(),
    },
    formatDate: (d) => `${d}日`,
    // What the permalink is built from: the page it is on, and the hash state
    // the rest of the app keeps up to date.
    url: { origin: "https://example.test", pathname: "/map/" },
    hashObj: { d: dim, dD: { [dim]: { c: { X: 0, Z: 0, z: 4 }, v: [], h: {} } } },
    layerCache: {},
    hasLayer: () => true,
    getZoom: () => 4,
    // L.CRS.Simple projects lng/lat by 2^zoom; the identity mcUnproject above
    // means a photo's Minecraft X/Z arrive here directly.
    project: ([x, z], zoom) => ({ x: x * 2 ** zoom, y: z * 2 ** zoom }),
    mcUnproject: ([x, z]) => [x, z],
    on(events, fn) {
      for (const e of events.split(" ")) (listeners[e] ||= []).push(fn);
    },
    fire(event, arg) {
      for (const fn of listeners[event] || []) fn(arg);
    },
    panTo: vi.fn(),
    getBounds: () => ({ contains: () => true }),
    setTimelineDate: vi.fn(),
    sidebar: {
      on(event, fn) {
        (listeners[`sidebar:${event}`] ||= []).push(fn);
      },
      fire(event, arg) {
        for (const fn of listeners[`sidebar:${event}`] || []) fn(arg);
      },
    },
  };
  return mymap;
}

function stubDataLayer() {
  const handlers = {};
  return {
    layers: [],
    addLayer(l) {
      this.layers.push(l);
    },
    on: (event, fn) => (handlers[event] = fn),
    fire: (event) => handlers[event]?.(),
  };
}

const photo = (date, f, pos = [100, 64, 200]) => ({ f, date, pos, src: "filename" });

const LAYER = {
  id: 102,
  name: "スクリーンショット",
  kind: "photos",
  photos: [
    photo("20220101", "a", [100, 64, 200]),
    photo("20230101", "b", [100, 64, 200]),
    photo("20240101", "c", [90000, 64, 90000]),
  ],
};

async function load() {
  vi.resetModules();
  stubLeaflet();
  document.body.innerHTML =
    `<input type="checkbox" id="photos-persist">` +
    `<div id="photos-status"></div><div id="photos-list"></div>`;
  return import("./setupPhotos.js");
}

beforeEach(() => {
  created = undefined;
  delete globalThis.photosConfig;
});

describe("renderPhotos", () => {
  it("draws one pin per cluster, not per photo", async () => {
    const { renderPhotos } = await load();
    const mymap = stubMap({ date: "20240101" });
    renderPhotos(mymap, LAYER, stubDataLayer());
    // Two photos share a position; the third is far away.
    expect(created.markers).toHaveLength(2);
  });

  it("badges a cluster with its photo count and leaves a lone pin bare", async () => {
    const { renderPhotos } = await load();
    renderPhotos(stubMap({ date: "20240101" }), LAYER, stubDataLayer());
    const html = created.markers.map((m) => m.icon.html);
    expect(html.filter((h) => h.includes("photo-pin-count"))).toHaveLength(1);
    expect(html.find((h) => h.includes("photo-pin-count"))).toContain(">2<");
  });

  it("obeys the timeline's before mode", async () => {
    const { renderPhotos } = await load();
    renderPhotos(stubMap({ date: "20220601" }), LAYER, stubDataLayer());
    expect(created.markers).toHaveLength(1);
  });

  it("obeys the timeline's exact mode", async () => {
    const { renderPhotos } = await load();
    renderPhotos(
      stubMap({ date: "20230101", exact: true }),
      LAYER,
      stubDataLayer()
    );
    expect(created.markers).toHaveLength(1);
    expect(created.markers[0].icon.html).not.toContain("photo-pin-count");
  });

  it("dims a photo that postdates the selection in fill mode", async () => {
    const { renderPhotos } = await load();
    renderPhotos(
      stubMap({ date: "20220601", fill: true }),
      LAYER,
      stubDataLayer()
    );
    const dim = created.markers.filter((m) => m.icon.className.includes("photo-pin-dim"));
    // The far-away 2024 photo is alone in its cluster and entirely in the future.
    expect(dim).toHaveLength(1);
  });

  it("shows a photo's thumbnail, not its full image", async () => {
    const { renderPhotos } = await load();
    renderPhotos(stubMap({ date: "20240101" }), LAYER, stubDataLayer());
    expect(created.markers[0].icon.html).toContain("photos/thumb/");
  });

  it("follows a site.json override of where the photos live", async () => {
    const { renderPhotos } = await load();
    globalThis.photosConfig = {
      baseUrl: "https://example.test/p/",
      thumbUrl: "https://example.test/p/t/",
    };
    renderPhotos(stubMap({ date: "20240101" }), LAYER, stubDataLayer());
    expect(created.markers[0].icon.html).toContain("https://example.test/p/t/");
  });

  it("redraws when the timeline changes", async () => {
    const { renderPhotos } = await load();
    const mymap = stubMap({ date: "20220101" });
    renderPhotos(mymap, LAYER, stubDataLayer());
    expect(created.markers).toHaveLength(1);

    mymap.dimData.timeline.date = "20240101";
    mymap.dimData.timeline.photoDate = "20240101";
    mymap.fire("timelinechange");
    expect(created.markers).toHaveLength(3); // 1 from before + 2 redrawn
    expect(created.groups[0].layers).toHaveLength(2);
  });

  it("builds a group that can report its own bounds", async () => {
    // The layers panel's "zoom to this layer" button needs this; a plain
    // layer group cannot answer it and throws.
    const { renderPhotos } = await load();
    renderPhotos(stubMap({ date: "20240101" }), LAYER, stubDataLayer());
    expect(typeof created.groups[0].getBounds).toBe("function");
  });

  it("empties itself when the layer is switched off", async () => {
    const { renderPhotos } = await load();
    const dataLayer = stubDataLayer();
    renderPhotos(stubMap({ date: "20240101" }), LAYER, dataLayer);
    expect(created.groups[0].layers).toHaveLength(2);
    dataLayer.fire("remove");
    expect(created.groups[0].layers).toHaveLength(0);
  });
});

describe("dimension independence", () => {
  // The rule the whole design rests on: no code branches on dimension, so a
  // `data/nether/photos.json` is a data change and nothing else.
  it("leaves overworld positions alone", async () => {
    const { renderPhotos } = await load();
    renderPhotos(stubMap({ dim: "o", date: "20240101" }), LAYER, stubDataLayer());
    expect(created.markers.map((m) => m.latlng)).toContainEqual([100, 200]);
  });

  it("scales nether positions by 8, the way markers already are", async () => {
    const { renderPhotos } = await load();
    renderPhotos(stubMap({ dim: "n", date: "20240101" }), LAYER, stubDataLayer());
    expect(created.markers.map((m) => m.latlng)).toContainEqual([800, 1600]);
  });

  it("leaves end positions alone", async () => {
    const { renderPhotos } = await load();
    renderPhotos(stubMap({ dim: "e", date: "20240101" }), LAYER, stubDataLayer());
    expect(created.markers.map((m) => m.latlng)).toContainEqual([100, 200]);
  });
});

describe("lightbox", () => {
  async function openFirstPin() {
    const { renderPhotos } = await load();
    const mymap = stubMap({ date: "20240101" });
    renderPhotos(mymap, LAYER, stubDataLayer());
    const cluster = created.markers.find((m) => m.icon.html.includes("photo-pin-count"));
    cluster.handlers.click();
    return mymap;
  }

  it("opens on a pin click", async () => {
    await openFirstPin();
    expect(document.getElementById("photo-lightbox").hidden).toBe(false);
  });

  it("captions the photo it opened on", async () => {
    await openFirstPin();
    expect(document.getElementById("photo-lightbox-caption").textContent).toContain(
      "20230101日"
    );
  });

  it("walks the whole cluster with the arrow keys", async () => {
    await openFirstPin();
    const caption = document.getElementById("photo-lightbox-caption");
    expect(caption.textContent).toContain("20230101日");
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(caption.textContent).toContain("20220101日");
  });

  it("wraps around rather than dead-ending", async () => {
    await openFirstPin();
    const caption = document.getElementById("photo-lightbox-caption");
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(caption.textContent).toContain("20220101日");
  });

  it("hides its arrows for a single photo", async () => {
    const { renderPhotos } = await load();
    const mymap = stubMap({ date: "20240101" });
    renderPhotos(mymap, LAYER, stubDataLayer());
    created.markers.find((m) => !m.icon.html.includes("photo-pin-count")).handlers.click();
    expect(document.getElementById("photo-lightbox-prev").hidden).toBe(true);
  });

  it("closes on Escape", async () => {
    await openFirstPin();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.getElementById("photo-lightbox").hidden).toBe(true);
  });

  it("sets the timeline to the open photo's date", async () => {
    const mymap = await openFirstPin();
    document.getElementById("photo-lightbox-date").click();
    expect(mymap.setTimelineDate).toHaveBeenCalledWith("20230101");
    expect(document.getElementById("photo-lightbox").hidden).toBe(true);
  });
});

describe("photos pane", () => {
  async function openPane(options) {
    const mod = await load();
    const mymap = stubMap(options);
    mod.setupPhotoPanel(mymap);
    mod.renderPhotos(mymap, LAYER, stubDataLayer());
    mymap.sidebar.fire("content", { id: "photos" });
    // Opening the tab is a synchronous event that starts an asynchronous layer
    // load; the pane publishes the promise so callers can wait for the pins.
    await mymap.photosApplied;
    return mymap;
  }

  it("lists every photo in the viewport", async () => {
    await openPane({ date: "20240101" });
    expect(document.querySelectorAll(".photos-item")).toHaveLength(3);
  });

  it("lists newest first", async () => {
    await openPane({ date: "20240101" });
    const labels = [...document.querySelectorAll(".photos-item span")].map(
      (e) => e.textContent
    );
    expect(labels).toEqual(["20240101日", "20230101日", "20220101日"]);
  });

  it("obeys the timeline like the pins do", async () => {
    await openPane({ date: "20220601" });
    expect(document.querySelectorAll(".photos-item")).toHaveLength(1);
  });

  it("says so when the viewport holds nothing", async () => {
    await openPane({ date: "20210101" });
    expect(document.getElementById("photos-status").textContent).toContain("ありません");
  });

  it("does nothing until its tab is opened", async () => {
    const mod = await load();
    const mymap = stubMap({ date: "20240101" });
    mod.setupPhotoPanel(mymap);
    mod.renderPhotos(mymap, LAYER, stubDataLayer());
    mymap.fire("moveend");
    expect(document.querySelectorAll(".photos-item")).toHaveLength(0);
  });

  it("re-filters as the map moves", async () => {
    const mymap = await openPane({ date: "20240101" });
    let contains = true;
    mymap.getBounds = () => ({ contains: () => contains });
    contains = false;
    mymap.fire("moveend");
    expect(document.querySelectorAll(".photos-item")).toHaveLength(0);
  });

  it("flies to a photo and opens it", async () => {
    const mymap = await openPane({ date: "20240101" });
    document.querySelector(".photos-item").click();
    expect(mymap.panTo).toHaveBeenCalled();
    expect(document.getElementById("photo-lightbox").hidden).toBe(false);
  });

  it("says so in a dimension that has no photos at all", async () => {
    const mod = await load();
    const mymap = stubMap({ date: "20240101" });
    mymap.dimData.layers = [];
    mod.setupPhotoPanel(mymap);
    mymap.sidebar.fire("content", { id: "photos" });
    await mymap.photosApplied;
    expect(document.getElementById("photos-status").textContent).toContain(
      "この次元にはスクリーンショットがありません"
    );
  });

  it("closes the pane and stops listing", async () => {
    const mymap = await openPane({ date: "20240101" });
    mymap.sidebar.fire("closing");
    await mymap.photosApplied;
    mymap.fire("moveend");
    // The list is left as it was, but nothing redraws it any more.
    expect(mymap.dimData.visibleLayers.has(102)).toBe(false);
  });
});

describe("who switches photos on", () => {
  /**
   * Photos are not one overlay among many, so they are not in the layers panel.
   * Opening the photos tab turns them on and closing it turns them off, and the
   * checkbox in the tab is for people who want to browse with the pins up.
   */
  async function panel(options = {}) {
    const mod = await load();
    const mymap = stubMap({ date: "20240101", ...options });
    const dataLayer = stubDataLayer();
    let onMap = false;
    dataLayer.addTo = () => (onMap = true);
    dataLayer.remove = () => (onMap = false);
    mymap.layerCache[102] = { dataLayer };
    mymap.hasLayer = () => onMap;
    const loaded = [];
    mod.setupPhotoPanel(mymap, async (_, id) => loaded.push(id));
    mod.renderPhotos(mymap, LAYER, dataLayer);
    return { mymap, loaded, isOn: () => onMap };
  }

  it("puts photos on the map when the tab opens", async () => {
    const { mymap, isOn, loaded } = await panel();
    expect(isOn()).toBe(false);
    mymap.sidebar.fire("content", { id: "photos" });
    await mymap.photosApplied;
    expect(isOn()).toBe(true);
    expect(loaded).toEqual([102]);
  });

  it("takes them off again when the tab closes", async () => {
    const { mymap, isOn } = await panel();
    mymap.sidebar.fire("content", { id: "photos" });
    await mymap.photosApplied;
    mymap.sidebar.fire("closing");
    await mymap.photosApplied;
    expect(isOn()).toBe(false);
  });

  it("takes them off when another tab is opened", async () => {
    const { mymap, isOn } = await panel();
    mymap.sidebar.fire("content", { id: "photos" });
    await mymap.photosApplied;
    mymap.sidebar.fire("content", { id: "timeline" });
    await mymap.photosApplied;
    expect(isOn()).toBe(false);
  });

  it("keeps them up past a close when asked to persist", async () => {
    const { mymap, isOn } = await panel();
    const persist = document.getElementById("photos-persist");
    persist.checked = true;
    await persist.onchange();
    expect(isOn()).toBe(true);
    mymap.sidebar.fire("closing");
    await mymap.photosApplied;
    expect(isOn()).toBe(true);
  });

  it("rides the permalink through visibleLayers, so a link reproduces it", async () => {
    const { mymap } = await panel();
    const persist = document.getElementById("photos-persist");
    persist.checked = true;
    await persist.onchange();
    expect(mymap.dimData.visibleLayers.has(102)).toBe(true);
    persist.checked = false;
    await persist.onchange();
    expect(mymap.dimData.visibleLayers.has(102)).toBe(false);
  });

  it("ticks itself for an incoming permalink that had photos on", async () => {
    const { mymap, isOn } = await panel();
    mymap.dimData.visibleLayers.add(102);
    mymap.fire("dimviewready");
    await mymap.photosApplied;
    expect(document.getElementById("photos-persist").checked).toBe(true);
    expect(isOn()).toBe(true);
  });

  it("carries the preference into the next dimension", async () => {
    const { mymap, isOn } = await panel();
    // The initial load seeds the checkbox from the hash; ticking it comes after.
    mymap.fire("dimviewready");
    await mymap.photosApplied;
    const persist = document.getElementById("photos-persist");
    persist.checked = true;
    await persist.onchange();
    // A dimension switch lands on a fresh visibleLayers set.
    mymap.dimData.visibleLayers = new Set();
    mymap.fire("dimviewready");
    await mymap.photosApplied;
    expect(isOn()).toBe(true);
    expect(mymap.dimData.visibleLayers.has(102)).toBe(true);
  });
});

describe("pin ↔ row highlighting", () => {
  /** Hovering either rendering of a photo has to point at the other one. */
  async function paneAndPins() {
    const mod = await load();
    const mymap = stubMap({ date: "20240101" });
    mod.setupPhotoPanel(mymap);
    mod.renderPhotos(mymap, LAYER, stubDataLayer());
    mymap.sidebar.fire("content", { id: "photos" });
    await mymap.photosApplied;
    return mymap;
  }

  it("marks the rows a hovered pin stands for", async () => {
    await paneAndPins();
    const cluster = created.markers.find((m) => m.icon.html.includes("photo-pin-count"));
    cluster.handlers.mouseover();
    // The cluster holds the two photos that share a position, not the far one.
    expect(document.querySelectorAll(".photos-item-highlight")).toHaveLength(2);
  });

  it("clears the marks when the cursor leaves", async () => {
    await paneAndPins();
    const cluster = created.markers.find((m) => m.icon.html.includes("photo-pin-count"));
    cluster.handlers.mouseover();
    cluster.handlers.mouseout();
    expect(document.querySelectorAll(".photos-item-highlight")).toHaveLength(0);
  });

  it("lifts the pin holding a hovered row out of the stack", async () => {
    const mymap = await paneAndPins();
    const offsets = [];
    for (const marker of created.markers) {
      marker.setZIndexOffset = (n) => offsets.push(n);
    }
    document.querySelector(".photos-item").dispatchEvent(
      new window.MouseEvent("mouseenter")
    );
    // Exactly one of the two pins is raised; the other is pushed back down.
    expect(offsets.filter((n) => n > 0)).toHaveLength(1);
    expect(offsets.filter((n) => n === 0)).toHaveLength(1);
  });
});

describe("lightbox filmstrip", () => {
  async function openCluster() {
    const { renderPhotos } = await load();
    const mymap = stubMap({ date: "20240101" });
    renderPhotos(mymap, LAYER, stubDataLayer());
    created.markers.find((m) => m.icon.html.includes("photo-pin-count")).handlers.click();
    return mymap;
  }

  it("shows a thumbnail per photo in the cluster", async () => {
    await openCluster();
    expect(document.querySelectorAll(".photo-lightbox-thumb")).toHaveLength(2);
  });

  it("marks the thumbnail of the photo on screen", async () => {
    await openCluster();
    const current = document.querySelectorAll(".photo-lightbox-thumb-current");
    expect(current).toHaveLength(1);
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(document.querySelectorAll(".photo-lightbox-thumb-current")).toHaveLength(1);
    expect(document.querySelectorAll(".photo-lightbox-thumb")[1].classList).toContain(
      "photo-lightbox-thumb-current"
    );
  });

  it("jumps to a photo when its thumbnail is clicked", async () => {
    await openCluster();
    document.querySelectorAll(".photo-lightbox-thumb")[1].click();
    expect(
      document.getElementById("photo-lightbox-caption").textContent
    ).toContain("20220101日");
  });

  it("stays out of the way for a lone photo", async () => {
    const { renderPhotos } = await load();
    renderPhotos(stubMap({ date: "20240101" }), LAYER, stubDataLayer());
    created.markers.find((m) => !m.icon.html.includes("photo-pin-count")).handlers.click();
    expect(document.getElementById("photo-lightbox-strip").hidden).toBe(true);
  });

  it("keeps the caption bar attached to the photo, not to the screen", async () => {
    await openCluster();
    const frame = document.getElementById("photo-lightbox-frame");
    expect(frame.contains(document.getElementById("photo-lightbox-image"))).toBe(true);
    expect(frame.contains(document.getElementById("photo-lightbox-bar"))).toBe(true);
    expect(frame.contains(document.getElementById("photo-lightbox-strip"))).toBe(true);
  });
});

describe("a cluster the timeline has split", () => {
  it("writes the split into the badge instead of folding it away", async () => {
    // Two photos share a position: one from before the selection, one after.
    // The old badge read "2" on a bright pin, which said nothing about the fact
    // that half of it had not been taken yet.
    const { renderPhotos } = await load();
    renderPhotos(stubMap({ date: "20220601", fill: true }), LAYER, stubDataLayer());
    const split = created.markers.find((m) => m.icon.html.includes("photo-pin-count"));
    expect(split.icon.html).toContain("photo-pin-count-later");
    expect(split.icon.html).toContain("+1");
    expect(split.icon.className).not.toContain("photo-pin-dim");
  });

  it("shows the photo that exists, not the newest one", async () => {
    const { renderPhotos } = await load();
    renderPhotos(stubMap({ date: "20220601", fill: true }), LAYER, stubDataLayer());
    const split = created.markers.find((m) => m.icon.html.includes("photo-pin-count"));
    // "a" is the 2022 photo; "b" is the 2023 one the timeline has not reached.
    expect(split.icon.html).toContain("photos/thumb/a.webp");
  });

  it("opens the lightbox on that photo", async () => {
    const { renderPhotos } = await load();
    renderPhotos(stubMap({ date: "20220601", fill: true }), LAYER, stubDataLayer());
    created.markers.find((m) => m.icon.html.includes("photo-pin-count")).handlers.click();
    expect(
      document.getElementById("photo-lightbox-caption").textContent
    ).toContain("20220101日");
  });
});

describe("a permalink to one photo", () => {
  /** What the copy button in the lightbox produces, parsed back out. */
  function copiedHash() {
    const copied = navigator.clipboard.writeText.mock.calls.at(-1)[0];
    const [, hash] = copied.split("#");
    return Object.fromEntries(
      hash.split("&").map((pair) => {
        const [key, value] = pair.split("=");
        return [key, JSON.parse(decodeURIComponent(value))];
      })
    );
  }

  async function copyFromCluster(options) {
    const { renderPhotos } = await load();
    const mymap = stubMap({ date: "20240101", ...options });
    renderPhotos(mymap, LAYER, stubDataLayer());
    // The cluster where there is one; in exact mode the two photos sharing a
    // position are no longer on screen together.
    const pin =
      created.markers.find((m) => m.icon.html.includes("photo-pin-count")) ??
      created.markers[0];
    pin.handlers.click();
    document.getElementById("photo-lightbox-link").click();
    // The click awaits the clipboard write, so let its microtasks drain.
    await Promise.resolve();
    await Promise.resolve();
    return mymap;
  }

  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("names the photo on screen, not the pin it was opened from", async () => {
    await copyFromCluster();
    // The pin leads with "b", the newest of the two; walking on has to move the
    // link with it, or a link is only ever to the top of a stack.
    expect(copiedHash().ph).toBe("b");
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight" }));
    document.getElementById("photo-lightbox-link").click();
    await Promise.resolve();
    await Promise.resolve();
    expect(copiedHash().ph).toBe("a");
  });

  it("centres on the photo rather than on wherever the map was", async () => {
    await copyFromCluster();
    expect(copiedHash().dD.o.c).toEqual({ X: 100, Z: 200, z: 4 });
  });

  it("quotes nether positions in the frame the hash uses", async () => {
    await copyFromCluster({ dim: "n" });
    expect(copiedHash().dD.n.c).toEqual({ X: 800, Z: 1600, z: 4 });
  });

  it("carries the timeline, so the photo is still there on arrival", async () => {
    await copyFromCluster({ date: "20230101", exact: true });
    expect(copiedHash().dD.o.h).toEqual({
      d: "20230101",
      e: true,
      f: false,
      p: "20230101",
    });
  });

  it("says so when the clipboard refuses", async () => {
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("nope")) },
      configurable: true,
    });
    await copyFromCluster();
    expect(document.getElementById("photo-lightbox-link").textContent).toBe(
      "コピーできませんでした"
    );
  });

  it("confirms in the button, then goes back to offering", async () => {
    vi.useFakeTimers();
    try {
      await copyFromCluster();
      const button = document.getElementById("photo-lightbox-link");
      expect(button.textContent).toBe("コピーしました");
      vi.advanceTimersByTime(1500);
      expect(button.textContent).toBe("リンクをコピー");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops the confirmation when the photo changes under it", async () => {
    await copyFromCluster();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(document.getElementById("photo-lightbox-link").textContent).toBe(
      "リンクをコピー"
    );
  });
});

describe("arriving on a photo permalink", () => {
  /** The load path: a hash naming a photo, and a layer that has to be drawn. */
  async function arrive(ph) {
    const mod = await load();
    const mymap = stubMap({ date: "20240101" });
    const dataLayer = stubDataLayer();
    let onMap = false;
    // Going on the map fires "add", which is what makes the layer draw its
    // pins -- and the pins are what a photo permalink has to find.
    dataLayer.addTo = () => {
      onMap = true;
      dataLayer.fire("add");
    };
    dataLayer.remove = () => {
      onMap = false;
      dataLayer.fire("remove");
    };
    mymap.layerCache[102] = { dataLayer };
    mymap.hasLayer = () => onMap;
    mymap.hashObj.ph = ph;
    mod.setupPhotoPanel(mymap, async () => {});
    mod.renderPhotos(mymap, LAYER, dataLayer);
    mymap.fire("dimviewready");
    await mymap.photosApplied;
    return { mymap, isOn: () => onMap };
  }

  it("opens the lightbox on the photo the hash names", async () => {
    await arrive("a");
    expect(document.getElementById("photo-lightbox").hidden).toBe(false);
    expect(document.getElementById("photo-lightbox-caption").textContent).toContain(
      "20220101日"
    );
  });

  it("opens the whole pin, so the stack it sits in is walkable", async () => {
    await arrive("a");
    expect(document.querySelectorAll(".photo-lightbox-thumb")).toHaveLength(2);
  });

  it("switches the pins on even though the sender had them off", async () => {
    const { mymap, isOn } = await arrive("a");
    expect(document.getElementById("photos-persist").checked).toBe(true);
    expect(isOn()).toBe(true);
    expect(mymap.dimData.visibleLayers.has(102)).toBe(true);
  });

  it("opens once, not again on every dimension switch", async () => {
    const { mymap } = await arrive("a");
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    mymap.fire("dimviewready");
    await mymap.photosApplied;
    expect(document.getElementById("photo-lightbox").hidden).toBe(true);
  });

  it("ignores a photo that is not in this dimension", async () => {
    await arrive("nosuchphoto");
    expect(document.getElementById("photo-lightbox").hidden).toBe(true);
  });
});
