import { describe, it, expect } from "vitest";
import {
  clusterPhotos,
  photoCaption,
  photoDates,
  photoUrls,
  selectPhotos,
  terrainDateFor,
  timelineMode,
} from "./photos.js";

const photo = (date, f = date, extra = {}) => ({
  f,
  date,
  pos: [100, 64, 200],
  src: "filename",
  ...extra,
});

const PHOTOS = [photo("20220101"), photo("20220601"), photo("20230101")];

describe("selectPhotos", () => {
  it("exact keeps only photos taken on the date", () => {
    const kept = selectPhotos(PHOTOS, "20220601", "e");
    expect(kept.map((k) => k.photo.date)).toEqual(["20220601"]);
  });

  it("before keeps everything up to and including the date", () => {
    const kept = selectPhotos(PHOTOS, "20220601", "b");
    expect(kept.map((k) => k.photo.date)).toEqual(["20220101", "20220601"]);
  });

  it("before dims nothing", () => {
    expect(selectPhotos(PHOTOS, "20220601", "b").every((k) => !k.dimmed)).toBe(true);
  });

  it("fill keeps every photo", () => {
    expect(selectPhotos(PHOTOS, "20220601", "f")).toHaveLength(3);
  });

  it("fill dims only the photos that postdate the selection", () => {
    const kept = selectPhotos(PHOTOS, "20220601", "f");
    expect(kept.map((k) => k.dimmed)).toEqual([false, false, true]);
  });

  it("empties the map before the first photo was taken", () => {
    expect(selectPhotos(PHOTOS, "20210101", "b")).toEqual([]);
    expect(selectPhotos(PHOTOS, "20210101", "e")).toEqual([]);
  });

  it("leaves the input alone", () => {
    const input = [...PHOTOS];
    selectPhotos(input, "20220601", "f");
    expect(input).toEqual(PHOTOS);
  });
});

describe("timelineMode", () => {
  it("matches the tile mode letters", () => {
    expect(timelineMode({ exact: true, fill: true })).toBe("e");
    expect(timelineMode({ exact: false, fill: true })).toBe("f");
    expect(timelineMode({ exact: false, fill: false })).toBe("b");
  });
});

