import { describe, it, expect } from "vitest";
import { buildPermalinkUrl } from "./permalink.js";

const url = { origin: "https://example.com", pathname: "/map/" };

describe("buildPermalinkUrl", () => {
  it("builds a basic permalink without date", () => {
    const hashObj = {
      dD: {
        o: { c: { X: 100, Z: 200, z: 3 }, v: ["layer1"], h: { d: "20240101", e: false, f: true } },
      },
    };
    const result = buildPermalinkUrl(url, "o", hashObj, false);
    expect(result).toContain("https://example.com/map/#");
    expect(result).toContain('d="o"');
    // should contain coords and layers but not hash/timeline data
    const dDPart = result.split("&dD=")[1];
    const dD = JSON.parse(decodeURIComponent(dDPart));
    expect(dD.o.c).toEqual({ X: 100, Z: 200, z: 3 });
    expect(dD.o.v).toEqual(["layer1"]);
    expect(dD.o.h).toBeUndefined();
  });

  it("includes date hash when includeDate is true", () => {
    const hashObj = {
      dD: {
        o: { c: { X: 100, Z: 200, z: 3 }, v: [], h: { d: "20240101", e: true, f: false } },
      },
    };
    const result = buildPermalinkUrl(url, "o", hashObj, true);
    const dDPart = result.split("&dD=")[1];
    const dD = JSON.parse(decodeURIComponent(dDPart));
    expect(dD.o.h).toEqual({ d: "20240101", e: true, f: false });
  });

  it("includes multiple dimensions", () => {
    const hashObj = {
      dD: {
        o: { c: { X: 1, Z: 2, z: 3 }, v: [], h: { d: "20240101" } },
        n: { c: { X: 10, Z: 20, z: 1 }, v: ["a"], h: { d: "20240101" } },
      },
    };
    const result = buildPermalinkUrl(url, "o", hashObj, false);
    const dDPart = result.split("&dD=")[1];
    const dD = JSON.parse(decodeURIComponent(dDPart));
    expect(dD.o).toBeDefined();
    expect(dD.n).toBeDefined();
    expect(dD.o.h).toBeUndefined();
    expect(dD.n.h).toBeUndefined();
  });

  it("skips null/undefined dimension entries", () => {
    const hashObj = {
      dD: {
        o: { c: { X: 1, Z: 2, z: 3 }, v: [] },
        n: null,
        e: undefined,
      },
    };
    const result = buildPermalinkUrl(url, "o", hashObj, false);
    const dDPart = result.split("&dD=")[1];
    const dD = JSON.parse(decodeURIComponent(dDPart));
    expect(dD.o).toBeDefined();
    expect(dD.n).toBeUndefined();
    expect(dD.e).toBeUndefined();
  });
});
