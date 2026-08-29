import { dimScale } from "./dimensions.js";
import { buildPermalinkUrl } from "./permalink.js";
import {
  clusterPhotos,
  photoCaption,
  photoUrls,
  selectPhotos,
  timelineMode,
} from "./photos.js";

/**
 * The screenshot photo layer: pins, clusters, lightbox and viewport list.
 *
 * Photos arrive as an ordinary layer file with `kind: "photos"`, but unlike the
 * marker layers they are **not** switched on from the layers panel. Photos are
 * a mode of looking at the map rather than one overlay among many: opening the
 * photos tab turns them on, closing it turns them off again, and a checkbox in
 * the tab keeps them on for people who want to browse the map with the pins up.
 * That state still rides `visibleLayers` and therefore the permalink hash, so a
 * link to a photo-covered view still reproduces it.
 *
 * Nothing here branches on dimension: positions are stored dimension-native and
 * `dimScale` converts them, exactly as markers do, so dropping a
 * `data/nether/photos.json` in beside the overworld one is a data change and
 * nothing else.
 */

/**
 * Cluster cell edge, in screen pixels, and the minimum separation between two
 * pins -- `clusterPhotos` guarantees the second, which is the reason this can be
 * reasoned about at all.
 *
 * Sized against the pin it draws: a 56px thumbnail plus its 2px border and a
 * count badge that overhangs 6px at each corner is 72px of ink, so 84 leaves a
 * visible gap between neighbours instead of letting them kiss.
 */
const CLUSTER_CELL_PX = 84;

/** The lightbox copy button's resting label, restored after its confirmation. */
const LINK_LABEL = "リンクをコピー";

/** Where the encoded images live, if `site.json` did not say. */
const DEFAULT_CONFIG = { baseUrl: "photos/", thumbUrl: "photos/thumb/" };

function photosConfig() {
  return { ...DEFAULT_CONFIG, ...(globalThis.photosConfig || {}) };
}

/**
 * The photo layers declared for the current dimension.
 *
 * `build-data.mjs` copies each layer file's `kind` into the dimension metadata
 * precisely so this question can be answered without fetching the layer.
 */
function photoLayerIds(mymap) {
  return (mymap.dimData?.layers || [])
    .filter((layer) => layer.kind === "photos")
    .map((layer) => layer.id);
}

/**
 * The Minecraft position of a photo in the shared overworld frame.
 *
 * The one dimension-aware step, and it is the same one `renderMarkers` takes.
 */
function photoLatLng(mymap, photo) {
  const scale = dimScale(mymap.dim);
  return mymap.mcUnproject([photo.pos[0] * scale, photo.pos[2] * scale]);
}

/**
 * A link that reopens one photo.
 *
 * The coordinates are the photo's own rather than the map's centre, so closing
 * the lightbox at the far end leaves the visitor looking at the pin the link
 * was about. The timeline is copied across verbatim: the photo is on screen
 * under exactly those settings -- that is how it came to be in the lightbox --
 * so repeating them is what makes it visible again, terrain and all.
 *
 * The photo stem rides in `ph`, and carrying it is enough to switch the photo
 * layer on at the other end, so a link works whether or not the sender was
 * browsing with the pins up.
 *
 * @param {object} mymap
 * @param {{f: string, pos: number[]}} photo
 * @returns {string}
 */
function photoPermalink(mymap, photo) {
  const scale = dimScale(mymap.dim);
  const { timeline, visibleLayers } = mymap.dimData;
  const hashObj = {
    ...mymap.hashObj,
    dD: {
      ...mymap.hashObj.dD,
      [mymap.dim]: {
        c: {
          X: Math.round(photo.pos[0] * scale),
          Z: Math.round(photo.pos[2] * scale),
          z: mymap.getZoom(),
        },
        v: Array.from(visibleLayers),
        h: {
          d: timeline.date,
          e: timeline.exact,
          f: timeline.fill,
          p: timeline.photoDate,
        },
      },
    },
  };
  return buildPermalinkUrl(mymap.url, mymap.dim, hashObj, true, photo.f);
}

