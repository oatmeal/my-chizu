import { dimScale } from "./dimensions.js";

let icons = {};

/**
 * Marker icon class for a layer's hue, created on first use.
 *
 * HACK: layers are told apart by hue-rotating the one default marker icon, so
 * each distinct fraction needs its own class and its own injected rule.
 */
function iconFor(fraction) {
  const className = `layer-icon-${fraction}`.replace(".", "p");
  if (!icons[className]) {
    icons[className] = L.Icon.Default.extend({ options: { className } });
    document.head.appendChild(
      document.createElement("style")
    ).innerHTML = `.${className} { filter: hue-rotate(${fraction}turn); }`;
  }
  return icons[className];
}

/**
 * Add a layer's point markers to its feature group.
 *
 * `pos` is in dimension-native coordinates; `dimScale` converts to the shared
 * overworld frame, which is the only dimension-aware step here.
 */
function renderMarkers(mymap, data, dataLayer, { url, fraction }) {
  const Icon = iconFor(fraction);
  const scale = dimScale(mymap.dim);
  for (const marker of data.markers) {
    const { name, pos } = marker;
    // TODO: add more info to popup?
    const contents = document.createElement("div");
    contents.innerHTML = `${name}<br>[X=${pos[0]}, Y=${pos[1]}, Z=${pos[2]}]`;
    marker.marker = L.marker(
      mymap.mcUnproject([pos[0] * scale, pos[2] * scale]),
      { icon: new Icon() }
    ).bindPopup(contents);
    dataLayer.addLayer(marker.marker);
    // HACK: put gate and bastion markers on top. This reaches into the data
    // repo's filenames from the engine; a `zIndex` field on the layer JSON
    // would do it properly.
    if (url.endsWith("gate.json") || url.endsWith("bastion.json")) {
      marker.marker.setZIndexOffset(1000);
    }
  }
}

/**
 * Add a layer's polylines to its feature group.
 */
function renderLines(mymap, data, dataLayer, { fraction }) {
  const scale = dimScale(mymap.dim);
  for (const line of data.lines) {
    const { name, pts, ...opts } = line;
    const linePts = pts.map(([x, , z]) =>
      mymap.mcUnproject([scale * x, scale * z])
    );
    // TODO: add more info to popup?
    line.line = L.polyline(linePts, {
      color: `hsla(${215 + 360 * fraction}, 100%, 60%, 1)`,
      // styling: https://leafletjs.com/reference.html#polyline
      ...opts,
      // TODO: show interpolated coordinates of clicked point
    }).bindPopup(name || data.name);
    dataLayer.addLayer(line.line);
  }
}

/**
 * The content a layer JSON can carry, and how to draw each.
 *
 * A layer file may hold any combination; each renderer runs when its key is
 * present, in this order. A new kind of content — photos, chat logs — is a new
 * entry here rather than another branch inside `setupLayer`.
 */
const RENDERERS = [
  { key: "markers", render: renderMarkers },
  { key: "lines", render: renderLines },
];

async function setupLayer(mymap, url, fraction = 0) {
  const data = await (await fetch(url)).json();
  const dataLayer = L.featureGroup([]);
  for (const { key, render } of RENDERERS) {
    if (data[key]) render(mymap, data, dataLayer, { url, fraction });
  }
  return { data, dataLayer };
}

export async function ensureLayerLoaded(mymap, id) {
  const cached = mymap.layerCache[id];
  if (!cached.dataLayer) {
    mymap.layerCache[id] = {
      check: cached.check,
      url: cached.url,
      fraction: cached.fraction,
      ...(await setupLayer(mymap, cached.url, cached.fraction)),
    };
  }
}

export function setupLayerPanel(mymap) {
  const layersSelect = document.getElementById("layers-select");
  const layersDetails = document.getElementById("layers-details");
  const initialDetails = layersDetails.innerHTML;

  let currentlyViewed = null;

  function clear(nonemptyLayers) {
    while (layersSelect.firstChild) {
      layersSelect.removeChild(layersSelect.firstChild);
    }
    layersDetails.innerHTML = nonemptyLayers ? initialDetails : "";
  }

  // runs on dimension change
  function initLayers(layerList) {
    currentlyViewed = null;
    clear(layerList.length > 0);
    for (const layer of layerList) {
      const el = layersSelect.appendChild(document.createElement("div"));
      el.classList.add("layers-layerlist");

      const eye = el.appendChild(document.createElement("span"));
      el.classList.add("layers-eye");
      eye.textContent = "🔎";
      eye.onclick = async function () {
        if (currentlyViewed) {
          currentlyViewed.textContent = "🔎";
        }
        currentlyViewed = eye;
        eye.textContent = "👁";
        await ensureLayerLoaded(mymap, layer.id);

        const { data: layerData, dataLayer } = mymap.layerCache[layer.id];

        // clear layersDetails
        layersDetails.innerHTML = "";
        // display details in layersDetails
        const title = layersDetails.appendChild(document.createElement("div"));
        title.classList.add("layers-details-title");
        title.innerHTML = `「${layerData.name}」レイヤーの位置：<br>下の位置の名前をリックすると、地図中心に表示します。注意：チェックボックスをオンにしない場合、マーカーは表示されません。`;

        const fitAll = layersDetails.appendChild(document.createElement("div"));
        fitAll.classList.add("layers-details-marker");
        fitAll.textContent = `📍📍 レイヤー全体が表示されるようにズームする`;
        fitAll.onclick = function () {
          mymap.fitBounds(dataLayer.getBounds(), { animate: true });
        };

        for (const marker of layerData.markers || []) {
          const markerDetail = layersDetails.appendChild(
            document.createElement("div")
          );
          markerDetail.classList.add("layers-details-marker");
          markerDetail.textContent = `📍 ${marker.name}`;
          markerDetail.onclick = function () {
            mymap.once("moveend", () => marker.marker.openPopup());
            mymap.panTo(marker.marker.getLatLng(), { animate: true });
            // TODO: what if the layer isn't displayed?
            // temporary marker?
          };
          // something for hover?
        }
      };

      const check = el.appendChild(document.createElement("input"));
      if (mymap.layerCache[layer.id]) {
        mymap.layerCache[layer.id].check = check;
        mymap.layerCache[layer.id].url = layer.url;
        mymap.layerCache[layer.id].fraction = layer.fraction;
      } else {
        mymap.layerCache[layer.id] = {
          check,
          url: layer.url,
          fraction: layer.fraction,
        };
      }
      check.id = `map-layer-${layer.id}`;
      check.type = "checkbox";

      const text = el.appendChild(document.createElement("label"));
      text.classList.add("layers-layerlist-label");
      text.textContent = layer.name;
      text.htmlFor = check.id;

      check.onchange = async function () {
        await ensureLayerLoaded(mymap, layer.id);
        // toggle display of layer,
        // add / remove from visibleLayers
        if (check.checked) {
          mymap.layerCache[layer.id].dataLayer.addTo(mymap);
          mymap.dimData.visibleLayers.add(layer.id);
          el.style.backgroundColor = `hsla(${
            215 + 360 * layer.fraction
          }, 100%, 60%, 0.5)`;
        } else {
          mymap.layerCache[layer.id].dataLayer.remove();
          mymap.dimData.visibleLayers.delete(layer.id);
          el.style.backgroundColor = "";
        }
      };
    }
  }

  mymap.on("dimchange", () => initLayers(mymap.dimData.layers));
}
