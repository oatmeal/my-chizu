import { describe, it, expect } from "vitest";
import { shouldCreateTile, resolveTileUrl } from "./tileUrl.js";

describe("shouldCreateTile", () => {
  it("returns false at low zoom with no dates and no replacements", () => {
    expect(shouldCreateTile(0, 1, undefined, undefined)).toBe(false);
  });

  it("returns true at low zoom when tileDates exist", () => {
    expect(shouldCreateTile(0, 1, ["20240101"], undefined)).toBe(true);
  });

  it("returns true at low zoom when replacements exist", () => {
    expect(shouldCreateTile(0, 1, undefined, [{ key: "2/0/0" }])).toBe(true);
  });

  it("returns true when zoom >= minNativeZoom even without data", () => {
    expect(shouldCreateTile(1, 1, undefined, undefined)).toBe(true);
  });

  it("returns true when zoom > minNativeZoom without data", () => {
    expect(shouldCreateTile(3, 1, undefined, undefined)).toBe(true);
  });
});

describe("resolveTileUrl", () => {
  const sigil = "***";
  const errorTile = "tiles/error.png";
  const makeUrl = (key) => `tiles/${key}/${sigil}.png`;

  describe("missing tile dates", () => {
    it("returns errorTileUrl at or below minNativeZoom", () => {
      expect(
        resolveTileUrl(
          "1/0/0",
          undefined,
          { date: "20240101", exact: false, fill: false, skip: {} },
          makeUrl("1/0/0"),
          sigil,
          errorTile,
          1,
          1
        )
      ).toBe(errorTile);
    });

    it("returns data:, above minNativeZoom with no tile dates", () => {
      expect(
        resolveTileUrl(
          "3/1/1",
          undefined,
          { date: "20240101", exact: false, fill: false, skip: {} },
          makeUrl("3/1/1"),
          sigil,
          errorTile,
          1,
          3
        )
      ).toBe("data:,");
    });
  });

  describe("before mode (default)", () => {
    const timeline = { date: "20240315", exact: false, fill: false, skip: {} };

    it("selects the latest date on or before the target", () => {
      const tileDates = ["20240101", "20240301", "20240401"];
      const result = resolveTileUrl(
        "3/1/1",
        tileDates,
        timeline,
        makeUrl("3/1/1"),
        sigil,
        errorTile,
        1,
        3
      );
      expect(result).toBe("tiles/3/1/1/20240301.png");
    });

    it("returns data:, when all dates are after target", () => {
      const tileDates = ["20240401", "20240501"];
      const result = resolveTileUrl(
        "3/1/1",
        tileDates,
        timeline,
        makeUrl("3/1/1"),
        sigil,
        errorTile,
        1,
        3
      );
      expect(result).toBe("data:,");
    });
  });

  describe("exact mode", () => {
    const timeline = { date: "20240301", exact: true, fill: false, skip: {} };

    it("returns URL when exact date exists", () => {
      const tileDates = ["20240101", "20240301", "20240401"];
      const result = resolveTileUrl(
        "3/1/1",
        tileDates,
        timeline,
        makeUrl("3/1/1"),
        sigil,
        errorTile,
        1,
        3
      );
      expect(result).toBe("tiles/3/1/1/20240301.png");
    });

    it("returns data:, when exact date does not exist", () => {
      const tileDates = ["20240101", "20240401"];
      const result = resolveTileUrl(
        "3/1/1",
        tileDates,
        timeline,
        makeUrl("3/1/1"),
        sigil,
        errorTile,
        1,
        3
      );
      expect(result).toBe("data:,");
    });
  });

  describe("fill mode", () => {
    it("returns URL when tile is not skipped", () => {
      const timeline = {
        date: "20240315",
        exact: false,
        fill: true,
        skip: {},
      };
      const tileDates = ["20240101", "20240401"];
      const result = resolveTileUrl(
        "3/1/1",
        tileDates,
        timeline,
        makeUrl("3/1/1"),
        sigil,
        errorTile,
        1,
        3
      );
      // fill mode finds latest <= target, or earliest available
      // "20240101" <= "20240315", so it picks "20240101"
      expect(result).toBe("tiles/3/1/1/20240101.png");
    });

    it("returns data:, when tile is in skip list", () => {
      const timeline = {
        date: "20240315",
        exact: false,
        fill: true,
        skip: { "3/1/1": true },
      };
      const tileDates = ["20240101", "20240401"];
      const result = resolveTileUrl(
        "3/1/1",
        tileDates,
        timeline,
        makeUrl("3/1/1"),
        sigil,
        errorTile,
        1,
        3
      );
      expect(result).toBe("data:,");
    });

    it("fills with future date when no date is on or before target", () => {
      const timeline = {
        date: "20231201",
        exact: false,
        fill: true,
        skip: {},
      };
      const tileDates = ["20240101", "20240301"];
      const result = resolveTileUrl(
        "3/1/1",
        tileDates,
        timeline,
        makeUrl("3/1/1"),
        sigil,
        errorTile,
        1,
        3
      );
      // fill mode returns earliest available when nothing <= target
      expect(result).toBe("tiles/3/1/1/20240101.png");
    });
  });

  describe("mode priority", () => {
    it("exact takes priority over fill", () => {
      const timeline = {
        date: "20240301",
        exact: true,
        fill: true,
        skip: {},
      };
      const tileDates = ["20240101", "20240401"];
      // exact mode: "20240301" not in tileDates → data:,
      const result = resolveTileUrl(
        "3/1/1",
        tileDates,
        timeline,
        makeUrl("3/1/1"),
        sigil,
        errorTile,
        1,
        3
      );
      expect(result).toBe("data:,");
    });
  });
});
