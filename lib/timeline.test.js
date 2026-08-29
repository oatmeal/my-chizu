import { describe, it, expect } from "vitest";
import {
  buildTimelineEntries,
  formatDate,
  groupSummaryHtml,
  vodIconHtml,
  vodUrl,
  VOD_ICON,
} from "./timeline.js";

// Real display names from llmr data/dates.json
const displayNames = {
  "20211114": "2021年11月14日 00:30",
  "20211114-1": "2021年11月14日 00:45",
  "20220303": "2022年3月3日 01:00",
};

describe("formatDate", () => {
  it("returns the display name when one exists", () => {
    expect(formatDate("20211114", displayNames)).toBe("2021年11月14日 00:30");
  });

  it("returns the display name for suffixed dates", () => {
    expect(formatDate("20211114-1", displayNames)).toBe("2021年11月14日 00:45");
  });

  it("falls back to YYYY年MM月DD日 format", () => {
    expect(formatDate("20230211", displayNames)).toBe("2023年02月11日");
  });

  it("falls back correctly with an empty lookup", () => {
    expect(formatDate("20211007", {})).toBe("2021年10月07日");
  });
});

describe("groupSummaryHtml", () => {
  it("shows only the prefix when there are no dates or vods", () => {
    expect(
      groupSummaryHtml({ prefix: "2022年", counts: { date: 0, vod: 0 } })
    ).toBe("2022年");
  });

  it("shows only the prefix when counts are missing entirely", () => {
    expect(groupSummaryHtml({ prefix: "2022年", counts: {} })).toBe("2022年");
    expect(groupSummaryHtml({ prefix: "2022年" })).toBe("2022年");
  });

  it("shows date count when dates > 0", () => {
    expect(
      groupSummaryHtml({ prefix: "2022年", counts: { date: 5, vod: 0 } })
    ).toBe("2022年 (🗓5)");
  });

  it("shows vod count when vods > 0", () => {
    const html = groupSummaryHtml({
      prefix: "2022年",
      counts: { date: 0, vod: 3 },
    });
    expect(html).toContain("2022年");
    expect(html).toContain(VOD_ICON);
    expect(html).toContain("3");
    expect(html).not.toContain("🗓");
  });

  it("shows both counts when both > 0", () => {
    const html = groupSummaryHtml({
      prefix: "2022年03月",
      counts: { date: 2, vod: 1 },
    });
    expect(html).toContain("2022年03月");
    expect(html).toContain("(🗓2)");
    expect(html).toContain(VOD_ICON);
    expect(html).toContain("1)");
  });

  it("keeps dates ahead of vods regardless of the counts object's key order", () => {
    const html = groupSummaryHtml({
      prefix: "2022年",
      counts: { vod: 1, date: 2 },
    });
    expect(html.indexOf("🗓")).toBeLessThan(html.indexOf(VOD_ICON));
  });

  it("ignores a kind it does not know about", () => {
    expect(
      groupSummaryHtml({ prefix: "2022年", counts: { chat: 9 } })
    ).toBe("2022年");
  });

  it("counts photos", () => {
    expect(
      groupSummaryHtml({ prefix: "2022年", counts: { photo: 9 } })
    ).toBe("2022年 (📷9)");
  });

  it("orders the kinds date, vod, photo whatever order the counts arrive in", () => {
    const html = groupSummaryHtml({
      prefix: "2022年",
      counts: { photo: 4, vod: 1, date: 2 },
    });
    expect(html.indexOf("🗓")).toBeLessThan(html.indexOf(VOD_ICON));
    expect(html.indexOf(VOD_ICON)).toBeLessThan(html.indexOf("📷"));
  });
});

// Placeholder ids: 11 chars like the real thing, but not pointing at a video.
const ID = "VIDEOID0001";

