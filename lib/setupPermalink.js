import { buildPermalinkUrl } from "./permalink.js";

export function setupPermalinkPanel(mymap) {
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
    permalinkText.value = buildPermalinkUrl(
      mymap.url,
      mymap.dim,
      mymap.hashObj,
      pinDateEl.checked
    );
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
