import { describe, it, expect } from "vitest";
import { mcProject, mcUnproject } from "./coords.js";

// Real dimension data from llmr config.json
// (minZoom is the value from the deployed overworld.json, i.e. native minZoom - 4)
const overworldDim = {
  X0: 6080,
  Z0: -64,
  // From build-data.mjs: minZoom stored in deployed JSON = nativeMinZoom - 4
  // Tiles in llmr start at native zoom 1, so minZoom = 1 - 4 = -3
  minZoom: -3,
  // ratio = floor(2^(11 - (nativeMinZoom - 4)) / tileSize)
  //       = floor(2^(11 - (-3)) / 256) = floor(2^14 / 256) = floor(64) = 64
  ratio: 64,
};

// Simple test config for easier manual verification
const simpleDim = {
  X0: 0,
  Z0: 0,
  minZoom: 0,
  ratio: 1,
};

describe("mcProject", () => {
  it("converts the origin LatLng to [X0, Z0]", () => {
    const [x, z] = mcProject({ lat: 0, lng: 0 }, overworldDim);
    expect(x).toBe(overworldDim.X0);
    expect(z).toBe(overworldDim.Z0);
  });

  it("converts coordinates with simple config", () => {
    // With ratio=1, minZoom=0, X0=0, Z0=0:
    // X = 1 * 2^0 * lng + 0 = lng
    // Z = -(1 * 2^0 * lat) + 0 = -lat
    const [x, z] = mcProject({ lat: -100, lng: 200 }, simpleDim);
    expect(x).toBe(200);
    expect(z).toBe(100);
  });

  it("handles the default view coordinates from llmr", () => {
    // Default view: X=6620, Z=605
    // Reverse: what LatLng gives us [6620, 605]?
    const latlng = mcUnproject([6620, 605], overworldDim);
    const [x, z] = mcProject(latlng, overworldDim);
    expect(x).toBeCloseTo(6620);
    expect(z).toBeCloseTo(605);
  });
});

describe("mcUnproject", () => {
  it("converts [X0, Z0] to origin LatLng", () => {
    const { lat, lng } = mcUnproject(
      [overworldDim.X0, overworldDim.Z0],
      overworldDim
    );
    expect(lat).toBeCloseTo(0);
    expect(lng).toBeCloseTo(0);
  });

  it("converts coordinates with simple config", () => {
    const { lat, lng } = mcUnproject([200, 100], simpleDim);
    // lng = (200 - 0) / (1 * 1) = 200
    // lat = -(100 - 0) / (1 * 1) = -100
    expect(lng).toBe(200);
    expect(lat).toBe(-100);
  });
});

describe("round-trip", () => {
  it("mcProject ∘ mcUnproject is identity", () => {
    const coords = [6620, 605];
    const latlng = mcUnproject(coords, overworldDim);
    const result = mcProject(latlng, overworldDim);
    expect(result[0]).toBeCloseTo(coords[0]);
    expect(result[1]).toBeCloseTo(coords[1]);
  });

  it("mcUnproject ∘ mcProject is identity", () => {
    const latlng = { lat: -10.5, lng: 8.4375 };
    const coords = mcProject(latlng, overworldDim);
    const result = mcUnproject(coords, overworldDim);
    expect(result.lat).toBeCloseTo(latlng.lat);
    expect(result.lng).toBeCloseTo(latlng.lng);
  });

  it("round-trips with several real-world coordinates", () => {
    const testPoints = [
      [0, 0],
      [6080, -64], // origin
      [6620, 605], // default view
      [7000, -500],
      [5000, 1000],
    ];
    for (const [x, z] of testPoints) {
      const latlng = mcUnproject([x, z], overworldDim);
      const [rx, rz] = mcProject(latlng, overworldDim);
      expect(rx).toBeCloseTo(x);
      expect(rz).toBeCloseTo(z);
    }
  });
});