describe("vodUrl", () => {
  it("builds a YouTube watch URL", () => {
    expect(vodUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it("leaves the characters YouTube ids actually use alone", () => {
    expect(vodUrl("VIDEO_ID002")).toContain("v=VIDEO_ID002");
    expect(vodUrl("-IDEOID0003")).toContain("v=-IDEOID0003");
  });

  it("escapes anything that could break out of the query string", () => {
    expect(vodUrl("a&b=c")).toBe("https://www.youtube.com/watch?v=a%26b%3Dc");
  });

  it("appends a start offset in YouTube's seconds form", () => {
    expect(vodUrl(ID, 24043)).toBe(
      `https://www.youtube.com/watch?v=${ID}&t=24043s`
    );
  });

  it("accepts a numeric string offset, as JSON round-trips can produce", () => {
    expect(vodUrl(ID, "24043")).toContain("&t=24043s");
  });

  it("truncates a fractional offset, which YouTube would otherwise drop", () => {
    expect(vodUrl(ID, 24043.9)).toContain("&t=24043s");
  });

  it("omits the offset when there isn't a usable one", () => {
    const plain = `https://www.youtube.com/watch?v=${ID}`;
    expect(vodUrl(ID)).toBe(plain);
    expect(vodUrl(ID, null)).toBe(plain);
    expect(vodUrl(ID, 0)).toBe(plain);
    expect(vodUrl(ID, -5)).toBe(plain);
    expect(vodUrl(ID, "start")).toBe(plain);
    expect(vodUrl(ID, Infinity)).toBe(plain);
  });

  it("does not accept an offset smuggled into the id", () => {
    // The offset belongs in its own field: sync-vods.mjs matches ids against
    // playlist entries verbatim, so a suffixed id would resync as a duplicate.
    expect(vodUrl(`${ID}?t=24043`)).not.toContain("&t=");
    expect(vodUrl(`${ID}?t=24043`)).toContain(`v=${ID}%3Ft%3D24043`);
  });
});

describe("vodIconHtml", () => {
  it("sets height only, so the landscape mark keeps its aspect ratio", () => {
    const html = vodIconHtml(10);
    expect(html).toContain(`src="${VOD_ICON}"`);
    expect(html).toContain('height="10"');
    expect(html).not.toContain("width=");
  });

  it("is decorative by default and labelled on request", () => {
    expect(vodIconHtml(10)).toContain('alt=""');
    expect(vodIconHtml(11, "VOD")).toContain('alt="VOD"');
  });
});

describe("buildTimelineEntries", () => {
  const shape = (merged) => merged.map(({ kind, date }) => `${kind}:${date}`);
  const vods = (...ds) => ({ kind: "vod", entries: ds.map((date) => ({ date })) });

  it("returns just the dates when there are no streams", () => {
    expect(shape(buildTimelineEntries(["20220101", "20220301"]))).toEqual([
      "date:20220101",
      "date:20220301",
    ]);
    expect(buildTimelineEntries([])).toEqual([]);
  });

  it("places a stream entry ahead of the first date it falls before", () => {
    const merged = buildTimelineEntries(
      ["20220101", "20220301"],
      [vods("20220215")]
    );
    expect(shape(merged)).toEqual([
      "date:20220101",
      "vod:20220215",
      "date:20220301",
    ]);
  });

  it("places an entry sharing a date ahead of that date", () => {
    const merged = buildTimelineEntries(["20220101"], [vods("20220101")]);
    expect(shape(merged)).toEqual(["vod:20220101", "date:20220101"]);
  });

  it("keeps entries dated before every date at the front", () => {
    const merged = buildTimelineEntries(["20220301"], [vods("20210101")]);
    expect(shape(merged)).toEqual(["vod:20210101", "date:20220301"]);
  });

  it("keeps entries dated after every date at the end", () => {
    const merged = buildTimelineEntries(
      ["20220101"],
      [vods("20220301", "20220401")]
    );
    expect(shape(merged)).toEqual([
      "date:20220101",
      "vod:20220301",
      "vod:20220401",
    ]);
  });

  it("drains every entry exactly once", () => {
    const merged = buildTimelineEntries(
      ["20220201", "20220401"],
      [vods("20220101", "20220301", "20220501")]
    );
    expect(shape(merged)).toEqual([
      "vod:20220101",
      "date:20220201",
      "vod:20220301",
      "date:20220401",
      "vod:20220501",
    ]);
  });

  it("merges several streams, in declaration order within a date", () => {
    const merged = buildTimelineEntries(
      ["20220301"],
      [vods("20220101"), { kind: "photo", entries: [{ date: "20220102" }] }]
    );
    expect(shape(merged)).toEqual([
      "vod:20220101",
      "photo:20220102",
      "date:20220301",
    ]);
  });

  it("carries the original entry through so callers keep their own fields", () => {
    const vod = { date: "20220101", id: "abc", title: "t" };
    const [first] = buildTimelineEntries(["20220301"], [
      { kind: "vod", entries: [vod] },
    ]);
    expect(first.entry).toBe(vod);
  });

  it("handles a date list with no matching entries and vice versa", () => {
    expect(shape(buildTimelineEntries([], [vods("20220101")]))).toEqual([
      "vod:20220101",
    ]);
    expect(
      shape(buildTimelineEntries(["20220101"], [{ kind: "vod", entries: [] }]))
    ).toEqual(["date:20220101"]);
  });
});
