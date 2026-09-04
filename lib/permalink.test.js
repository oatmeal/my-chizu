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

  it("leaves out the photo key when there is no photo", () => {
    const hashObj = { dD: { o: { c: { X: 1, Z: 2, z: 3 }, v: [] } } };
    expect(buildPermalinkUrl(url, "o", hashObj, false)).not.toContain("ph=");
  });

  it("names a photo to open on arrival", () => {
    const hashObj = { dD: { o: { c: { X: 1, Z: 2, z: 3 }, v: [], h: {} } } };
    const result = buildPermalinkUrl(url, "o", hashObj, true, "2021-05-03_19.22.07");
    const ph = result.split("&ph=")[1];
    expect(JSON.parse(decodeURIComponent(ph))).toBe("2021-05-03_19.22.07");
  });

  it("escapes a stem that would otherwise break the hash", () => {
    const hashObj = { dD: { o: { c: {}, v: [] } } };
    const result = buildPermalinkUrl(url, "o", hashObj, false, "a&b=c d");
    expect(result.split("&ph=")).toHaveLength(2);
    expect(JSON.parse(decodeURIComponent(result.split("&ph=")[1]))).toBe("a&b=c d");
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

  it("carries the photos pane's author filter", () => {
    const hashObj = { dD: { o: { c: {}, v: [] } }, by: [3, 1] };
    const result = buildPermalinkUrl(url, "o", hashObj, false);
    expect(result).toContain(`by=${encodeURIComponent("[3,1]")}`);
  });

  it("carries every author switched off, which is a state and not an absence", () => {
    const hashObj = { dD: { o: { c: {}, v: [] } }, by: [] };
    expect(buildPermalinkUrl(url, "o", hashObj, false)).toContain("by=%5B%5D");
  });

  it("says nothing about the filter on a map nobody has filtered", () => {
    const hashObj = { dD: { o: { c: {}, v: [] } } };
    expect(buildPermalinkUrl(url, "o", hashObj, false)).not.toContain("by=");
  });

  it("carries the photos-stay-up setting as a short flag", () => {
    const hashObj = {
      pv: 1,
      dD: { o: { c: { X: 1, Z: 2, z: 3 }, v: [], h: {} } },
    };
    const result = buildPermalinkUrl(url, "o", hashObj, false);
    expect(result).toContain("pv=1");
  });

  it("says nothing at all when photos do not stay up", () => {
    const hashObj = { dD: { o: { c: { X: 1, Z: 2, z: 3 }, v: [], h: {} } } };
    expect(buildPermalinkUrl(url, "o", hashObj, false)).not.toContain("pv");
  });

  it("normalises a truthy setting to the short spelling", () => {
    // Whatever an old or hand-edited link said, what is published is `pv=1`.
    const hashObj = {
      pv: true,
      dD: { o: { c: { X: 1, Z: 2, z: 3 }, v: [], h: {} } },
    };
    expect(buildPermalinkUrl(url, "o", hashObj, false)).toContain("pv=1");
  });
});
