import { describe, it, expect } from "vitest";
import { selectTileDate } from "./tileDate.js";

// Real tile dates from llmr data repo (tile overworld/1/-1/0)
const tileDates = [
  "20211007",
  "20211129",
  "20220125",
  "20220424",
  "20220625",
  "20220702",
  "20220717",
  "20220812",
  "20230211",
];

// Smaller tile (overworld/4/1/1) — fewer snapshots
const sparseDates = ["20220924", "20221027", "20230211"];

describe("selectTileDate", () => {
  describe('mode "e" (exact)', () => {
    it("returns the date when it exists", () => {
      expect(selectTileDate(tileDates, "20220625", "e")).toBe("20220625");
    });

    it("returns false when the date does not exist", () => {
      expect(selectTileDate(tileDates, "20220626", "e")).toBe(false);
    });

    it("returns false for a date before all tiles", () => {
      expect(selectTileDate(tileDates, "20200101", "e")).toBe(false);
    });

    it("returns false for a date after all tiles", () => {
      expect(selectTileDate(tileDates, "20990101", "e")).toBe(false);
    });
  });

  describe('mode "f" (fill)', () => {
    it("returns exact match when date exists", () => {
      expect(selectTileDate(tileDates, "20220625", "f")).toBe("20220625");
    });

    it("returns the most recent tile ≤ target date", () => {
      // 20220626 is between 20220625 and 20220702
      expect(selectTileDate(tileDates, "20220626", "f")).toBe("20220625");
    });

    it("fills with the earliest tile when target is before all dates", () => {
      // target before any tile exists — fill uses the first available
      expect(selectTileDate(tileDates, "20200101", "f")).toBe("20211007");
    });

    it("returns the last tile when target is after all dates", () => {
      expect(selectTileDate(tileDates, "20990101", "f")).toBe("20230211");
    });

    it("returns the last tile when target equals the last date", () => {
      expect(selectTileDate(tileDates, "20230211", "f")).toBe("20230211");
    });

    it("works with sparse dates", () => {
      // between first and second
      expect(selectTileDate(sparseDates, "20221001", "f")).toBe("20220924");
    });
  });

  describe('mode "b" (before)', () => {
    it("returns exact match when date exists", () => {
      expect(selectTileDate(tileDates, "20220625", "b")).toBe("20220625");
    });

    it("returns the most recent tile ≤ target date", () => {
      expect(selectTileDate(tileDates, "20220626", "b")).toBe("20220625");
    });

    it("returns undefined when target is before all dates", () => {
      expect(selectTileDate(tileDates, "20200101", "b")).toBeUndefined();
    });

    it("returns the last tile when target is after all dates", () => {
      expect(selectTileDate(tileDates, "20990101", "b")).toBe("20230211");
    });

    it("returns the first tile when target equals the first date", () => {
      expect(selectTileDate(tileDates, "20211007", "b")).toBe("20211007");
    });

    it("works with sparse dates", () => {
      expect(selectTileDate(sparseDates, "20221001", "b")).toBe("20220924");
      expect(selectTileDate(sparseDates, "20220901", "b")).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("handles a single-element array", () => {
      const single = ["20220101"];
      expect(selectTileDate(single, "20220101", "e")).toBe("20220101");
      expect(selectTileDate(single, "20220102", "e")).toBe(false);
      expect(selectTileDate(single, "20210101", "f")).toBe("20220101");
      expect(selectTileDate(single, "20220101", "f")).toBe("20220101");
      expect(selectTileDate(single, "20210101", "b")).toBeUndefined();
      expect(selectTileDate(single, "20220101", "b")).toBe("20220101");
    });
  });
});
