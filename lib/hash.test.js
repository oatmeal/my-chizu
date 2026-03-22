import { describe, it, expect } from "vitest";
import { parseHash } from "./hash.js";

describe("parseHash", () => {
  it("parses an empty hash", () => {
    expect(parseHash("#")).toEqual({});
    expect(parseHash("")).toEqual({});
  });

  it("parses a single key-value pair", () => {
    expect(parseHash('#d="o"')).toEqual({ d: "o" });
  });

  it("parses numeric values", () => {
    expect(parseHash("#x=42")).toEqual({ x: 42 });
  });

  it("parses boolean values", () => {
    expect(parseHash("#a=true&b=false")).toEqual({ a: true, b: false });
  });

  it("parses a full permalink hash", () => {
    const dD = {
      o: {
        c: { X: 6620, Z: 605, z: 4 },
        v: [1, 2],
        h: { d: "20230211", e: false, f: true },
      },
    };
    const hash = `#d="o"&dD=${encodeURIComponent(JSON.stringify(dD))}`;
    const result = parseHash(hash);
    expect(result.d).toBe("o");
    expect(result.dD.o.c).toEqual({ X: 6620, Z: 605, z: 4 });
    expect(result.dD.o.v).toEqual([1, 2]);
    expect(result.dD.o.h).toEqual({ d: "20230211", e: false, f: true });
  });

  it("skips entries with no value", () => {
    expect(parseHash("#a=1&b&c=3")).toEqual({ a: 1, c: 3 });
  });

  it("skips entries where value is not valid JSON", () => {
    // bare strings without quotes are not valid JSON
    const result = parseHash("#a=notjson&b=2");
    expect(result).toEqual({ b: 2 });
  });

  it("handles URI-encoded values", () => {
    const obj = { x: 1 };
    const hash = `#data=${encodeURIComponent(JSON.stringify(obj))}`;
    expect(parseHash(hash)).toEqual({ data: { x: 1 } });
  });
});
