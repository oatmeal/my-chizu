import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(rootDir, "test/fixtures/data-repo");
const deployDir = join(fixtureDir, "deploy");

describe("build", () => {
  beforeAll(() => {
    // The fixture needs to be a git repo for build-assets.mjs (git log).
    // Initialize one at test time so we don't embed a .git inside our repo.
    if (!existsSync(join(fixtureDir, ".git"))) {
      execSync(
        'git init && git config user.email "test@test.com" && git config user.name "Test" && git add -A && git commit -m "fixture"',
        { cwd: fixtureDir, stdio: "pipe" }
      );
    }
    // Run the full build against the fixture data repo
    execSync(`node "${join(rootDir, "build.mjs")}" "${fixtureDir}"`, {
      cwd: rootDir,
      stdio: "pipe",
      timeout: 30000,
    });
  });

  describe("build-assets output", () => {
    it("produces index.html with substituted tokens", () => {
      const html = readFileSync(join(deployDir, "index.html"), "utf-8");
      expect(html).toContain("<title>Test Map</title>");
      expect(html).toContain('content="Test OG"');
      expect(html).not.toContain("***TITLE***");
    });

    it("copies Leaflet dependencies", () => {
      expect(existsSync(join(deployDir, "leaflet.js"))).toBe(true);
      expect(existsSync(join(deployDir, "leaflet.css"))).toBe(true);
      expect(existsSync(join(deployDir, "images"))).toBe(true);
    });

    it("produces bundled map.js", () => {
      const mapJs = readFileSync(join(deployDir, "map.js"), "utf-8");
      expect(mapJs.length).toBeGreaterThan(0);
      // Should contain window.init (entry point)
      expect(mapJs).toContain("window.init");
      // Token should have been replaced
      expect(mapJs).not.toContain("***UPDATED***");
    });
  });

  describe("build-data output", () => {
    it("writes minified dates.json", () => {
      const dates = JSON.parse(
        readFileSync(join(deployDir, "data/dates.json"), "utf-8")
      );
      expect(dates["20230101"]).toBe("2023年1月1日");
      expect(dates["20230201"]).toBe("2023年2月1日");
    });

    it("writes minified vods.json", () => {
      const vods = JSON.parse(
        readFileSync(join(deployDir, "data/vods.json"), "utf-8")
      );
      expect(vods).toHaveLength(1);
      expect(vods[0].id).toBe("12345");
    });

    it("writes overworld dimension metadata", () => {
      const ow = JSON.parse(
        readFileSync(join(deployDir, "data/overworld.json"), "utf-8")
      );
      expect(ow.X0).toBe(0);
      expect(ow.Z0).toBe(0);
      expect(ow.tilePath).toBe("tiles/overworld");
      expect(ow.dates).toEqual(["20230101", "20230201"]);
      // fileDates should have our tile coordinate
      expect(ow.fileDates["4/0/0"]).toEqual(["20230101", "20230201"]);
    });

    it("writes layer JSON files", () => {
      const spawn = JSON.parse(
        readFileSync(join(deployDir, "data/overworld/spawn.json"), "utf-8")
      );
      expect(spawn.id).toBe(1);
      expect(spawn.markers[0].name).toBe("Spawn Point");
    });

    it("writes per-date tile replacement caches", () => {
      // Each date × 3 modes (e, f, b) should produce a JSON file
      for (const date of ["20230101", "20230201"]) {
        for (const mode of ["e", "f", "b"]) {
          const file = join(
            deployDir,
            "data/overworld",
            `${date}-${mode}.json`
          );
          expect(existsSync(file)).toBe(true);
          const data = JSON.parse(readFileSync(file, "utf-8"));
          expect(data).toHaveProperty("tileReplacements");
          expect(data).toHaveProperty("skip");
        }
      }
    });

    it("copies tiles into deploy/", () => {
      expect(
        existsSync(
          join(deployDir, "tiles/overworld/4/0/0/20230101.png")
        )
      ).toBe(true);
      expect(
        existsSync(
          join(deployDir, "tiles/overworld/4/0/0/20230201.png")
        )
      ).toBe(true);
    });
  });
});
