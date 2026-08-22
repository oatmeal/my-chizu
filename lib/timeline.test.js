import { describe, it, expect } from "vitest";
import {
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
      groupSummaryHtml({ prefix: "2022年", dates: 0, vods: 0 })
    ).toBe("2022年");
  });

  it("shows date count when dates > 0", () => {
    expect(
      groupSummaryHtml({ prefix: "2022年", dates: 5, vods: 0 })
    ).toBe("2022年 (🗓5)");
  });

  it("shows vod count when vods > 0", () => {
    const html = groupSummaryHtml({ prefix: "2022年", dates: 0, vods: 3 });
    expect(html).toContain("2022年");
    expect(html).toContain(VOD_ICON);
    expect(html).toContain("3");
    expect(html).not.toContain("🗓");
  });

  it("shows both counts when both > 0", () => {
    const html = groupSummaryHtml({
      prefix: "2022年03月",
      dates: 2,
      vods: 1,
    });
    expect(html).toContain("2022年03月");
    expect(html).toContain("(🗓2)");
    expect(html).toContain(VOD_ICON);
    expect(html).toContain("1)");
  });
});

describe("vodUrl", () => {
  it("builds a YouTube watch URL", () => {
    expect(vodUrl("EdfQFa3W9ck")).toBe(
      "https://www.youtube.com/watch?v=EdfQFa3W9ck"
    );
  });

  it("leaves the characters YouTube ids actually use alone", () => {
    expect(vodUrl("L7iP_shk848")).toContain("v=L7iP_shk848");
    expect(vodUrl("-G5zb4Sa2ok")).toContain("v=-G5zb4Sa2ok");
  });

  it("escapes anything that could break out of the query string", () => {
    expect(vodUrl("a&b=c")).toBe("https://www.youtube.com/watch?v=a%26b%3Dc");
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
