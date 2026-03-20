function parseHash(hash) {
  hash = hash.slice(1);
  return hash
    .split("&")
    .map((s) => s.split("="))
    .filter((s) => s[0] !== "" && s[1] !== undefined)
    .reduce((pre, [key, value]) => {
      try {
        return {
          ...pre,
          [key]: JSON.parse(decodeURIComponent(value)),
        };
      } catch (e) {
        console.log(e, key, decodeURIComponent(value));
        return pre;
      }
    }, {});
}

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
    const { x, y } = this.project(latlng, this.dimData.minZoom);
    return [
      this.dimData.ratio * x + this.dimData.X0,
      this.dimData.ratio * y + this.dimData.Z0,
    ];
  };
  // MC coords -> map coords
  mymap.mcUnproject = function ([X, Z]) {
    return this.unproject(
      [
        (X - this.dimData.X0) / this.dimData.ratio,
        (Z - this.dimData.Z0) / this.dimData.ratio,
      ],
      this.dimData.minZoom
    );
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
  if (mymap.dim === "e") {
    // end
    tileDataJsonUrl = "data/end.json";
  } else if (mymap.dim === "n") {
    await loadTileData(mymap, "o", "data/overworld.json");
    // nether
    tileDataJsonUrl = "data/nether.json";
  } else {
    // default to overworld
    mymap.dim = "o";
    tileDataJsonUrl = "data/overworld.json";
  }
  mymap.hashObj.d = mymap.dim;

  await loadTileData(mymap, mymap.dim, tileDataJsonUrl);
  if (mymap.dim === "n") {
    mymap.dimCache["n"].dates = mymap.dimCache["o"].dates;
    mymap.dimCache["n"].fileDates = mymap.dimCache["o"].fileDates;
  }

  mymap.dimData = mymap.dimCache[mymap.dim];
  const southWest = mymap.mcUnproject([mymap.dimData.minX, mymap.dimData.maxZ]);
  const northEast = mymap.mcUnproject([mymap.dimData.maxX, mymap.dimData.minZ]);
  mymap.setMaxBounds(new L.LatLngBounds(southWest, northEast));

  // starting view
  const hashDimData =
    mymap.hashObj && mymap.hashObj.dD && mymap.hashObj.dD[mymap.dim];
  // TODO: should only zoom to a location specified in the hash if all 3 coordinates are present
  const hcX = hashDimData && hashDimData.c && hashDimData.c.X;
  const startX =
    mymap.dimData.startX === 0
      ? 0
      : mymap.dimData.startX ||
        (hcX === 0
          ? 0
          : (typeof hcX === "number" && hcX) || mymap.dimData.defaultX);
  const hcZ = hashDimData && hashDimData.c && hashDimData.c.Z;
  const startZ =
    mymap.dimData.startZ === 0
      ? 0
      : mymap.dimData.startZ ||
        (hcZ === 0
          ? 0
          : (typeof hcZ === "number" && hcZ) || mymap.dimData.defaultZ);
  const hcz = hashDimData && hashDimData.c && hashDimData.c.z;
  const startZoom =
    mymap.dimData.startZoom === 0
      ? 0
      : mymap.dimData.startZoom ||
        (hcz === 0
          ? 0
          : (Number.isInteger(hcz) &&
              hcz <= mymap.dimData.maxZoom &&
              hcz >= mymap.dimData.minZoom &&
              hcz) ||
            mymap.dimData.defaultZoom);

  // initialize timeline settings from hashObj or defaults
  if (mymap.dimData.timeline === undefined) {
    mymap.dimData.timeline = { dateCache: {} };
  }
  if (mymap.dimData.timeline.date === undefined) {
    mymap.dimData.timeline.date =
      (mymap.dimData.dates.includes(
        hashDimData && hashDimData.h && hashDimData.h.d
      ) &&
        hashDimData.h.d) ||
      mymap.dimData.dates[mymap.dimData.dates.length - 1];
  }
  if (mymap.dimData.timeline.exact === undefined) {
    mymap.dimData.timeline.exact =
      (hashDimData && hashDimData.h && hashDimData.h.e) === true;
  }
  if (mymap.dimData.timeline.fill === undefined) {
    mymap.dimData.timeline.fill = !(
      hashDimData &&
      hashDimData.h &&
      hashDimData.h.f === false
    );
  }
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

  // initialize timeline panel
  mymap.sidebar.timelineControl.init(mymap.dimData.dates);
  await getTileReplacements(mymap);

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
  // check panel radio elements
  if (mymap.dim === "o") {
    document.getElementById("locate-dimension-overworld").checked = true;
    document.getElementById("layers-dimension-overworld").checked = true;
  } else if (mymap.dim === "n") {
    document.getElementById("locate-dimension-nether").checked = true;
    document.getElementById("layers-dimension-nether").checked = true;
  } else if (mymap.dim === "e") {
    document.getElementById("locate-dimension-end").checked = true;
    document.getElementById("layers-dimension-end").checked = true;
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

  // load list of available layers into panel
  mymap.sidebar.layersControl.init(mymap.dimData.layers);
  gridCheckbox.checked = false;

  // draw lines on nether layer
  if (mymap.dim === "n") {
    if (!mymap.layerCache["nether-lines"]) {
      // map will get screwed up
      // if the dimension is changed again before this completes.
      // for now, the radio buttons are disabled temporarily
      const netherLines = L.layerGroup([]);
      for (const layer of mymap.dimData.layers) {
        // download layer data if not in cache
        if (!mymap.layerCache[layer.id].dataLayer) {
          mymap.layerCache[layer.id] = {
            check: mymap.layerCache[layer.id].check,
            url: layer.url,
            fraction: layer.fraction,
            ...(await setupLayer(mymap, layer.url, layer.fraction)),
          };
        }
        const { data, dataLayer } = mymap.layerCache[layer.id];
        if (data.lines)
          for (const { pts } of data.lines) {
            const scale = 8;
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
    if (!mymap.layerCache[id].dataLayer) {
      mymap.layerCache[id] = {
        check: mymap.layerCache[id].check,
        url: mymap.layerCache[id].url,
        fraction: mymap.layerCache[id].fraction,
        ...(await setupLayer(
          mymap,
          mymap.layerCache[id].url,
          mymap.layerCache[id].fraction
        )),
      };
    }
    mymap.layerCache[id].check.parentElement.style.backgroundColor = `hsla(${
      215 + 360 * mymap.layerCache[id].fraction
    }, 100%, 60%, 0.5)`;
    mymap.layerCache[id].dataLayer.addTo(mymap);
  }

  mymap.setView(mymap.mcUnproject([startX, startZ]), startZoom, {
    animate: false,
  });

  // initialize coord marker
  mymap.sidebar.coordsControl.init();
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
          (dim === "n"
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

function setupBase(mymap) {
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
    // TODO: if minZoom and maxZoom for the nether are tweaked in build.py
    // instead of here, the tiles seem to be drawn with the wrong scale.
    // something to fix in mcProject / mcUnproject?
    minZoom: minZoom + (mymap.dim === "n" ? -3 : 0),
    maxZoom: maxZoom + (mymap.dim === "n" ? -3 : 0),
    minNativeZoom,
    maxNativeZoom,
    infinite: true,
    tilePath,
    errorTileUrl,
    opacity: mymap.dim === "n" ? 0.2 : 1,
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
      this._map.getZoom() < this.options.minNativeZoom &&
      !tileDates &&
      !replacements
    )
      return false;
    return this._originalIsValidTile(tilePath);
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
        loadPromises.push(
          new Promise((res) => {
            childImg.onload = () => res();
          })
        );
        childImg.style.position = "absolute";
        childImg.src = `${this.options.tilePath}/${child.key}/${child.date}.png`;
        // position child within the tile
        const cx = child.scale * tileSize.x;
        const cy = child.scale * tileSize.x;
        childImg.style.width = cx + "px";
        childImg.style.height = cy + "px";
        childImg.style.left = cx * child.pos_x + "px";
        childImg.style.top = cy * child.pos_z + "px";
      }
      Promise.all(loadPromises).then(() => done());
      return tile;
    } else return base._originalCreateTile(coords, done);
  };

  // this "original" getTileUrl comes from the fallback addon
  base._originalGetTileUrl = base.getTileUrl;
  // we override it to prevent attempting to load tiles at minNativeZoom which do not exist
  // and to implement the timestamp logic
  base.getTileUrl = function (tilePoint) {
    const key = `${tilePoint.z}/${tilePoint.x}/${tilePoint.y}`;
    const tileDates = fileDates[key];
    if (tilePoint.z <= this.options.minNativeZoom && !tileDates) {
      return this.options.errorTileUrl;
    }
    const originalUrl = this._originalGetTileUrl(tilePoint);
    // if the tile URL contains the SIGIL string,
    // then we know the tile doesn't exist.
    // HACK: we avoid making unnecessary requests by
    // returning an invalid `data:` URL
    const noRequest = "data:,";

    // choose tile based on time selection from UI
    // latest tile from that date and before;
    // exact: if true, only show that date
    // fill: if true, use earliest after target to fill in missing tiles
    //   (but only if there's no parent from the target date or before)
    if (tileDates) {
      // the calls to tileDates.find here require that tileDates is sorted!
      const date = timeline.exact
        ? tileDates.includes(timeline.date) && timeline.date
        : timeline.fill
        ? tileDates.find(
            (_e, i, t) => i === t.length - 1 || t[i + 1] > timeline.date
          )
        : tileDates.find(
            (e, i, t) =>
              e <= timeline.date &&
              (i === t.length - 1 || t[i + 1] > timeline.date)
          );
      if (!date) return noRequest;
      if (timeline.fill) {
        return timeline.skip[key]
          ? noRequest
          : originalUrl.replace(SIGIL, date);
      } else return originalUrl.replace(SIGIL, date);
    } else return noRequest;
  };

  base.addTo(mymap);
  return base;
}

function setupGrid(mymap, tileSize) {
  // TODO: set grid above everything else?
  const minZoom = mymap.dim === "n" ? -3 : 0;
  const maxZoom = mymap.dim === "n" ? 1 : 4;
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
    const zoom = (mymap.dim === "n" ? 1 : 4) - coords.z;
    const label = tile.appendChild(L.DomUtil.create("div", "gridLabelLayer"));
    label.innerText = `縮小率${zoom}: [${coords.x},${coords.y}]`;
    return tile;
  };

  return grid;
}

icons = {};
// HACK: color styling
async function setupLayer(mymap, url, fraction = 0) {
  const className = `layer-icon-${fraction}`.replace(".", "p");
  const data = await (await fetch(url)).json();
  const dataLayer = L.featureGroup([]);
  if (dataLayer.getLayers().length === 0) {
    if (data.markers) {
      if (!icons[className]) {
        icons[className] = L.Icon.Default.extend({
          options: {
            className: className,
          },
        });
        document.head.appendChild(
          document.createElement("style")
        ).innerHTML = `.${className} { filter: hue-rotate(${fraction}turn); }`;
      }
      for (const marker of data.markers) {
        const { name, pos } = marker;
        const scale = mymap.dim === "n" ? 8 : 1;
        const x = pos[0] * scale;
        const z = pos[2] * scale;
        // TODO: add more info to popup?
        const contents = document.createElement("div");
        contents.innerHTML = `${name}<br>[X=${pos[0]}, Y=${pos[1]}, Z=${pos[2]}]`;
        marker.marker = L.marker(mymap.mcUnproject([x, z]), {
          icon: new icons[className](),
        }).bindPopup(contents);
        dataLayer.addLayer(marker.marker);
        // HACK: put gate and bastion markers on top
        if (url.endsWith("gate.json") || url.endsWith("bastion.json")) {
          marker.marker.setZIndexOffset(1000);
        }
      }
    }
    if (data.lines)
      for (const line of data.lines) {
        const { name, pts, ...opts } = line;
        const scale = mymap.dim === "n" ? 8 : 1;
        const linePts = pts.map(([x, y, z]) =>
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
  return { data, dataLayer };
}

function setupLayerPanel(mymap) {
  const layersSelect = document.getElementById("layers-select");
  const layersDetails = document.getElementById("layers-details");
  const initialDetails = layersDetails.innerHTML;

  mymap.sidebar.layersControl = {
    layersSelect,
    layersDetails,
    currentlyViewed: null,
  };

  mymap.sidebar.layersControl.clear = function (nonemptyLayers) {
    while (layersSelect.firstChild) {
      layersSelect.removeChild(layersSelect.firstChild);
    }
    layersDetails.innerHTML = nonemptyLayers ? initialDetails : "";
  };

  // runs on dimension change
  mymap.sidebar.layersControl.init = function (layerList) {
    mymap.sidebar.layersControl.clear(layerList.length > 0);
    for (const layer of layerList) {
      const el = layersSelect.appendChild(document.createElement("div"));
      el.classList.add("layers-layerlist");

      const eye = el.appendChild(document.createElement("span"));
      el.classList.add("layers-eye");
      eye.textContent = "🔎";
      eye.onclick = async function () {
        if (mymap.sidebar.layersControl.currentlyViewed) {
          mymap.sidebar.layersControl.currentlyViewed.textContent = "🔎";
        }
        mymap.sidebar.layersControl.currentlyViewed = eye;
        eye.textContent = "👁";
        // download layer data if not in cache
        if (!mymap.layerCache[layer.id].dataLayer) {
          mymap.layerCache[layer.id] = {
            check: mymap.layerCache[layer.id].check,
            url: layer.url,
            fraction: layer.fraction,
            ...(await setupLayer(mymap, layer.url, layer.fraction)),
          };
        }

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

        for (const marker of layerData.markers) {
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
        // download layer data if not in cache
        if (!mymap.layerCache[layer.id].dataLayer) {
          mymap.layerCache[layer.id] = {
            check: mymap.layerCache[layer.id].check,
            url: layer.url,
            fraction: layer.fraction,
            ...(await setupLayer(mymap, layer.url, layer.fraction)),
          };
        }
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
  };
}

async function setupTimelinePanel(mymap) {
  const dates = await (await fetch(`data/dates.json`)).json();
  function format(date) {
    return (
      dates[date] ||
      `${date.slice(0, 4)}年${date.slice(4, 6)}月${date.slice(6)}日`
    );
  }
  const vods = await (await fetch(`data/vods.json`)).json();
  const current = document.getElementById("timeline-current");
  function updateCurrent(date) {
    current.innerHTML =
      (mymap.dim === "n"
        ? "オーバーレイに表示されているオーバーワールドの"
        : "現在表示されている") +
      `タイルは<b>${format(date)}</b>` +
      (mymap.dimData.timeline.exact
        ? "<b>に</b>保存されたタイルです"
        : mymap.dimData.timeline.fill
        ? "<b>以前に</b>保存されたタイルで、欠落したタイルはそれ以降のタイルに置き換えられます"
        : "<b>以前に</b>保存されたタイルです");
  }

  const exactEl = document.getElementById("timeline-checkbox-exact");
  exactEl.onchange = async () => {
    mymap.dimData.timeline.exact = exactEl.checked;
    if (mymap.dimData.timeline.exact) {
      fillEl.style.display = "none";
      fillLabelEl.style.display = "none";
    } else {
      fillEl.style.display = "inline";
      fillLabelEl.style.display = "inline";
    }

    updateCurrent(mymap.dimData.timeline.date);

    await getTileReplacements(mymap);
    mymap.dimData.base.redraw();
  };

  const fillEl = document.getElementById("timeline-checkbox-after");
  const fillLabelEl = document.getElementById("timeline-checkbox-after-label");
  fillEl.onchange = async () => {
    mymap.dimData.timeline.fill = fillEl.checked;

    updateCurrent(mymap.dimData.timeline.date);

    await getTileReplacements(mymap);
    mymap.dimData.base.redraw();
  };

  const timelineRadio = document.getElementById("timeline-radio");
  mymap.sidebar.timelineControl = {
    timelineRadio,
  };
  mymap.sidebar.timelineControl.init = function (dates) {
    exactEl.checked = mymap.dimData.timeline.exact;
    fillEl.checked = mymap.dimData.timeline.fill;
    if (mymap.dimData.timeline.exact) {
      fillEl.style.display = "none";
      fillLabelEl.style.display = "none";
    } else {
      fillEl.style.display = "inline";
      fillLabelEl.style.display = "inline";
    }

    updateCurrent(mymap.dimData.timeline.date);

    function updateLeftRight() {
      const left = document.getElementById("timeline-button-left");
      const right = document.getElementById("timeline-button-right");

      const index = mymap.dimData.dates.indexOf(mymap.dimData.timeline.date);
      left.disabled = index === 0;
      right.disabled = index === mymap.dimData.dates.length - 1;

      async function onclickHelper(nextIndex) {
        document.getElementById(
          `map-timeline-${mymap.dimData.timeline.date}`
        ).checked = false;

        mymap.dimData.timeline.date = mymap.dimData.dates[nextIndex];

        const inputEl = document.getElementById(
          `map-timeline-${mymap.dimData.timeline.date}`
        );
        inputEl.checked = true;
        if (
          !yearDivs[
            mymap.dimData.timeline.date.slice(0, 4)
          ].details.hasAttribute("open")
        ) {
          yearDivs[
            mymap.dimData.timeline.date.slice(0, 4)
          ].details.open = true;
        }
        if (
          !monthDivs[
            mymap.dimData.timeline.date.slice(0, 6)
          ].details.hasAttribute("open")
        ) {
          monthDivs[
            mymap.dimData.timeline.date.slice(0, 6)
          ].details.open = true;
        }
        inputEl.scrollIntoView({ block: "nearest" });

        updateCurrent(mymap.dimData.timeline.date);

        updateLeftRight();
        await getTileReplacements(mymap);
        mymap.dimData.base.redraw();
      }

      left.onclick = () => onclickHelper(index - 1);
      right.onclick = () => onclickHelper(index + 1);
    }

    while (timelineRadio.firstChild) {
      timelineRadio.removeChild(timelineRadio.firstChild);
    }
    const yearDivs = {};
    const monthDivs = {};
    let vodIndex = 0;
    for (const date of dates) {
      // add vod divs
      while (vodIndex < vods.length && vods[vodIndex].date <= date) {
        const vodDate = vods[vodIndex].date;
        if (!yearDivs[vodDate.slice(0, 4)]) {
          let yearDetails = timelineRadio.appendChild(
            document.createElement("details")
          );
          const yearSummary = yearDetails.appendChild(
            document.createElement("summary")
          );
          yearSummary.classList.add("timeline-details-summary");
          yearDivs[vodDate.slice(0, 4)] = {
            details: yearDetails,
            summary: yearSummary,
            prefix: `${vodDate.slice(0, 4)}年`,
            vods: 0,
            dates: 0,
          };
        }
        yearDetails = yearDivs[vodDate.slice(0, 4)].details;
        if (!monthDivs[vodDate.slice(0, 6)]) {
          const monthDetails = yearDetails.appendChild(
            document.createElement("details")
          );
          const summary = monthDetails.appendChild(
            document.createElement("summary")
          );
          summary.classList.add("timeline-details-summary");
          monthDivs[vodDate.slice(0, 6)] = {
            details: monthDetails,
            summary,
            prefix: `${vodDate.slice(0, 4)}年${vodDate.slice(4, 6)}月`,
            vods: 0,
            dates: 0,
          };
        }

        yearDivs[vodDate.slice(0, 4)].vods += 1;
        yearDivs[vodDate.slice(0, 4)].summary.innerHTML = `${
          yearDivs[vodDate.slice(0, 4)].prefix
        } ${
          yearDivs[vodDate.slice(0, 4)].dates > 0
            ? `(🗓${yearDivs[vodDate.slice(0, 4)].dates})`
            : ""
        } ${
          yearDivs[vodDate.slice(0, 4)].vods > 0
            ? `(<img src="TwitchGlitchPurple.svg" height="14">${
                yearDivs[vodDate.slice(0, 4)].vods
              })`
            : ""
        }`;
        monthDivs[vodDate.slice(0, 6)].vods += 1;
        monthDivs[vodDate.slice(0, 6)].summary.innerHTML = `${
          monthDivs[vodDate.slice(0, 6)].prefix
        } ${
          monthDivs[vodDate.slice(0, 6)].dates > 0
            ? `(🗓${monthDivs[vodDate.slice(0, 6)].dates})`
            : ""
        } ${
          monthDivs[vodDate.slice(0, 6)].vods > 0
            ? `(<img src="TwitchGlitchPurple.svg" height="14">${
                monthDivs[vodDate.slice(0, 6)].vods
              })`
            : ""
        }`;

        const vodEl = monthDivs[vodDate.slice(0, 6)].details.appendChild(
          document.createElement("div")
        );
        vodEl.classList.add("timeline-vod-div");
        vodEl.innerHTML = `<a href="https://twitch.tv/videos/${
          vods[vodIndex].id
        }" target="_blank" rel="noopener noreferrer"><img src="TwitchGlitchPurple.svg" height="12"> ${format(
          vodDate
        )}：${vods[vodIndex].title}`;
        vodIndex++;
      }

      if (!yearDivs[date.slice(0, 4)]) {
        let yearDetails = timelineRadio.appendChild(
          document.createElement("details")
        );
        const yearSummary = yearDetails.appendChild(
          document.createElement("summary")
        );
        yearSummary.classList.add("timeline-details-summary");
        yearDivs[date.slice(0, 4)] = {
          details: yearDetails,
          summary: yearSummary,
          prefix: `${date.slice(0, 4)}年`,
          vods: 0,
          dates: 0,
        };
      }
      yearDetails = yearDivs[date.slice(0, 4)].details;
      if (!monthDivs[date.slice(0, 6)]) {
        const monthDetails = yearDetails.appendChild(
          document.createElement("details")
        );
        const summary = monthDetails.appendChild(
          document.createElement("summary")
        );
        summary.classList.add("timeline-details-summary");
        monthDivs[date.slice(0, 6)] = {
          details: monthDetails,
          summary,
          prefix: `${date.slice(0, 4)}年${date.slice(4, 6)}月`,
          vods: 0,
          dates: 0,
        };
      }

      const dateEl = monthDivs[date.slice(0, 6)].details.appendChild(
        document.createElement("div")
      );
      yearDivs[date.slice(0, 4)].dates += 1;
      yearDivs[date.slice(0, 4)].summary.innerHTML = `${
        yearDivs[date.slice(0, 4)].prefix
      } ${
        yearDivs[date.slice(0, 4)].dates > 0
          ? `(🗓${yearDivs[date.slice(0, 4)].dates})`
          : ""
      } ${
        yearDivs[date.slice(0, 4)].vods > 0
          ? `(<img src="TwitchGlitchPurple.svg" height="14">${
              yearDivs[date.slice(0, 4)].vods
            })`
          : ""
      }`;
      monthDivs[date.slice(0, 6)].dates += 1;
      monthDivs[date.slice(0, 6)].summary.innerHTML = `${
        monthDivs[date.slice(0, 6)].prefix
      } ${
        monthDivs[date.slice(0, 6)].dates > 0
          ? `(🗓${monthDivs[date.slice(0, 6)].dates})`
          : ""
      } ${
        monthDivs[date.slice(0, 6)].vods > 0
          ? `(<img src="TwitchGlitchPurple.svg" height="14">${
              monthDivs[date.slice(0, 6)].vods
            })`
          : ""
      }`;

      const inputEl = dateEl.appendChild(document.createElement("input"));
      inputEl.type = "radio";
      inputEl.id = `map-timeline-${date}`;
      inputEl.name = "map-timeline";
      if (date === mymap.dimData.timeline.date) inputEl.checked = true;
      inputEl.onchange = async function () {
        if (inputEl.checked === true) {
          if (!yearDivs[date.slice(0, 4)].details.hasAttribute("open")) {
            yearDivs[date.slice(0, 4)].details.open = true;
          }
          if (!monthDivs[date.slice(0, 6)].details.hasAttribute("open")) {
            monthDivs[date.slice(0, 6)].details.open = true;
            inputEl.scrollIntoView({ block: "nearest" });
          }
        }

        mymap.dimData.timeline.date = date;

        updateCurrent(mymap.dimData.timeline.date);

        updateLeftRight();
        await getTileReplacements(mymap);
        mymap.dimData.base.redraw();
      };

      const text = dateEl.appendChild(document.createElement("label"));
      text.textContent = format(date);
      text.htmlFor = inputEl.id;
    }

    // add rest of VODs
    while (vodIndex < vods.length) {
      const vodDate = vods[vodIndex].date;
      if (!yearDivs[vodDate.slice(0, 4)]) {
        let yearDetails = timelineRadio.appendChild(
          document.createElement("details")
        );
        const yearSummary = yearDetails.appendChild(
          document.createElement("summary")
        );
        yearSummary.classList.add("timeline-details-summary");
        yearDivs[vodDate.slice(0, 4)] = {
          details: yearDetails,
          summary: yearSummary,
          prefix: `${vodDate.slice(0, 4)}年`,
          vods: 0,
          dates: 0,
        };
      }
      yearDetails = yearDivs[vodDate.slice(0, 4)].details;
      if (!monthDivs[vodDate.slice(0, 6)]) {
        const monthDetails = yearDetails.appendChild(
          document.createElement("details")
        );
        const summary = monthDetails.appendChild(
          document.createElement("summary")
        );
        summary.classList.add("timeline-details-summary");
        monthDivs[vodDate.slice(0, 6)] = {
          details: monthDetails,
          summary,
          prefix: `${vodDate.slice(0, 4)}年${vodDate.slice(4, 6)}月`,
          vods: 0,
          dates: 0,
        };
      }

      yearDivs[vodDate.slice(0, 4)].vods += 1;
      yearDivs[vodDate.slice(0, 4)].summary.innerHTML = `${
        yearDivs[vodDate.slice(0, 4)].prefix
      } ${
        yearDivs[vodDate.slice(0, 4)].dates > 0
          ? `(🗓${yearDivs[vodDate.slice(0, 4)].dates})`
          : ""
      } ${
        yearDivs[vodDate.slice(0, 4)].vods > 0
          ? `(<img src="TwitchGlitchPurple.svg" height="14">${
              yearDivs[vodDate.slice(0, 4)].vods
            })`
          : ""
      }`;
      monthDivs[vodDate.slice(0, 6)].vods += 1;
      monthDivs[vodDate.slice(0, 6)].summary.innerHTML = `${
        monthDivs[vodDate.slice(0, 6)].prefix
      } ${
        monthDivs[vodDate.slice(0, 6)].dates > 0
          ? `(🗓${monthDivs[vodDate.slice(0, 6)].dates})`
          : ""
      } ${
        monthDivs[vodDate.slice(0, 6)].vods > 0
          ? `(<img src="TwitchGlitchPurple.svg" height="14">${
              monthDivs[vodDate.slice(0, 6)].vods
            })`
          : ""
      }`;

      const vodEl = monthDivs[vodDate.slice(0, 6)].details.appendChild(
        document.createElement("div")
      );
      vodEl.classList.add("timeline-vod-div");
      vodEl.innerHTML = `<a href="https://twitch.tv/videos/${
        vods[vodIndex].id
      }" target="_blank" rel="noopener noreferrer"><img src="TwitchGlitchPurple.svg" height="12"> ${format(
        vodDate
      )}：${vods[vodIndex].title}`;
      vodIndex++;
    }

    yearDivs[mymap.dimData.timeline.date.slice(0, 4)].details.open = true;
    monthDivs[mymap.dimData.timeline.date.slice(0, 6)].details.open = true;
    document
      .getElementById(`map-timeline-${mymap.dimData.timeline.date}`)
      .scrollIntoView({ block: "nearest" });
    updateLeftRight();
  };

  mymap.sidebar.on("content", function (e) {
    if (e.id === "timeline") {
      document
        .getElementById(`map-timeline-${mymap.dimData.timeline.date}`)
        .scrollIntoView({ block: "nearest" });
    }
  });
}

async function getTileReplacements(mymap) {
  const { date, exact, fill, dateCache } = mymap.dimData.timeline;
  const mode = exact ? "e" : fill ? "f" : "b";
  const key = `${date}-${mode}`;
  if (!dateCache[key]) {
    const dim = mymap.dim === "e" ? "end" : "overworld";
    dateCache[key] = await (await fetch(`data/${dim}/${key}.json`)).json();
  }
  mymap.dimData.timeline.tileReplacements = dateCache[key].tileReplacements;
  mymap.dimData.timeline.skip = dateCache[key].skip;
}

function setupPermalinkPanel(mymap) {
  const permalinkText = document.getElementById("permalink-text");
  permalinkText.onclick = () => {
    permalinkText.focus();
    permalinkText.select();
    permalinkText.setSelectionRange(0, 99999);
  };
  const permalinkButton = document.getElementById("permalink-button");
  const copyStatus = document.getElementById("permalink-copy-status");
  permalinkButton.onclick = () => {
    permalinkText.select();
    permalinkText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(permalinkText.value);
    // show copy-status
    copyStatus.classList.add("animating");
    //fade out after 1.5s
    setTimeout(() => {
      copyStatus.classList.add("fade-out-500");
      setTimeout(() => {
        copyStatus.classList.remove("fade-out-500", "animating");
      }, 500);
    }, 1500);
  };

  const pinDateEl = document.getElementById("permalink-checkbox-date");
  function updatePermalink() {
    mymap.updateHash();
    // update text input
    let dD = {};
    for (const dim of ["o", "n", "e"]) {
      if (mymap.hashObj.dD[dim])
        if (pinDateEl.checked)
          dD[dim] = {
            c: mymap.hashObj.dD[dim].c,
            v: mymap.hashObj.dD[dim].v,
            h: mymap.hashObj.dD[dim].h,
          };
        else
          dD[dim] = {
            c: mymap.hashObj.dD[dim].c,
            v: mymap.hashObj.dD[dim].v,
          };
    }
    permalinkText.value = `${mymap.url.origin}${mymap.url.pathname}#d="${
      mymap.dim
    }"&dD=${encodeURIComponent(JSON.stringify(dD))}`;
  }
  pinDateEl.onchange = updatePermalink;

  mymap.sidebar.on("content", function (e) {
    if (e.id === "link") {
      // when tab is open, listen for view change events and update hash
      mymap.on("moveend zoomend", updatePermalink);
      // update hashObj with non-coord settings
      mymap.hashObj.dD[mymap.dim].v = Array.from(mymap.dimData.visibleLayers);
      mymap.hashObj.dD[mymap.dim].h.d = mymap.dimData.timeline.date;
      mymap.hashObj.dD[mymap.dim].h.e = mymap.dimData.timeline.exact;
      mymap.hashObj.dD[mymap.dim].h.f = mymap.dimData.timeline.fill;
      // TODO: other settings?
      updatePermalink();
    } else {
      mymap.off("moveend zoomend", updatePermalink);
    }
  });
  mymap.sidebar.on("closing", function () {
    mymap.off("moveend zoomend", updatePermalink);
  });
}

// TODO: clean up
// TODO: allow creating (and saving) multiple markers on each dimension?
// store markers / marker settings in hashObj?
// save to JSON? load from JSON?
function setupCoordinatePanel(mymap) {
  const currentCoordsDiv = document.getElementById("locate-current-coords");
  function updateCurrentCoords() {
    const [x, z] = mymap
      .mcProject(mymap.getCenter())
      .map((c) => (mymap.dim === "n" ? c / 8 : c))
      .map(Math.round);
    currentCoordsDiv.innerHTML = `地図の中心の座標は<b>[X=${x}, Z=${z}]</b>です`;
  }
  mymap.sidebar.on("content", function (e) {
    if (e.id === "locate") {
      // when tab is open, listen for view change events and
      // update current coord display
      mymap.on("moveend zoomend move zoom", updateCurrentCoords);
      updateCurrentCoords();
    } else {
      mymap.off("moveend zoomend move zoom", updateCurrentCoords);
    }
  });
  mymap.sidebar.on("closing", function () {
    mymap.off("moveend zoomend move zoom", updateCurrentCoords);
  });

  const goHomeButton = document.getElementById("locate-go-home");
  goHomeButton.onclick = () => {
    const { defaultX, defaultZ, defaultZoom } = mymap.dimData;
    mymap.setView(mymap.mcUnproject([defaultX, defaultZ]), defaultZoom, {
      animate: true,
    });
  };

  const coords = document.getElementById("locate-marker-div");
  const coordsClose = coords.appendChild(document.createElement("div"));
  coordsClose.innerHTML = "<button>🗑削除</button>";
  coordsClose.classList.add("locate-close-button");

  const popup = document.createElement("div");
  const closeButton = popup.appendChild(document.createElement("div"));
  closeButton.innerHTML = "<button>🗑削除</button>";
  closeButton.classList.add("locate-close-button");
  const marker = L.marker();
  marker.bindPopup(popup);

  mymap.sidebar.coordsControl = {};
  // runs on dimension change
  mymap.sidebar.coordsControl.init = () => {
    const centerTool = document.getElementById("locate-center-tool");
    while (centerTool.lastChild) {
      centerTool.removeChild(centerTool.lastChild);
    }
    const centerToolInputs = centerInputs("locate-center-input");
    centerTool.appendChild(centerToolInputs.div);

    coords.style.display = "none";
    while (coords.lastChild !== coordsClose) {
      coords.removeChild(coords.lastChild);
    }
    const sidebarInputs = markerInputs(marker, "sidebar-marker-coords-input");
    sidebarInputs.update(null, null);
    coords.appendChild(sidebarInputs.div);
    while (popup.lastChild !== closeButton) {
      popup.removeChild(popup.lastChild);
    }
    const popupInputs = markerInputs(marker, "popup-marker-coords-input");
    popup.appendChild(popupInputs.div);

    marker.updates = [sidebarInputs.update, popupInputs.update];

    coordsClose.onclick = () => {
      marker.remove();
      sidebarInputs.update(null, null);
      coords.style.display = "none";
    };
    closeButton.onclick = coordsClose.onclick;

    centerToolInputs.pinButton.onclick = () => {
      const { x: x0, z: z0 } = centerToolInputs.values();

      // invalid inputs become an empty string?
      if ((x0 !== 0 && !x0) || (z0 !== 0 && !z0)) return;
      const scale = mymap.dim === "n" ? 8 : 1;
      const x = Math.min(Math.max(x0, mymap.dimData.minX), mymap.dimData.maxX);
      const z = Math.min(Math.max(z0, mymap.dimData.minZ), mymap.dimData.maxZ);

      marker.setLatLng(mymap.mcUnproject([scale * x, scale * z])).addTo(mymap);
      mymap.panTo(marker.getLatLng(), { animate: true });

      sidebarInputs.update(x, z);
      popupInputs.update(x, z);

      marker._icon.classList.add("coord-marker");
      marker.openPopup();
      coords.style.display = "";
    };

    const setCoordMarker = (e) => {
      const [x, z] = mymap
        .mcProject(e.latlng)
        .map((c) => (mymap.dim === "n" ? c / 8 : c))
        .map(Math.round);

      sidebarInputs.update(x, z);
      popupInputs.update(x, z);

      marker.setLatLng(e.latlng).addTo(mymap);
      marker._icon.classList.add("coord-marker");
      marker.openPopup();
      coords.style.display = "";
    };

    const coordCheckbox = document.getElementById("coord-checkbox");
    coordCheckbox.checked = false;
    mymap.off("click");
    coordCheckbox.onchange = () => {
      if (coordCheckbox.checked) {
        mymap.on("click", setCoordMarker);
      } else {
        mymap.off("click", setCoordMarker);
      }
    };
  };

  function coordInputDiv(id) {
    const div = document.createElement("div");
    div.classList.add("coord-input-container");
    div.id = id;

    const spanX = div.appendChild(document.createElement("span"));
    spanX.innerHTML = `<label for="${id}-x">X=</label>`;
    const inputX = spanX.appendChild(document.createElement("input"));
    inputX.type = "number";
    inputX.size = 8;
    inputX.id = `${id}-x`;
    inputX.min = mymap.dimData.minX;
    inputX.max = mymap.dimData.maxX;
    inputX.step = "1";
    const spanZ = div.appendChild(document.createElement("span"));
    spanZ.innerHTML = `&nbsp;<label for="${id}-z">Z=</label>`;
    const inputZ = spanZ.appendChild(document.createElement("input"));
    inputZ.type = "number";
    inputZ.size = 8;
    inputZ.id = `${id}-z`;
    inputZ.min = mymap.dimData.minZ;
    inputZ.max = mymap.dimData.maxZ;
    inputZ.step = "1";
    return { div, inputX, inputZ };
  }

  function centerInputs(id) {
    const { div, inputX, inputZ } = coordInputDiv(id);
    const container = div.appendChild(document.createElement("div"));
    container.classList.add("locate-button-container");
    const goButton = container.appendChild(document.createElement("button"));
    goButton.textContent = "中心にする";
    goButton.onclick = () => {
      const x0 = inputX.value;
      const z0 = inputZ.value;
      // invalid inputs become an empty string?
      if ((x0 !== 0 && !x0) || (z0 !== 0 && !z0)) return;
      const scale = mymap.dim === "n" ? 8 : 1;
      const x = Math.min(Math.max(x0, mymap.dimData.minX), mymap.dimData.maxX);
      const z = Math.min(Math.max(z0, mymap.dimData.minZ), mymap.dimData.maxZ);
      mymap.panTo(mymap.mcUnproject([scale * x, scale * z]), { animate: true });
    };
    const resetButton = container.appendChild(document.createElement("button"));
    resetButton.textContent = "中心にリセット";
    resetButton.onclick = reset;

    const pinButton = container.appendChild(document.createElement("button"));
    pinButton.textContent = "📍を設置";

    function update(x, z) {
      inputX.value = x;
      inputZ.value = z;
    }

    function values() {
      return { x: inputX.value, z: inputZ.value };
    }

    function reset() {
      if (mymap.getCenter()) {
        const [x, z] = mymap
          .mcProject(mymap.getCenter())
          .map((c) => (mymap.dim === "n" ? c / 8 : c))
          .map(Math.round);
        update(x, z);
      }
    }
    reset();

    return { div, values, pinButton };
  }

  function markerInputs(marker, id) {
    const { div, inputX, inputZ } = coordInputDiv(id);
    const container = div.appendChild(document.createElement("div"));
    container.classList.add("locate-button-container");
    const goButton = container.appendChild(document.createElement("button"));
    goButton.textContent = "移動して中心に表示";
    goButton.onclick = () => {
      const x0 = inputX.value;
      const z0 = inputZ.value;
      // invalid inputs become an empty string?
      if ((x0 !== 0 && !x0) || (z0 !== 0 && !z0)) return;
      const scale = mymap.dim === "n" ? 8 : 1;
      const x = Math.min(Math.max(x0, mymap.dimData.minX), mymap.dimData.maxX);
      const z = Math.min(Math.max(z0, mymap.dimData.minZ), mymap.dimData.maxZ);
      marker.setLatLng(mymap.mcUnproject([scale * x, scale * z]));
      mymap.panTo(marker.getLatLng(), { animate: true });
      for (const update of marker.updates) {
        update(x, z);
      }
    };
    const resetButton = container.appendChild(document.createElement("button"));
    resetButton.textContent = "位置にリセット";
    resetButton.onclick = reset;

    function update(x, z) {
      inputX.value = x;
      inputZ.value = z;
    }

    function reset() {
      if (marker.getLatLng()) {
        const [x, z] = mymap
          .mcProject(marker.getLatLng())
          .map((c) => (mymap.dim === "n" ? c / 8 : c))
          .map(Math.round);
        update(x, z);
      }
    }
    reset();

    return { div, update, reset };
  }
}

myScale = L.Control.Scale.extend({
  _update: function () {
    var map = this._map,
      y = map.getSize().y / 2;

    const p1 = map
      .mcProject(map.containerPointToLatLng([0, y]))
      .map((c) => (map.dim === "n" ? c / 8 : c));
    const p2 = map
      .mcProject(map.containerPointToLatLng([this.options.maxWidth, y]))
      .map((c) => (map.dim === "n" ? c / 8 : c));

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
  await changeDim(mymap, mymap.hashObj.d || "o");

  new myScale({ imperial: false, maxWidth: 200 }).addTo(mymap);

  window.mymap = mymap;
  return mymap;
}
