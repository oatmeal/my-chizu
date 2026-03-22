import { formatDate, groupSummaryHtml } from "./timeline.js";
import { DIM_NETHER, dimTilePath } from "./dimensions.js";

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
          vods: 0,
          dates: 0,
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
          vods: 0,
          dates: 0,
        };
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
      yearDivs[vodDate.slice(0, 4)].vods += 1;
      monthDivs[vodDate.slice(0, 6)].vods += 1;
      updateGroupSummaries(vodDate);
      const vodEl = monthDivs[vodDate.slice(0, 6)].details.appendChild(
        document.createElement("div")
      );
      vodEl.classList.add("timeline-vod-div");
      vodEl.innerHTML = `<a href="https://twitch.tv/videos/${vod.id}" target="_blank" rel="noopener noreferrer"><img src="TwitchGlitchPurple.svg" height="12"> ${format(vodDate)}：${vod.title}`;
    }

    for (const date of dates) {
      // add vod divs that come before or on this date
      while (vodIndex < vods.length && vods[vodIndex].date <= date) {
        addVodEntry(vods[vodIndex].date, vods[vodIndex]);
        vodIndex++;
      }

      // add date entry
      ensureYearMonth(date);
      const dateEl = monthDivs[date.slice(0, 6)].details.appendChild(
        document.createElement("div")
      );
      yearDivs[date.slice(0, 4)].dates += 1;
      monthDivs[date.slice(0, 6)].dates += 1;
      updateGroupSummaries(date);

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

    // add remaining VODs that come after all dates
    while (vodIndex < vods.length) {
      addVodEntry(vods[vodIndex].date, vods[vodIndex]);
      vodIndex++;
    }

    yearDivs[mymap.dimData.timeline.date.slice(0, 4)].details.open = true;
    monthDivs[mymap.dimData.timeline.date.slice(0, 6)].details.open = true;
    document
      .getElementById(`map-timeline-${mymap.dimData.timeline.date}`)
      .scrollIntoView({ block: "nearest" });
    updateLeftRight();
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
