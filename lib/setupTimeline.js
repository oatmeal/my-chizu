import {
  buildTimelineEntries,
  formatDate,
  groupSummaryHtml,
  vodIconHtml,
  vodUrl,
} from "./timeline.js";
import { DIM_NETHER, dimTilePath } from "./dimensions.js";
import { terrainDateFor } from "./photos.js";

export async function getTileReplacements(mymap) {
  const { date, exact, fill, dateCache } = mymap.dimData.timeline;
  const mode = exact ? "e" : fill ? "f" : "b";
  const key = `${date}-${mode}`;
  if (!dateCache[key]) {
    const dim = dimTilePath(mymap.dim);
    dateCache[key] = await (await fetch(`data/${dim}/${key}.json`)).json();
  }
  mymap.dimData.timeline.tileReplacements = dateCache[key].tileReplacements;
  mymap.dimData.timeline.skip = dateCache[key].skip;
}

export async function setupTimelinePanel(mymap) {
  const dateDisplayNames = await (await fetch(`data/dates.json`)).json();
  const format = (date) => formatDate(date, dateDisplayNames);
  const vods = await (await fetch(`data/vods.json`)).json();
  // The photo layer and the photos pane both format dates; this is the one
  // place the display names are loaded, so hang the formatter off the map.
  mymap.formatDate = format;
  const current = document.getElementById("timeline-current");
  function updateCurrent(date) {
    current.innerHTML =
      (mymap.dim === DIM_NETHER
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
    mymap.fire("timelinechange");
  };

  const fillEl = document.getElementById("timeline-checkbox-after");
  const fillLabelEl = document.getElementById("timeline-checkbox-after-label");
  fillEl.onchange = async () => {
    mymap.dimData.timeline.fill = fillEl.checked;

    updateCurrent(mymap.dimData.timeline.date);

    await getTileReplacements(mymap);
    mymap.dimData.base.redraw();
    mymap.fire("timelinechange");
  };

  const timelineRadio = document.getElementById("timeline-radio");

  function initTimelinePanel(dates) {
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
        const date = mymap.dimData.dates[nextIndex];
        selectRadio(date, { scroll: true });
        markPhotoRows(date);
        await applyTimeline(date);
      }

      left.onclick = () => onclickHelper(index - 1);
      right.onclick = () => onclickHelper(index + 1);
    }

    while (timelineRadio.firstChild) {
      timelineRadio.removeChild(timelineRadio.firstChild);
    }
    const yearDivs = {};
    const monthDivs = {};
    // Photo-only rows, by date, so the current one can be highlighted.
    const photoRowEls = new Map();
    const tileDates = new Set(dates);

    // Ensure year and month <details> groups exist for a given date string.
    // Creates them (appended to timelineRadio) if missing.
    function ensureYearMonth(dateStr) {
      const yearKey = dateStr.slice(0, 4);
      const monthKey = dateStr.slice(0, 6);
      if (!yearDivs[yearKey]) {
        const details = timelineRadio.appendChild(
          document.createElement("details")
        );
        const summary = details.appendChild(
          document.createElement("summary")
        );
        summary.classList.add("timeline-details-summary");
        yearDivs[yearKey] = {
          details,
          summary,
          prefix: `${yearKey}年`,
          counts: { date: 0, vod: 0, photo: 0 },
        };
      }
      if (!monthDivs[monthKey]) {
        const details = yearDivs[yearKey].details.appendChild(
          document.createElement("details")
        );
        const summary = details.appendChild(
          document.createElement("summary")
        );
        summary.classList.add("timeline-details-summary");
        monthDivs[monthKey] = {
          details,
          summary,
          prefix: `${yearKey}年${dateStr.slice(4, 6)}月`,
          counts: { date: 0, vod: 0, photo: 0 },
        };
      }
    }

    // Open the year and month groups holding `date` so its row is on screen.
    // Returns whether the month group had to be opened — callers that only
    // scroll when the row was previously hidden key off that.
    function openGroupsFor(dateStr) {
      const year = yearDivs[dateStr.slice(0, 4)].details;
      const month = monthDivs[dateStr.slice(0, 6)].details;
      if (!year.hasAttribute("open")) year.open = true;
      const monthWasClosed = !month.hasAttribute("open");
      if (monthWasClosed) month.open = true;
      return monthWasClosed;
    }

    // Apply a timeline selection.
    //
    // `date` chooses the terrain and `photoDate` chooses which photos exist.
    // They are the same for every ordinary selection and differ only for a
    // photo-only row, which has no tiles of its own to select.
    async function applyTimeline(date, photoDate = date) {
      mymap.dimData.timeline.date = date;
      mymap.dimData.timeline.photoDate = photoDate;

      updateCurrent(date);

      updateLeftRight();
      await getTileReplacements(mymap);
      mymap.dimData.base.redraw();
      mymap.fire("timelinechange");
    }

    // Move the radio selection to a tile date, opening its groups on the way.
    function selectRadio(date, { scroll = false } = {}) {
      const previous = document.getElementById(
        `map-timeline-${mymap.dimData.timeline.date}`
      );
      if (previous) previous.checked = false;
      const inputEl = document.getElementById(`map-timeline-${date}`);
      if (!inputEl) return;
      inputEl.checked = true;
      const wasClosed = openGroupsFor(date);
      if (scroll || wasClosed) inputEl.scrollIntoView({ block: "nearest" });
    }

    // Highlight whichever photo-only row the photo filter is currently on.
    function markPhotoRows(photoDate) {
      for (const [date, el] of photoRowEls) {
        el.classList.toggle("timeline-photo-current", date === photoDate);
      }
    }

    // Update the summary HTML for year and month groups after changing counts.
    function updateGroupSummaries(dateStr) {
      const year = yearDivs[dateStr.slice(0, 4)];
      const month = monthDivs[dateStr.slice(0, 6)];
      year.summary.innerHTML = groupSummaryHtml(year);
      month.summary.innerHTML = groupSummaryHtml(month);
    }

    // Add a VOD entry into the timeline, creating year/month groups as needed.
    function addVodEntry(vodDate, vod) {
      ensureYearMonth(vodDate);
      yearDivs[vodDate.slice(0, 4)].counts.vod += 1;
      monthDivs[vodDate.slice(0, 6)].counts.vod += 1;
      updateGroupSummaries(vodDate);
      const vodEl = monthDivs[vodDate.slice(0, 6)].details.appendChild(
        document.createElement("div")
      );
      vodEl.classList.add("timeline-vod-div");
      vodEl.innerHTML = `<a href="${vodUrl(vod.id, vod.t)}" target="_blank" rel="noopener noreferrer">${vodIconHtml(10)} ${format(vodDate)}：${vod.title}`;
    }

    // Add a date's photos into the timeline, creating year/month groups as
    // needed.
    //
    // Most photo dates have no tiles at all -- the great majority of the raw
    // date folders are screenshots with no map in them -- so a photo date
    // usually has no row to attach to and gets one of its own. That row cannot
    // be a tile-selection radio, because there is nothing for it to redraw; it
    // sets the photo filter and drops the terrain back to the nearest earlier
    // tile date, which is what "what did this place look like then" means.
    function addPhotoEntry(photoDate, { count }) {
      ensureYearMonth(photoDate);
      yearDivs[photoDate.slice(0, 4)].counts.photo += count;
      monthDivs[photoDate.slice(0, 6)].counts.photo += count;
      updateGroupSummaries(photoDate);

      // A date that also has tiles already has a selectable row of its own; the
      // count in the month summary is all it needs.
      if (tileDates.has(photoDate)) return;

      const photoEl = monthDivs[photoDate.slice(0, 6)].details.appendChild(
        document.createElement("div")
      );
      photoEl.classList.add("timeline-photo-div");
      photoEl.textContent = `📷 ${format(photoDate)}：${count}枚`;
      photoRowEls.set(photoDate, photoEl);
      photoEl.onclick = async function () {
        const terrain = terrainDateFor(mymap.dimData.dates, photoDate);
        selectRadio(terrain);
        markPhotoRows(photoDate);
        await applyTimeline(terrain, photoDate);
      };
    }

    // Add a selectable tile date into the timeline, creating groups as needed.
    function addDateEntry(date) {
      ensureYearMonth(date);
      const dateEl = monthDivs[date.slice(0, 6)].details.appendChild(
        document.createElement("div")
      );
      yearDivs[date.slice(0, 4)].counts.date += 1;
      monthDivs[date.slice(0, 6)].counts.date += 1;
      updateGroupSummaries(date);

      const inputEl = dateEl.appendChild(document.createElement("input"));
      inputEl.type = "radio";
      inputEl.id = `map-timeline-${date}`;
      inputEl.name = "map-timeline";
      if (date === mymap.dimData.timeline.date) inputEl.checked = true;
      inputEl.onchange = async function () {
        if (inputEl.checked === true && openGroupsFor(date)) {
          inputEl.scrollIntoView({ block: "nearest" });
        }
        markPhotoRows(date);
        await applyTimeline(date);
      };

      const text = dateEl.appendChild(document.createElement("label"));
      text.textContent = format(date);
      text.htmlFor = inputEl.id;
    }

    // `buildTimelineEntries` needs each stream sorted by date, and the build
    // emits the photo counts as a plain date-keyed object.
    const photoEntries = Object.entries(mymap.dimData.photoDates || {})
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    for (const { kind, date, entry } of buildTimelineEntries(dates, [
      { kind: "vod", entries: vods },
      { kind: "photo", entries: photoEntries },
    ])) {
      if (kind === "vod") {
        addVodEntry(date, entry);
      } else if (kind === "photo") {
        addPhotoEntry(date, entry);
      } else {
        addDateEntry(date);
      }
    }

    openGroupsFor(mymap.dimData.timeline.date);
    document
      .getElementById(`map-timeline-${mymap.dimData.timeline.date}`)
      .scrollIntoView({ block: "nearest" });
    markPhotoRows(mymap.dimData.timeline.photoDate);
    updateLeftRight();

    // Clicking a photo sets the timeline to its date, so the terrain under it
    // snaps to what was there and ◀ ▶ then walk history with the photo pinned.
    // Re-bound on every dimension change, because the helpers close over the
    // rows this dimension just built.
    mymap.setTimelineDate = async function (photoDate) {
      const terrain = terrainDateFor(mymap.dimData.dates, photoDate);
      selectRadio(terrain, { scroll: true });
      markPhotoRows(photoDate);
      await applyTimeline(terrain, photoDate);
    };
  }

  mymap.on("dimchange", () => initTimelinePanel(mymap.dimData.dates));

  mymap.sidebar.on("content", function (e) {
    if (e.id === "timeline") {
      document
        .getElementById(`map-timeline-${mymap.dimData.timeline.date}`)
        .scrollIntoView({ block: "nearest" });
    }
  });
}
