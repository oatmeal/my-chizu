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
 * Photos arrive as an ordinary layer file with `kind: "photos"`, so they get
 * the layers panel checkbox, the `visibleLayers` set and its hash persistence
 * for free. Nothing here branches on dimension: positions are stored
 * dimension-native and `dimScale` converts them, exactly as markers do, so
 * dropping a `data/nether/photos.json` in beside the overworld one is a data
 * change and nothing else.
 */

/**
 * Cluster cell edge, in screen pixels.
 *
 * Chosen against the pin it draws -- a 56px thumbnail with its border and
 * badge -- so two clusters cannot visually overlap, and so the set breaks apart
 * at roughly the zoom where the eye stops reading it as one blob.
 */
const CLUSTER_CELL_PX = 72;

/** Where the encoded images live, if `site.json` did not say. */
const DEFAULT_CONFIG = { baseUrl: "photos/", thumbUrl: "photos/thumb/" };

function photosConfig() {
  return { ...DEFAULT_CONFIG, ...(globalThis.photosConfig || {}) };
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
 * The lightbox: one full-screen overlay, built once and reused.
 *
 * It owns a list of photos and an index rather than a single photo, so the
 * arrow keys walk the cluster you opened it from -- which is the only way
 * through a pin holding a hundred screenshots.
 */
function createLightbox(mymap, format) {
  const root = document.createElement("div");
  root.id = "photo-lightbox";
  root.hidden = true;
  root.innerHTML = `
    <button id="photo-lightbox-close" title="閉じる">✕</button>
    <button id="photo-lightbox-prev" title="前の写真">‹</button>
    <img id="photo-lightbox-image" alt="">
    <button id="photo-lightbox-next" title="次の写真">›</button>
    <div id="photo-lightbox-bar">
      <span id="photo-lightbox-caption"></span>
      <button id="photo-lightbox-date">この日付の地図を表示</button>
    </div>`;
  document.body.appendChild(root);

  const image = root.querySelector("#photo-lightbox-image");
  const caption = root.querySelector("#photo-lightbox-caption");
  const dateButton = root.querySelector("#photo-lightbox-date");
  const prev = root.querySelector("#photo-lightbox-prev");
  const next = root.querySelector("#photo-lightbox-next");

  let photos = [];
  let index = 0;

  function show() {
    const photo = photos[index];
    if (!photo) return;
    image.src = photoUrls(photo, photosConfig()).full;
    image.alt = photo.title || format(photo.date);
    caption.textContent = photoCaption(photo, format);
    dateButton.textContent = `${format(photo.date)}の地図を表示`;
    prev.hidden = next.hidden = photos.length < 2;
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
  // Clicking the backdrop closes; clicking the photo or the bar does not.
  root.onclick = (e) => {
    if (e.target === root) close();
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
    show();
  };
}

/**
 * The marker for one cluster: a thumbnail pin, with a count when it holds more.
 */
function clusterMarker(mymap, cluster, openLightbox) {
  const { thumb } = photoUrls(cluster.lead, photosConfig());
  const badge =
    cluster.count > 1 ? `<span class="photo-pin-count">${cluster.count}</span>` : "";
  const icon = L.divIcon({
    className: `photo-pin${cluster.dimmed ? " photo-pin-dim" : ""}`,
    html: `<img src="${thumb}" alt="" loading="lazy">${badge}`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
  const marker = L.marker(photoLatLng(mymap, cluster.lead), { icon });
  marker.on("click", () => openLightbox(cluster.photos, 0));
  return marker;
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

  function visiblePhotos() {
    const { timeline } = mymap.dimData;
    return selectPhotos(data.photos, timeline.photoDate, timelineMode(timeline));
  }

  function redraw() {
    group.clearLayers();
    if (!mymap.hasLayer(dataLayer)) return;
    const zoom = mymap.getZoom();
    const placed = visiblePhotos().map(({ photo, dimmed }) => {
      const { x, y } = mymap.project(photoLatLng(mymap, photo), zoom);
      return { photo, x, y, dimmed };
    });
    for (const cluster of clusterPhotos(placed, CLUSTER_CELL_PX)) {
      group.addLayer(clusterMarker(mymap, cluster, mymap.photoLightbox));
    }
  }

  dataLayer.on("add", redraw);
  dataLayer.on("remove", () => group.clearLayers());
  mymap.on("zoomend timelinechange", redraw);
  redraw();
}

/**
 * The photos pane: every photo currently on screen, as a thumbnail list.
 *
 * Co-primary with the pins rather than a nicety. The set is concentrated enough
 * that the default view is one pin holding over a hundred photos, and a stack
 * that deep cannot be explored by clicking it. Pan to a build and the list
 * shows what was shot there; the pins are for when you already know where you
 * are looking.
 */
export function setupPhotoPanel(mymap) {
  const list = document.getElementById("photos-list");
  const status = document.getElementById("photos-status");
  let open = false;

  function refresh() {
    if (!open) return;
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
    const layers = (mymap.photoLayers || []).filter(({ dataLayer }) =>
      mymap.hasLayer(dataLayer)
    );
    status.textContent = !layers.length
      ? "「レイヤー」タブでスクリーンショットのレイヤーをオンにしてください"
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
    });
  }

  mymap.on("moveend zoomend timelinechange dimviewready", refresh);
  mymap.sidebar.on("content", (e) => {
    open = e.id === "photos";
    refresh();
  });
  mymap.sidebar.on("closing", () => {
    open = false;
  });
}
