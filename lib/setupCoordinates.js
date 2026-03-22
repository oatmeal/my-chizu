import { dimScale } from "./dimensions.js";

// TODO: clean up
// TODO: allow creating (and saving) multiple markers on each dimension?
// store markers / marker settings in hashObj?
// save to JSON? load from JSON?
export function setupCoordinatePanel(mymap) {
  const currentCoordsDiv = document.getElementById("locate-current-coords");
  function updateCurrentCoords() {
    const [x, z] = mymap
      .mcProject(mymap.getCenter())
      .map((c) => (c / dimScale(mymap.dim)))
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

  // runs on dimension change
  function initCoords() {
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
      const scale = dimScale(mymap.dim);
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
        .map((c) => (c / dimScale(mymap.dim)))
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
  }

  mymap.on("dimviewready", initCoords);

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
      const scale = dimScale(mymap.dim);
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
          .map((c) => (c / dimScale(mymap.dim)))
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
      const scale = dimScale(mymap.dim);
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
          .map((c) => (c / dimScale(mymap.dim)))
          .map(Math.round);
        update(x, z);
      }
    }
    reset();

    return { div, update, reset };
  }
}
