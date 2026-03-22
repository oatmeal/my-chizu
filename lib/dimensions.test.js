import { describe, it, expect } from "vitest";
import {
  DIM_OVERWORLD,
  DIM_NETHER,
  DIM_END,
  DIM_NAMES,
  NETHER_SCALE,
  dimScale,
  dimTilePath,
} from "./dimensions.js";

describe("dimension constants", () => {
  it("maps short codes to full names", () => {
    expect(DIM_NAMES[DIM_OVERWORLD]).toBe("overworld");
    expect(DIM_NAMES[DIM_NETHER]).toBe("nether");
    expect(DIM_NAMES[DIM_END]).toBe("end");
  });

  it("has nether scale of 8", () => {
    expect(NETHER_SCALE).toBe(8);
  });
});

describe("dimScale", () => {
  it("returns 8 for nether", () => {
    expect(dimScale(DIM_NETHER)).toBe(8);
  });

  it("returns 1 for overworld", () => {
    expect(dimScale(DIM_OVERWORLD)).toBe(1);
  });

  it("returns 1 for end", () => {
    expect(dimScale(DIM_END)).toBe(1);
  });
});

describe("dimTilePath", () => {
  it('returns "overworld" for overworld', () => {
    expect(dimTilePath(DIM_OVERWORLD)).toBe("overworld");
  });

  it('returns "overworld" for nether (nether tiles stored with overworld)', () => {
    expect(dimTilePath(DIM_NETHER)).toBe("overworld");
  });

  it('returns "end" for end', () => {
    expect(dimTilePath(DIM_END)).toBe("end");
  });
});
