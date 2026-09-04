import { describe, it, expect } from "vitest";
import {
  authorColor,
  authorCounts,
  authorName,
  authorRank,
  clusterPhotos,
  filterByAuthor,
  hashLayerIds,
  hashPhotosVisible,
  photoCaption,
  photoDates,
  photoUrls,
  selectPhotos,
  terrainDateFor,
  timelineMode,
} from "./photos.js";

/** The registry as `photos.json` ships it: ids to display names. */
const AUTHORS = { 1: { name: "pupu" }, 2: { name: "鹿" }, 3: { name: "りり" } };

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

  it("reports whose photos it holds, in proportion, for the pin's accent bar", () => {
    const clusters = clusterPhotos(
      [
        place(photo("20220101", "a", { by: 2 }), 10, 10),
        place(photo("20220102", "b", { by: 2 }), 20, 20),
        place(photo("20220103", "c", { by: 1 }), 30, 30),
      ],
      100
    );
    // Ordered by id, not by count, so one author's segment is in the same
    // place on every pin and the bar reads across the map.
    expect(clusters[0].authors).toEqual([{ by: 1, count: 1 }, { by: 2, count: 2 }]);
  });

  it("counts only the photos the timeline says exist", () => {
    // The pin already refuses to wear a future photo and already splits its
    // count `3+2`; a bar drawn over the whole stack would be the one part of
    // the pin still claiming a future photo is there.
    const clusters = clusterPhotos(
      [
        place(photo("20220101", "past", { by: 1 }), 10, 10, false),
        place(photo("20240101", "future", { by: 2 }), 20, 20, true),
      ],
      100
    );
    expect(clusters[0].authors).toEqual([{ by: 1, count: 1 }]);
  });

  it("falls back to all of them when the whole cluster is future", () => {
    // A bar of nothing is not an improvement on a bar dimmed with its pin.
    const clusters = clusterPhotos(
      [
        place(photo("20240101", "a", { by: 2 }), 10, 10, true),
        place(photo("20240102", "b", { by: 3 }), 20, 20, true),
      ],
      100
    );
    expect(clusters[0].authors).toEqual([{ by: 2, count: 1 }, { by: 3, count: 1 }]);
  });

  it("has nothing to say about photos that carry no author", () => {
    const clusters = clusterPhotos([place(photo("20220101", "a"), 10, 10)], 100);
    expect(clusters[0].authors).toEqual([]);
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

describe("authorName", () => {
  it("resolves an id through the layer's registry", () => {
    expect(authorName(AUTHORS, 2)).toBe("鹿");
  });

  it("renders nothing for an id the registry does not carry", () => {
    // A photo whose author cannot be named is not a photo by somebody called
    // "9"; the caption drops the credit rather than printing a number.
    expect(authorName(AUTHORS, 9)).toBeUndefined();
  });

  it("survives a layer with no registry at all", () => {
    expect(authorName(undefined, 1)).toBeUndefined();
  });
});

describe("authorColor", () => {
  it("gives nobody a colour while there is nobody to tell apart", () => {
    // A data repo whose photos are all one person's should look exactly as it
    // did before any of this existed.
    expect(authorColor({ 1: { name: "pupu" } }, 1)).toBeUndefined();
    expect(authorColor(undefined, 1)).toBeUndefined();
  });

  it("gives each author a different one", () => {
    const colors = [1, 2, 3].map((id) => authorColor(AUTHORS, id));
    expect(new Set(colors).size).toBe(3);
  });

  it("keys on the id, not on the author's place in the registry", () => {
    // This is the whole reason it is by id. A layer lists only the authors it
    // credits, so the end's registry can be a subset of the overworld's -- and
    // colouring by position would give one person two colours depending on
    // which dimension you were looking at.
    const end = { 2: { name: "鹿" }, 3: { name: "りり" } };
    expect(authorColor(end, 2)).toBe(authorColor(AUTHORS, 2));
    expect(authorColor(end, 3)).toBe(authorColor(AUTHORS, 3));
  });

  it("has none for an unregistered id", () => {
    expect(authorColor(AUTHORS, 9)).toBeUndefined();
  });

  it("takes the colour the site names over the palette's", () => {
    const config = { authorColors: { 3: "#e05d9e" } };
    expect(authorColor(AUTHORS, 3, config)).toBe("#e05d9e");
    // And leaves everybody it does not name where the palette put them.
    expect(authorColor(AUTHORS, 2, config)).toBe(authorColor(AUTHORS, 2));
  });

  it("does not let an override colour a map with one contributor", () => {
    // The switch is "is there anybody to tell apart", and naming a colour is
    // not an answer to it.
    expect(authorColor({ 1: { name: "pupu" } }, 1, { authorColors: { 1: "#f00" } }))
      .toBeUndefined();
  });
});

describe("authorRank", () => {
  it("is the place the site asked for", () => {
    expect(authorRank({ authorOrder: [3, 1, 2] }, 3)).toBe(0);
    expect(authorRank({ authorOrder: [3, 1, 2] }, 2)).toBe(2);
  });

  it("puts everybody unnamed together at the end", () => {
    // Sharing one rank is what lets the older rule break their tie, so a
    // partial list means "these first, then carry on as before".
    expect(authorRank({ authorOrder: [3] }, 1)).toBe(authorRank({ authorOrder: [3] }, 2));
    expect(authorRank({ authorOrder: [3] }, 1)).toBeGreaterThan(0);
  });

  it("ranks everybody the same with no config at all", () => {
    expect(authorRank(undefined, 1)).toBe(authorRank({}, 2));
  });
});

describe("authorCounts", () => {
  const set = [
    photo("20220101", "a", { by: 2 }),
    photo("20220102", "b", { by: 1 }),
    photo("20220103", "c", { by: 2 }),
    photo("20220104", "d", { by: 3 }),
    photo("20220105", "e", { by: 2 }),
  ];

  it("counts each author and orders by count, largest first", () => {
    expect(authorCounts(set, AUTHORS).map((a) => [a.name, a.count])).toEqual([
      ["鹿", 3],
      ["pupu", 1],
      ["りり", 1],
    ]);
  });

  it("breaks a tie on the id, so the order holds still", () => {
    const ids = authorCounts(set, AUTHORS).map((a) => a.id);
    expect(ids.slice(1)).toEqual([1, 3]);
  });

  it("carries the colour the chips and the pins share", () => {
    expect(authorCounts(set, AUTHORS)[0].color).toBe(authorColor(AUTHORS, 2));
  });

  it("leaves out an author it cannot name", () => {
    expect(authorCounts([...set, photo("20220106", "f", { by: 9 })], AUTHORS))
      .toHaveLength(3);
  });

  it("puts the chips in the order the site asked for", () => {
    const order = authorCounts(set, AUTHORS, { authorOrder: [3, 1, 2] });
    expect(order.map((a) => a.name)).toEqual(["りり", "pupu", "鹿"]);
  });

  it("sorts anybody the order does not name by share, as before", () => {
    // A partial list is "these first, then whatever you were doing", so the
    // rest keep the count ordering rather than falling into id order.
    expect(authorCounts(set, AUTHORS, { authorOrder: [1] }).map((a) => a.name))
      .toEqual(["pupu", "鹿", "りり"]);
  });

  it("carries the site's colour into the chips", () => {
    const config = { authorColors: { 2: "#43c59e" } };
    expect(authorCounts(set, AUTHORS, config)[0].color).toBe("#43c59e");
  });
});

describe("filterByAuthor", () => {
  const items = [
    { photo: photo("20220101", "a", { by: 1 }), dimmed: false },
    { photo: photo("20220102", "b", { by: 2 }), dimmed: false },
  ];

  it("null is everybody, and costs nothing", () => {
    expect(filterByAuthor(items, null)).toBe(items);
  });

  it("keeps only the authors asked for", () => {
    expect(filterByAuthor(items, new Set([2])).map((i) => i.photo.f)).toEqual(["b"]);
  });

  it("an empty set is nobody, not everybody", () => {
    // Unticking the last author shows nothing, and it should: the alternative
    // is a set of checkboxes that silently disagrees with itself.
    expect(filterByAuthor(items, new Set())).toEqual([]);
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

  it("credits whoever took it, before the date", () => {
    expect(photoCaption(photo("20240828", "a", { by: 2 }), format, AUTHORS)).toBe(
      "撮影: 鹿 ・ 2024年08月28日 ・ [X=100, Y=64, Z=200]"
    );
  });

  it("credits the site owner too, rather than treating them as the default", () => {
    // A map that names other people only when it is not the owner's photo is a
    // map that quietly claims the rest.
    expect(photoCaption(photo("20240828", "a", { by: 1 }), format, AUTHORS))
      .toContain("撮影: pupu");
  });

  it("says nothing at all about an author it cannot name", () => {
    expect(photoCaption(photo("20240828", "a", { by: 9 }), format, AUTHORS)).toBe(
      "2024年08月28日 ・ [X=100, Y=64, Z=200]"
    );
  });

  it("is unchanged for a layer that carries no authors", () => {
    expect(photoCaption(photo("20240828"), format)).toBe(
      "2024年08月28日 ・ [X=100, Y=64, Z=200]"
    );
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

describe("hashPhotosVisible", () => {
  it("reads the setting", () => {
    expect(hashPhotosVisible({ pv: 1 })).toBe(true);
    expect(hashPhotosVisible({ pv: true })).toBe(true);
  });

  it("is off for a hash that says nothing", () => {
    expect(hashPhotosVisible({})).toBe(false);
    expect(hashPhotosVisible(undefined)).toBe(false);
    expect(hashPhotosVisible({ pv: 0 }, [102], new Set())).toBe(false);
  });

  it("still reads the old spelling, a photo layer id in `v`", () => {
    // Links in the wild predate `pv` and carry the layer id instead. They have
    // to keep opening the map they described.
    expect(hashPhotosVisible({}, [102], new Set([102]))).toBe(true);
  });

  it("ignores layers that are not the photo layer", () => {
    expect(hashPhotosVisible({}, [102], new Set([1, 7]))).toBe(false);
  });
});

describe("hashLayerIds", () => {
  const layers = [
    { id: 1, name: "Spawn" },
    { id: 102, name: "写真", kind: "photos" },
  ];

  it("leaves the photo layer out of what a URL publishes", () => {
    expect(hashLayerIds(new Set([1, 102]), layers)).toEqual([1]);
  });

  it("keeps every other visible layer, in order", () => {
    expect(hashLayerIds(new Set([1, 7, 102]), layers)).toEqual([1, 7]);
  });

  it("passes everything through where the dimension has no photo layer", () => {
    expect(hashLayerIds(new Set([1, 102]), [{ id: 1 }])).toEqual([1, 102]);
    expect(hashLayerIds(new Set([1]), undefined)).toEqual([1]);
  });

  it("copes with an empty set", () => {
    expect(hashLayerIds(new Set(), layers)).toEqual([]);
    expect(hashLayerIds(undefined, layers)).toEqual([]);
  });
});
