import { dimScale } from "./dimensions.js";
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
      </div>
      <div id="photo-lightbox-strip"></div>
    </div>`;
  document.body.appendChild(root);

  const frame = root.querySelector("#photo-lightbox-frame");
  const image = root.querySelector("#photo-lightbox-image");
  const caption = root.querySelector("#photo-lightbox-caption");
  const dateButton = root.querySelector("#photo-lightbox-date");
  const prev = root.querySelector("#photo-lightbox-prev");
  const next = root.querySelector("#photo-lightbox-next");
  const strip = root.querySelector("#photo-lightbox-strip");

  let photos = [];
  let index = 0;
  let thumbs = [];

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
  return { marker, keys };
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
  // The photos pane reads these to list what is in the viewport.
  (mymap.photoLayers ||= []).push({ data, dataLayer });

  // The pins currently on the map, with the photo stems each stands for, so a
  // highlight coming from the pane can find the pin that holds its photo.
  let pins = [];

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
        persistEl.checked = photoLayerIds(mymap).some((id) =>
          mymap.dimData.visibleLayers.has(id)
        );
      }
    }
    return schedule();
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
