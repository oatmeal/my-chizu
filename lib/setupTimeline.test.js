import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTileReplacements } from "./setupTimeline.js";

describe("getTileReplacements", () => {
  let mymap;
  let fetchCount;

  beforeEach(() => {
    fetchCount = 0;
    globalThis.fetch = vi.fn((url) => {
      fetchCount++;
      // parse the mode from the URL: data/overworld/YYYYMMDD-m.json
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            tileReplacements: { [`from-${url}`]: [] },
            skip: { [`skip-${url}`]: true },
          }),
      });
    });

    mymap = {
      dim: "o",
      dimData: {
        timeline: {
          date: "20240301",
          exact: false,
          fill: false,
          dateCache: {},
        },
      },
    };
  });

  it("fetches and populates tileReplacements and skip", async () => {
    await getTileReplacements(mymap);

    expect(fetchCount).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "data/overworld/20240301-b.json"
    );
    expect(mymap.dimData.timeline.tileReplacements).toEqual({
      "from-data/overworld/20240301-b.json": [],
    });
    expect(mymap.dimData.timeline.skip).toEqual({
      "skip-data/overworld/20240301-b.json": true,
    });
  });

  it("does not re-fetch on cache hit (same date and mode)", async () => {
    await getTileReplacements(mymap);
    expect(fetchCount).toBe(1);

    await getTileReplacements(mymap);
    expect(fetchCount).toBe(1);
  });

  it("fetches again when mode changes", async () => {
    await getTileReplacements(mymap);
    expect(fetchCount).toBe(1);

    mymap.dimData.timeline.exact = true;
    await getTileReplacements(mymap);
    expect(fetchCount).toBe(2);
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "data/overworld/20240301-e.json"
    );
  });

  it("fetches again when date changes", async () => {
    await getTileReplacements(mymap);
    expect(fetchCount).toBe(1);

    mymap.dimData.timeline.date = "20240401";
    await getTileReplacements(mymap);
    expect(fetchCount).toBe(2);
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "data/overworld/20240401-b.json"
    );
  });

  it("uses fill mode key when fill is true", async () => {
    mymap.dimData.timeline.fill = true;
    await getTileReplacements(mymap);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "data/overworld/20240301-f.json"
    );
  });

  it("exact mode takes priority over fill", async () => {
    mymap.dimData.timeline.exact = true;
    mymap.dimData.timeline.fill = true;
    await getTileReplacements(mymap);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "data/overworld/20240301-e.json"
    );
  });

  it("uses nether tile path for nether dimension", async () => {
    mymap.dim = "n";
    await getTileReplacements(mymap);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "data/overworld/20240301-b.json"
    );
  });
});
