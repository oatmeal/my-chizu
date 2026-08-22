import { describe, it, expect } from "vitest";
import { shouldPixelate, markPixelated, PIXELATED_CLASS } from "./pixelated.js";

// The sizes that actually occur in the llmr tile tree, against the 256 px box
// the viewer draws into.
const BOX = 256;

describe("shouldPixelate", () => {
  it("magnifies a 128px lattice tile, so it must not be smoothed", () => {
    expect(shouldPixelate(128, BOX)).toBe(true);
  });

  it("downscales a 437px legacy tile, where smoothing is correct", () => {
    expect(shouldPixelate(437, BOX)).toBe(false);
  });

  it("downscales a 600px legacy tile too", () => {
    expect(shouldPixelate(600, BOX)).toBe(false);
  });

  it("treats an exact fit as pixelated, since nothing is resampled", () => {
    expect(shouldPixelate(256, BOX)).toBe(true);
  });

  it("says nothing about an image that has not loaded", () => {
    expect(shouldPixelate(0, BOX)).toBe(false);
  });

  it("says nothing when the box size is unknown", () => {
    expect(shouldPixelate(128, 0)).toBe(false);
    expect(shouldPixelate(128, undefined)).toBe(false);
  });

  it("handles the replacement-div children, drawn at a fraction of the box", () => {
    // A child at scale 0.5 occupies a 128px box; a 128px tile there is 1:1.
    expect(shouldPixelate(128, 128)).toBe(true);
    expect(shouldPixelate(437, 128)).toBe(false);
  });
});

describe("markPixelated", () => {
  const fakeImg = (naturalWidth) => {
    const classes = [];
    return {
      naturalWidth,
      classes,
      classList: { add: (c) => classes.push(c) },
    };
  };

  it("adds the class to a magnified tile", () => {
    const img = fakeImg(128);
    markPixelated(img, BOX);
    expect(img.classes).toEqual([PIXELATED_CLASS]);
  });

  it("leaves a downscaled tile alone", () => {
    const img = fakeImg(437);
    markPixelated(img, BOX);
    expect(img.classes).toEqual([]);
  });

  it("does nothing for a missing image", () => {
    expect(() => markPixelated(null, BOX)).not.toThrow();
  });
});
