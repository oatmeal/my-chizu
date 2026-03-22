/**
 * @vitest-environment jsdom
 *
 * Verify that the pure coordinate functions in lib/coords.js produce
 * the same results as Leaflet's map.project / map.unproject when using
 * L.CRS.Simple. This catches any drift between our math and Leaflet's.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mcProject, mcUnproject } from "../lib/coords.js";

// Leaflet needs a global window/document (provided by jsdom)
let L;
let map;

// Real llmr overworld config
const dimData = {
  X0: 6080,
  Z0: -64,
  minZoom: -3,
  ratio: 64,
};

beforeAll(async () => {
  // Leaflet's dist file expects a browser environment
  L = (await import("leaflet")).default;

  // Create a minimal DOM container for the map
  const container = document.createElement("div");
  container.id = "test-map";
  container.style.width = "800px";
  container.style.height = "600px";
  document.body.appendChild(container);

  map = L.map("test-map", {
    crs: L.CRS.Simple,
    zoomControl: false,
  });
  map.setView([0, 0], 0);

  // Attach mcProject / mcUnproject the same way map.js does
  map.dimData = dimData;
  map.mcProject = function (latlng) {
    const { x, y } = this.project(latlng, this.dimData.minZoom);
    return [
      this.dimData.ratio * x + this.dimData.X0,
      this.dimData.ratio * y + this.dimData.Z0,
    ];
  };
  map.mcUnproject = function ([X, Z]) {
    return this.unproject(
      [
        (X - this.dimData.X0) / this.dimData.ratio,
        (Z - this.dimData.Z0) / this.dimData.ratio,
      ],
      this.dimData.minZoom
    );
  };
});

const testCoords = [
  [0, 0],
  [6080, -64], // origin
  [6620, 605], // default view
  [7000, -500],
  [5000, 1000],
  [-1000, -1000],
];

describe("coords.js matches Leaflet", () => {
  describe("mcUnproject", () => {
    it.each(testCoords)(
      "mcUnproject([%d, %d]) matches Leaflet map.mcUnproject",
      (x, z) => {
        const leafletResult = map.mcUnproject([x, z]);
        const pureResult = mcUnproject([x, z], dimData);

        expect(pureResult.lat).toBeCloseTo(leafletResult.lat, 10);
        expect(pureResult.lng).toBeCloseTo(leafletResult.lng, 10);
      }
    );
  });

  describe("mcProject", () => {
    it.each(testCoords)(
      "mcProject(mcUnproject([%d, %d])) matches Leaflet round-trip",
      (x, z) => {
        // Use Leaflet's mcUnproject to get a LatLng, then compare mcProject
        const leafletLatLng = map.mcUnproject([x, z]);
        const pureLatLng = mcUnproject([x, z], dimData);

        const leafletResult = map.mcProject(leafletLatLng);
        const pureResult = mcProject(pureLatLng, dimData);

        expect(pureResult[0]).toBeCloseTo(leafletResult[0], 10);
        expect(pureResult[1]).toBeCloseTo(leafletResult[1], 10);
      }
    );
  });
});