describe("clusterPhotos", () => {
  const place = (photo, x, y, dimmed = false) => ({ photo, x, y, dimmed });

  it("merges photos that land in one cell", () => {
    const clusters = clusterPhotos(
      [place(photo("20220101", "a"), 10, 10), place(photo("20220102", "b"), 40, 40)],
      100
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(2);
  });

  it("separates photos in different cells", () => {
    const clusters = clusterPhotos(
      [place(photo("20220101", "a"), 10, 10), place(photo("20220102", "b"), 410, 10)],
      100
    );
    expect(clusters).toHaveLength(2);
  });

  it("leads a cluster with its newest photo", () => {
    const clusters = clusterPhotos(
      [
        place(photo("20220101", "old"), 10, 10),
        place(photo("20240101", "new"), 40, 40),
        place(photo("20230101", "mid"), 20, 20),
      ],
      100
    );
    expect(clusters[0].lead.f).toBe("new");
    expect(clusters[0].photos.map((p) => p.f)).toEqual(["new", "mid", "old"]);
  });

  it("breaks a same-date tie stably by file stem", () => {
    const items = [
      place(photo("20220101", "b"), 10, 10),
      place(photo("20220101", "a"), 20, 20),
    ];
    expect(clusterPhotos(items, 100)[0].photos.map((p) => p.f)).toEqual(["b", "a"]);
    expect(clusterPhotos(items.slice().reverse(), 100)[0].photos.map((p) => p.f)).toEqual(
      ["b", "a"]
    );
  });

  it("anchors the cluster on its lead photo, not on the cell", () => {
    const clusters = clusterPhotos(
      [place(photo("20220101", "old"), 10, 10), place(photo("20240101", "new"), 90, 90)],
      100
    );
    expect([clusters[0].x, clusters[0].y]).toEqual([90, 90]);
  });

  it("dims a cluster only when every photo in it is dim", () => {
    const mixed = clusterPhotos(
      [
        place(photo("20220101", "a"), 10, 10, true),
        place(photo("20220102", "b"), 20, 20, false),
      ],
      100
    );
    expect(mixed[0].dimmed).toBe(false);
    const all = clusterPhotos(
      [
        place(photo("20220101", "a"), 10, 10, true),
        place(photo("20220102", "b"), 20, 20, true),
      ],
      100
    );
    expect(all[0].dimmed).toBe(true);
  });

  it("splits a cell as the pixel size shrinks, which is what zooming in does", () => {
    const items = [
      place(photo("20220101", "a"), 10, 10),
      place(photo("20220102", "b"), 90, 90),
    ];
    expect(clusterPhotos(items, 100)).toHaveLength(1);
    expect(clusterPhotos(items, 40)).toHaveLength(2);
  });

  it("handles negative screen positions, which are just off-view", () => {
    const clusters = clusterPhotos(
      [place(photo("20220101", "a"), -110, -110), place(photo("20220102", "b"), 10, 10)],
      100
    );
    expect(clusters).toHaveLength(2);
  });

  it("keeps two pins a cell apart even when the cell edge does not", () => {
    // The bug the sweep exists for: a grid bounds the average density but not
    // the overlap, because a pin is anchored on a real photo and two photos
    // either side of a cell edge can be a pixel apart.
    const clusters = clusterPhotos(
      [place(photo("20220101", "a"), 99, 50), place(photo("20220102", "b"), 101, 50)],
      100
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(2);
  });

  it("absorbs a cell into its host rather than letting it seed a pin", () => {
    // `c` is within a cell of the first cluster's anchor, so it joins it -- and
    // then `d`, a cell further on, is measured against that same anchor rather
    // than against `c`. Without the cell-to-host bookkeeping a run of near
    // neighbours walks across the map as a chain of overlapping pairs.
    const clusters = clusterPhotos(
      [
        place(photo("20220101", "a"), 0, 0),
        place(photo("20220102", "b"), 95, 0),
        place(photo("20220103", "c"), 190, 0),
        place(photo("20220104", "d"), 285, 0),
      ],
      100
    );
    expect(clusters.map((c) => c.count)).toEqual([3, 1]);
    expect(clusters.map((c) => c.x)).toEqual([95, 285]);
  });

  it("never draws two pins closer together than a cell", () => {
    // 200 photos scattered over a small patch: whatever falls out, no two pins
    // may be nearer than the cell, which is what the pin size is chosen against.
    const placed = [];
    for (let i = 0; i < 200; i++) {
      const x = ((i * 37) % 301) + (i % 7);
      const y = ((i * 53) % 301) + (i % 11);
      placed.push(place(photo(`2022010${i % 9}`, `f${i}`), x, y));
    }
    const clusters = clusterPhotos(placed, 100);
    expect(clusters.length).toBeGreaterThan(1);
    for (const a of clusters) {
      for (const b of clusters) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(100);
      }
    }
    expect(clusters.reduce((n, c) => n + c.count, 0)).toBe(200);
  });

  it("does not depend on the order the photos arrived in", () => {
    const items = [
      place(photo("20220101", "a"), 10, 10),
      place(photo("20220102", "b"), 95, 20),
      place(photo("20220103", "c"), 400, 400),
    ];
    const forward = clusterPhotos(items, 100);
    const back = clusterPhotos(items.slice().reverse(), 100);
    expect(back.map((c) => [c.x, c.y, c.count])).toEqual(
      forward.map((c) => [c.x, c.y, c.count])
    );
  });

  it("leads with the newest photo that the timeline says exists", () => {
    // A mixed cluster used to render its newest photo, a future one, at full
    // brightness -- a photo the timeline had decided was not taken yet looking
    // exactly like one that was.
    const clusters = clusterPhotos(
      [
        place(photo("20220101", "past"), 10, 10, false),
        place(photo("20240101", "future"), 20, 20, true),
      ],
      100
    );
    expect(clusters[0].lead.f).toBe("past");
    expect(clusters[0].dimmed).toBe(false);
    expect(clusters[0].dimCount).toBe(1);
    expect(clusters[0].count).toBe(2);
  });

  it("opens the lightbox on the photo the pin was showing", () => {
    const clusters = clusterPhotos(
      [
        place(photo("20220101", "past"), 10, 10, false),
        place(photo("20240101", "future"), 20, 20, true),
      ],
      100
    );
    const { photos, leadIndex, lead } = clusters[0];
    expect(photos[leadIndex]).toBe(lead);
  });

  it("orders clusters north to south so nearer pins paint last", () => {
    const clusters = clusterPhotos(
      [
        place(photo("20220101", "south"), 0, 500),
        place(photo("20220102", "north"), 0, 0),
      ],
      100
    );
    expect(clusters.map((c) => c.lead.f)).toEqual(["north", "south"]);
  });

  it("returns nothing for nothing", () => {
    expect(clusterPhotos([], 100)).toEqual([]);
  });
});

describe("photoUrls", () => {
  const config = { baseUrl: "photos/", thumbUrl: "photos/thumb/" };

  it("builds both sizes from the stem", () => {
    expect(photoUrls(photo("20240828", "20240828/6827x740z"), config)).toEqual({
      full: "photos/20240828/6827x740z.webp",
      thumb: "photos/thumb/20240828/6827x740z.webp",
    });
  });

  it("takes an absolute base unchanged, so the set can move off-repo", () => {
    expect(
      photoUrls(photo("20240828", "a/b"), {
        baseUrl: "https://example.github.io/llmr-photos/",
        thumbUrl: "https://example.github.io/llmr-photos/thumb/",
      }).full
    ).toBe("https://example.github.io/llmr-photos/a/b.webp");
  });
});

describe("photoCaption", () => {
  const format = (d) => `${d.slice(0, 4)}年${d.slice(4, 6)}月${d.slice(6)}日`;

  it("reads title, date and position", () => {
    expect(photoCaption(photo("20240828", "a", { title: "拠点" }), format)).toBe(
      "拠点 ・ 2024年08月28日 ・ [X=100, Y=64, Z=200]"
    );
  });

  it("leaves out a title that was never written", () => {
    expect(photoCaption(photo("20240828"), format)).toBe(
      "2024年08月28日 ・ [X=100, Y=64, Z=200]"
    );
  });

  it("includes the clock time when the taskbar gave one", () => {
    expect(photoCaption(photo("20240828", "a", { time: "12:28" }), format)).toContain(
      "2024年08月28日 12:28"
    );
  });

  it("omits Y when the position came from a filename, which carries no height", () => {
    const p = { ...photo("20240828"), pos: [100, null, 200] };
    expect(photoCaption(p, format)).toContain("[X=100, Z=200]");
  });
});

describe("photoDates", () => {
  it("groups photos into one entry per date", () => {
    const grouped = photoDates([photo("20220101", "a"), photo("20220101", "b")]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].photos).toHaveLength(2);
  });

  it("sorts ascending, which buildTimelineEntries requires", () => {
    const grouped = photoDates([photo("20230101"), photo("20220101"), photo("20220601")]);
    expect(grouped.map((g) => g.date)).toEqual(["20220101", "20220601", "20230101"]);
  });

  it("returns nothing for nothing", () => {
    expect(photoDates([])).toEqual([]);
  });
});

describe("terrainDateFor", () => {
  const dates = ["20220101", "20220601", "20230101"];

  it("picks the nearest earlier tile date", () => {
    expect(terrainDateFor(dates, "20220815")).toBe("20220601");
  });

  it("picks the date itself when tiles exist for it", () => {
    expect(terrainDateFor(dates, "20220601")).toBe("20220601");
  });

  it("falls forward for a photo that predates the whole map", () => {
    expect(terrainDateFor(dates, "20210101")).toBe("20220101");
  });

  it("stays on the last tile date for a photo after the map ends", () => {
    expect(terrainDateFor(dates, "20250101")).toBe("20230101");
  });
});
