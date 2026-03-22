import { describe, it, expect } from "vitest";
import { formatDate, groupSummaryHtml } from "./timeline.js";

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
    expect(html).toContain("TwitchGlitchPurple.svg");
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
    expect(html).toContain("TwitchGlitchPurple.svg");
    expect(html).toContain("1)");
  });
});