/**
 * Ask everything drawing photos to highlight a set of them, or nothing.
 *
 * The pins and the pane are separate renderings of one set, and the only way to
 * tell which pin a list row belongs to -- a row can be inside a pin holding a
 * hundred others -- is to point at it. Both sides fire this and both sides
 * listen, so the link works in either direction without either knowing the
 * other exists.
 *
 * @param {object} mymap
 * @param {Set<string>|null} keys - photo stems to highlight; null clears
 */
function highlight(mymap, keys) {
  mymap.fire("photohighlight", { keys });
}

/**
 * The lightbox: one full-screen overlay, built once and reused.
 *
 * It owns a list of photos and an index rather than a single photo, so the
 * arrow keys walk the cluster you opened it from -- which is the only way
 * through a pin holding a hundred screenshots. A filmstrip under the caption
 * says how many that is: without it, a cluster is a stack of unknown depth and
 * the arrows are a guess. The strip sits *below* the caption bar so the bar
 * stays attached to the photo it describes.
 */
function createLightbox(mymap, format) {
  const root = document.createElement("div");
  root.id = "photo-lightbox";
  root.hidden = true;
  root.innerHTML = `
    <button id="photo-lightbox-close" title="閉じる">✕</button>
    <div id="photo-lightbox-frame">
      <div id="photo-lightbox-stage">
        <button id="photo-lightbox-prev" title="前の写真">‹</button>
        <img id="photo-lightbox-image" alt="">
        <button id="photo-lightbox-next" title="次の写真">›</button>
      </div>
      <div id="photo-lightbox-bar">
        <span id="photo-lightbox-caption"></span>
        <button id="photo-lightbox-date">この日付の地図を表示</button>
        <button id="photo-lightbox-link">リンクをコピー</button>
      </div>
      <div id="photo-lightbox-strip"></div>
    </div>`;
  document.body.appendChild(root);

  const frame = root.querySelector("#photo-lightbox-frame");
  const image = root.querySelector("#photo-lightbox-image");
  const caption = root.querySelector("#photo-lightbox-caption");
  const dateButton = root.querySelector("#photo-lightbox-date");
  const linkButton = root.querySelector("#photo-lightbox-link");
  const prev = root.querySelector("#photo-lightbox-prev");
  const next = root.querySelector("#photo-lightbox-next");
  const strip = root.querySelector("#photo-lightbox-strip");

  let photos = [];
  let index = 0;
  let thumbs = [];
  let flashTimer;

  /**
   * Say what the copy button just did, in the button itself.
   *
   * The permalink pane has room for a status line beside its field; the caption
   * bar does not, and a toast over the photo would cover the thing being
   * looked at. The button is where the click was, so it is where the answer
   * goes.
   */
  function flash(text) {
    clearTimeout(flashTimer);
    linkButton.textContent = text;
    flashTimer = setTimeout(() => {
      linkButton.textContent = LINK_LABEL;
    }, 1500);
  }

  // Rebuild the filmstrip. Only on open, because a cluster does not change
  // while you are walking it, and a 189-photo strip is not free.
  function buildStrip() {
    strip.innerHTML = "";
    thumbs = [];
    strip.hidden = photos.length < 2;
    if (strip.hidden) return;
    const config = photosConfig();
    photos.forEach((photo, i) => {
      const thumb = strip.appendChild(document.createElement("img"));
      thumb.className = "photo-lightbox-thumb";
      thumb.src = photoUrls(photo, config).thumb;
      thumb.loading = "lazy";
      thumb.alt = "";
      thumb.title = format(photo.date);
      thumb.onclick = () => {
        index = i;
        show();
      };
      thumbs.push(thumb);
    });
  }

  function show() {
    const photo = photos[index];
    if (!photo) return;
    image.src = photoUrls(photo, photosConfig()).full;
    image.alt = photo.title || format(photo.date);
    caption.textContent = photoCaption(photo, format);
    dateButton.textContent = `${format(photo.date)}の地図を表示`;
    prev.hidden = next.hidden = photos.length < 2;
    // The link is per photo, so a confirmation must not outlive the photo it
    // was about.
    clearTimeout(flashTimer);
    linkButton.textContent = LINK_LABEL;
    thumbs.forEach((thumb, i) => {
      thumb.classList.toggle("photo-lightbox-thumb-current", i === index);
    });
    // `nearest` so walking with the arrow keys nudges the strip along instead
    // of yanking it, and does nothing at all while the current thumb is in view.
    thumbs[index]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  function step(delta) {
    index = (index + delta + photos.length) % photos.length;
    show();
  }

  function close() {
    root.hidden = true;
    image.src = "";
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  }

  prev.onclick = () => step(-1);
  next.onclick = () => step(1);
  root.querySelector("#photo-lightbox-close").onclick = close;
  // Clicking the backdrop closes; clicking the photo, the bar or the strip
  // does not. The frame is part of the backdrop as far as this is concerned.
  root.onclick = (e) => {
    if (e.target === root || e.target === frame) close();
  };
  linkButton.onclick = async () => {
    const url = photoPermalink(mymap, photos[index]);
    try {
      await navigator.clipboard.writeText(url);
      flash("コピーしました");
    } catch {
      // No clipboard: an insecure origin, or a browser that refuses. Say so
      // rather than leaving a dead button.
      flash("コピーできませんでした");
    }
  };
  dateButton.onclick = () => {
    // Pairing the photo with its terrain is the point of the feature: snap the
    // map to what was there when the shot was taken, then ◀ ▶ walk history with
    // the photo still pinned.
    mymap.setTimelineDate(photos[index].date);
    close();
  };

  return function open(list, start = 0) {
    photos = list;
    index = start;
    root.hidden = false;
    document.addEventListener("keydown", onKey);
    buildStrip();
    show();
  };
}

/**
 * The count badge on a pin.
 *
 * A lone photo gets nothing. A cluster gets its count -- and a cluster the
 * timeline has split, some of whose photos postdate the selected date, gets the
 * split written out as `3+2`: three photos that exist, two that do not yet.
 * Folding those together is what made the old pins confusing, because a bright
 * pin reading `5` could be mostly future.
 */
function countBadgeHtml({ count, dimCount, dimmed }) {
  if (!dimmed && dimCount > 0) {
    return `<span class="photo-pin-count">${count - dimCount}<span class="photo-pin-count-later">+${dimCount}</span></span>`;
  }
  return count > 1 ? `<span class="photo-pin-count">${count}</span>` : "";
}

/**
 * The marker for one cluster: a thumbnail pin, with a count when it holds more.
 */
function clusterMarker(mymap, cluster, openLightbox) {
  const { thumb } = photoUrls(cluster.lead, photosConfig());
  const icon = L.divIcon({
    className: `photo-pin${cluster.dimmed ? " photo-pin-dim" : ""}`,
    html: `<img src="${thumb}" alt="" loading="lazy">${countBadgeHtml(cluster)}`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
  const marker = L.marker(photoLatLng(mymap, cluster.lead), { icon });
  marker.on("click", () => openLightbox(cluster.photos, cluster.leadIndex));
  const keys = cluster.photos.map((photo) => photo.f);
  marker.on("mouseover", () => highlight(mymap, new Set(keys)));
  marker.on("mouseout", () => highlight(mymap, null));
  return { marker, keys, photos: cluster.photos };
}

/**
 * Draw a photo layer, and keep it in step with zoom and the timeline.
 *
 * Clustering depends on zoom but not on pan -- `project` gives absolute pixel
 * coordinates at a zoom level -- so panning costs nothing here.
 *
 * Takes no `fraction`: that is the hue the marker and line renderers use to tell
 * one layer from another, and a photo shows its own image instead.
 */
export function renderPhotos(mymap, data, dataLayer) {
  // A feature group rather than a plain layer group: the layers panel's
  // "zoom to this layer" button calls `getBounds()` on the layer's group, and
  // that walks its children expecting each to answer the same call.
  const group = L.featureGroup([]);
  dataLayer.addLayer(group);

  if (!mymap.photoLightbox) {
    mymap.photoLightbox = createLightbox(mymap, mymap.formatDate || String);
  }
  // The photos pane reads these to list what is in the viewport, and an
  // incoming photo permalink reads `find` to locate the photo it names.
  (mymap.photoLayers ||= []).push({ data, dataLayer, find });

  // The pins currently on the map, with the photo stems each stands for, so a
  // highlight coming from the pane can find the pin that holds its photo.
  let pins = [];

  /**
   * The pin holding one photo, in the form the lightbox opens on.
   *
   * A permalink names a single photo, but showing it alone would hide that it
   * sits in a stack of a hundred others. Answering with the whole pin lands the
   * visitor exactly where a click on that pin would have, on the photo they
   * were sent.
   *
   * @param {string} f - a photo's file stem
   * @returns {{photos: object[], index: number}|null}
   */
  function find(f) {
    for (const pin of pins) {
      const index = pin.photos.findIndex((photo) => photo.f === f);
      if (index >= 0) return { photos: pin.photos, index };
    }
    return null;
  }

  function visiblePhotos() {
    const { timeline } = mymap.dimData;
    return selectPhotos(data.photos, timeline.photoDate, timelineMode(timeline));
  }

  function redraw() {
    group.clearLayers();
    pins = [];
    if (!mymap.hasLayer(dataLayer)) return;
    const zoom = mymap.getZoom();
    const placed = visiblePhotos().map(({ photo, dimmed }) => {
      const { x, y } = mymap.project(photoLatLng(mymap, photo), zoom);
      return { photo, x, y, dimmed };
    });
    for (const cluster of clusterPhotos(placed, CLUSTER_CELL_PX)) {
      const pin = clusterMarker(mymap, cluster, mymap.photoLightbox);
      group.addLayer(pin.marker);
      pins.push(pin);
    }
  }

  dataLayer.on("add", redraw);
  dataLayer.on("remove", () => {
    group.clearLayers();
    pins = [];
  });
  mymap.on("zoomend timelinechange", redraw);

  // Hovering a row in the pane lifts its pin out of the stack and outlines it.
  // The z-index bump matters more than the outline: the pin may be underneath a
  // neighbour, and an outline you cannot see is no answer.
  mymap.on("photohighlight", ({ keys }) => {
    for (const { marker, keys: own } of pins) {
      const on = !!keys && own.some((key) => keys.has(key));
      marker.getElement?.()?.classList.toggle("photo-pin-highlight", on);
      marker.setZIndexOffset?.(on ? 2000 : 0);
    }
  });

  redraw();
}

/**
 * The photos pane: the switch for the whole feature, and every photo currently
 * on screen as a thumbnail list.
 *
 * Co-primary with the pins rather than a nicety. The set is concentrated enough
 * that the default view is one pin holding over a hundred photos, and a stack
 * that deep cannot be explored by clicking it. Pan to a build and the list
 * shows what was shot there; the pins are for when you already know where you
 * are looking.
 *
 * @param {object} mymap
 * @param {(mymap: object, id: number) => Promise<void>} ensureLayerLoaded -
 *   injected rather than imported, because `setupLayers.js` already imports
 *   `renderPhotos` from here and a cycle between the two is not worth the
 *   convenience.
 */
export function setupPhotoPanel(mymap, ensureLayerLoaded = async () => {}) {
  const list = document.getElementById("photos-list");
  const status = document.getElementById("photos-status");
  const persistEl = document.getElementById("photos-persist");
  let paneOpen = false;
  // Whether the hash has been consulted yet. The checkbox is a preference that
  // outlives a dimension switch, so it is seeded from the incoming permalink
  // once and then applied to every dimension the visitor moves to.
  let seeded = false;
  // The list rows, by photo stem, so a highlight fired by a pin can find them.
  let rows = new Map();

  /** Photos are on the map while the tab is open, or if asked to persist. */
  async function apply() {
    const persist = !!persistEl?.checked;
    const visible = paneOpen || persist;
    for (const id of photoLayerIds(mymap)) {
      if (visible) await ensureLayerLoaded(mymap, id);
      const entry = mymap.layerCache?.[id];
      if (persist) mymap.dimData.visibleLayers.add(id);
      else mymap.dimData.visibleLayers.delete(id);
      if (!entry?.dataLayer) continue;
      if (visible) entry.dataLayer.addTo(mymap);
      else entry.dataLayer.remove();
    }
    refresh();
  }

  /**
   * Run `apply` and publish the promise.
   *
   * Every trigger for it is a synchronous event -- a sidebar tab opening, a
   * checkbox -- but the work inside it fetches a layer file. Hanging the
   * in-flight promise off the map gives anything that needs to know the pins
   * are up something to await, instead of a race.
   */
  function schedule() {
    mymap.photosApplied = apply();
    return mymap.photosApplied;
  }

  /**
   * Open the photo an incoming permalink named, if there is one.
   *
   * Runs after `apply`, because the pin it has to search does not exist until
   * the layer has been fetched and drawn -- and it only searches layers that
   * are actually on the map, since `mymap.photoLayers` keeps every dimension
   * visited so far.
   *
   * The key is consumed rather than read: it says where the visit starts, not
   * what the map is showing, so switching dimension afterwards must not reopen
   * the lightbox.
   */
  async function openHashPhoto() {
    const key = mymap.hashObj?.ph;
    if (!key) return;
    delete mymap.hashObj.ph;
    for (const layer of mymap.photoLayers || []) {
      if (!mymap.hasLayer(layer.dataLayer)) continue;
      const hit = layer.find(key);
      if (hit) return mymap.photoLightbox(hit.photos, hit.index);
    }
  }

  function refresh() {
    // A no-op while the tab is shut; `apply` still runs either way, because
    // unticking the checkbox has to take the pins down whatever the tab is doing.
    if (!paneOpen) return;
    const bounds = mymap.getBounds();
    const { timeline } = mymap.dimData;
    const mode = timelineMode(timeline);
    const found = [];
    for (const { data, dataLayer } of mymap.photoLayers || []) {
      if (!mymap.hasLayer(dataLayer)) continue;
      for (const { photo, dimmed } of selectPhotos(data.photos, timeline.photoDate, mode)) {
        if (bounds.contains(photoLatLng(mymap, photo))) found.push({ photo, dimmed });
      }
    }
    found.sort((a, b) => (a.photo.date < b.photo.date ? 1 : -1));

    list.innerHTML = "";
    rows = new Map();
    status.textContent = !photoLayerIds(mymap).length
      ? "この次元にはスクリーンショットがありません"
      : found.length
      ? `表示中の範囲に${found.length}枚あります`
      : "表示中の範囲に写真はありません";

    const config = photosConfig();
    found.forEach(({ photo, dimmed }, i) => {
      const item = list.appendChild(document.createElement("div"));
      item.className = `photos-item${dimmed ? " photos-item-dim" : ""}`;
      const image = item.appendChild(document.createElement("img"));
      image.src = photoUrls(photo, config).thumb;
      image.loading = "lazy";
      image.alt = "";
      const label = item.appendChild(document.createElement("span"));
      label.textContent = photo.title || mymap.formatDate(photo.date);
      item.onclick = () => {
        mymap.panTo(photoLatLng(mymap, photo), { animate: true });
        mymap.photoLightbox(found.map((f) => f.photo), i);
      };
      // Hovering a row points at its pin on the map, and vice versa below.
      item.onmouseenter = () => highlight(mymap, new Set([photo.f]));
      item.onmouseleave = () => highlight(mymap, null);
      rows.set(photo.f, item);
    });
  }

  mymap.on("moveend zoomend timelinechange", refresh);
  mymap.on("dimviewready", () => {
    if (!seeded) {
      seeded = true;
      if (persistEl) {
        // A link to a photo implies the pins: it has to switch the layer on
        // even when the sender was browsing with them off, and leaving them up
        // is what puts the photo back in its surroundings once the lightbox is
        // closed.
        persistEl.checked =
          !!mymap.hashObj?.ph ||
          photoLayerIds(mymap).some((id) => mymap.dimData.visibleLayers.has(id));
      }
    }
    // Not `schedule()`: the published promise has to cover the lightbox too,
    // or a caller waiting on the pins can look before the photo has opened.
    return (mymap.photosApplied = apply().then(openHashPhoto));
  });

  if (persistEl) persistEl.onchange = schedule;

  mymap.sidebar.on("content", (e) => {
    paneOpen = e.id === "photos";
    return schedule();
  });
  mymap.sidebar.on("closing", () => {
    paneOpen = false;
    return schedule();
  });

  // Hovering a pin marks the rows it stands for and scrolls the first into
  // view, which is how you find one photo of a hundred-deep stack in the list.
  mymap.on("photohighlight", ({ keys }) => {
    let first;
    for (const [f, item] of rows) {
      const on = !!keys && keys.has(f);
      item.classList.toggle("photos-item-highlight", on);
      if (on && !first) first = item;
    }
    first?.scrollIntoView?.({ block: "nearest" });
  });
}
