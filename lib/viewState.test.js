import { describe, it, expect } from "vitest";
import { resolveStartView, initTimeline } from "./viewState.js";

const baseDimData = {
  defaultX: 100,
  defaultZ: 200,
  defaultZoom: 3,
  minZoom: -2,
  maxZoom: 6,
};

describe("resolveStartView", () => {
  it("uses defaults when no startVal and no hash", () => {
    const result = resolveStartView(baseDimData, null);
    expect(result).toEqual({ startX: 100, startZ: 200, startZoom: 3 });
  });

  it("uses defaults when hashDimData is undefined", () => {
    const result = resolveStartView(baseDimData, undefined);
    expect(result).toEqual({ startX: 100, startZ: 200, startZoom: 3 });
  });

  it("uses dimData.startX/Z/Zoom when set (programmatic override)", () => {
    const dimData = { ...baseDimData, startX: 50, startZ: 60, startZoom: 2 };
    const result = resolveStartView(dimData, { c: { X: 999, Z: 999, z: 5 } });
    expect(result).toEqual({ startX: 50, startZ: 60, startZoom: 2 });
  });

  it("handles startX/Z/Zoom of 0 (falsy but valid)", () => {
    const dimData = { ...baseDimData, startX: 0, startZ: 0, startZoom: 0 };
    const result = resolveStartView(dimData, { c: { X: 999, Z: 999, z: 5 } });
    expect(result).toEqual({ startX: 0, startZ: 0, startZoom: 0 });
  });

  it("uses hash values when no programmatic override", () => {
    const result = resolveStartView(baseDimData, {
      c: { X: 42, Z: 84, z: 4 },
    });
    expect(result).toEqual({ startX: 42, startZ: 84, startZoom: 4 });
  });

  it("handles hash coordinates of 0", () => {
    const result = resolveStartView(baseDimData, {
      c: { X: 0, Z: 0, z: 0 },
    });
    expect(result).toEqual({ startX: 0, startZ: 0, startZoom: 0 });
  });

  it("rejects hash zoom outside bounds", () => {
    const result = resolveStartView(baseDimData, {
      c: { X: 42, Z: 84, z: 10 },
    });
    expect(result.startX).toBe(42);
    expect(result.startZ).toBe(84);
    expect(result.startZoom).toBe(3); // falls back to default
  });

  it("rejects non-integer hash zoom", () => {
    const result = resolveStartView(baseDimData, {
      c: { X: 42, Z: 84, z: 2.5 },
    });
    expect(result.startZoom).toBe(3); // falls back to default
  });

  it("rejects non-number hash coordinates", () => {
    const result = resolveStartView(baseDimData, {
      c: { X: "abc", Z: null, z: "foo" },
    });
    expect(result).toEqual({ startX: 100, startZ: 200, startZoom: 3 });
  });

  it("handles missing c in hashDimData", () => {
    const result = resolveStartView(baseDimData, {});
    expect(result).toEqual({ startX: 100, startZ: 200, startZoom: 3 });
  });
});

describe("initTimeline", () => {
  it("creates timeline object if missing", () => {
    const dimData = { dates: ["20240101", "20240201"] };
    initTimeline(dimData, null);
    expect(dimData.timeline).toBeDefined();
    expect(dimData.timeline.dateCache).toEqual({});
  });

  it("defaults to last date when no hash", () => {
    const dimData = { dates: ["20240101", "20240201", "20240301"] };
    initTimeline(dimData, null);
    expect(dimData.timeline.date).toBe("20240301");
  });

  it("uses hash date when it exists in dates array", () => {
    const dimData = { dates: ["20240101", "20240201", "20240301"] };
    initTimeline(dimData, { h: { d: "20240201" } });
    expect(dimData.timeline.date).toBe("20240201");
  });

  it("falls back to last date when hash date not in dates", () => {
    const dimData = { dates: ["20240101", "20240201"] };
    initTimeline(dimData, { h: { d: "20999999" } });
    expect(dimData.timeline.date).toBe("20240201");
  });

  it("defaults exact to false", () => {
    const dimData = { dates: ["20240101"] };
    initTimeline(dimData, null);
    expect(dimData.timeline.exact).toBe(false);
  });

  it("sets exact from hash", () => {
    const dimData = { dates: ["20240101"] };
    initTimeline(dimData, { h: { e: true } });
    expect(dimData.timeline.exact).toBe(true);
  });

  it("defaults fill to true", () => {
    const dimData = { dates: ["20240101"] };
    initTimeline(dimData, null);
    expect(dimData.timeline.fill).toBe(true);
  });

  it("sets fill to false from hash", () => {
    const dimData = { dates: ["20240101"] };
    initTimeline(dimData, { h: { f: false } });
    expect(dimData.timeline.fill).toBe(false);
  });

  it("does not overwrite existing timeline values", () => {
    const dimData = {
      dates: ["20240101", "20240201"],
      timeline: { dateCache: {}, date: "20240101", exact: true, fill: false },
    };
    initTimeline(dimData, { h: { d: "20240201", e: false, f: true } });
    expect(dimData.timeline.date).toBe("20240101");
    expect(dimData.timeline.exact).toBe(true);
    expect(dimData.timeline.fill).toBe(false);
  });
});
