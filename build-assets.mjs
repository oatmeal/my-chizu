// Usage: node build-assets.mjs /path/to/data-repo
// Creates the deploy/ skeleton inside the data repo: static files, Leaflet
// dependencies, and the minified map.js. Reads site.json from the data repo
// to substitute site-specific tokens into index.html.
import { promisify } from "util";
import { exec } from "child_process";
import fsPromises from "fs/promises";
import { build } from "vite";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const exec_promise = promisify(exec);

const engineDir = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.argv[2]);
const deployDir = join(dataDir, "deploy");

await fsPromises.rm(deployDir, {
  maxRetries: 5,
  retryDelay: 2000,
  recursive: true,
  force: true,
});

// Copy engine static files into deploy/
await fsPromises.cp(join(engineDir, "static"), deployDir, { recursive: true });
await fsPromises.mkdir(join(deployDir, "data"), { recursive: true });

// Template index.html with site-specific values from data repo's site.json
const site = JSON.parse(
  await fsPromises.readFile(join(dataDir, "site.json"), "utf-8")
);
const indexHtml = await fsPromises.readFile(
  join(deployDir, "index.html"),
  "utf-8"
);
await fsPromises.writeFile(
  join(deployDir, "index.html"),
  indexHtml
    .replace("***TITLE***", site.title)
    .replace("***OG_TITLE***", site.og.title)
    .replace("***OG_URL***", site.og.url)
    .replace("***OG_IMAGE***", site.og.image)
    .replace("***OG_DESCRIPTION***", site.og.description)
    .replace("***OG_LOCALE***", site.og.locale)
    .replace("***ABOUT_TITLE***", site.aboutTitle)
    .replace("***ABOUT_HTML***", site.aboutHtml)
);

// Copy data repo static files (e.g. og.jpeg) into deploy/, overriding engine files if needed
const dataStaticDir = join(dataDir, "static");
try {
  await fsPromises.cp(dataStaticDir, deployDir, { recursive: true });
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  // no static/ in data repo is fine
}

// Copy Leaflet and plugin dependencies from engine's node_modules
fsPromises.cp(
  join(engineDir, "node_modules/leaflet/dist/leaflet.js"),
  join(deployDir, "leaflet.js")
);
fsPromises.cp(
  join(engineDir, "node_modules/leaflet/dist/leaflet.css"),
  join(deployDir, "leaflet.css")
);
fsPromises.cp(
  join(engineDir, "node_modules/leaflet/dist/images/"),
  join(deployDir, "images"),
  { recursive: true }
);
fsPromises.cp(
  join(engineDir, "node_modules/leaflet.tilelayer.fallback/dist/leaflet.tilelayer.fallback.js"),
  join(deployDir, "leaflet.tilelayer.fallback.js")
);
fsPromises.cp(
  join(engineDir, "node_modules/leaflet-sidebar-v2/css/leaflet-sidebar.min.css"),
  join(deployDir, "leaflet-sidebar.min.css")
);
fsPromises.cp(
  join(engineDir, "node_modules/leaflet-sidebar-v2/js/leaflet-sidebar.min.js"),
  join(deployDir, "leaflet-sidebar.min.js")
);

async function buildMapJs() {
  // Bundle lib/map.js (and its imports) into a single IIFE using Vite
  const result = await build({
    configFile: false,
    root: engineDir,
    build: {
      lib: {
        entry: join(engineDir, "lib/map.js"),
        formats: ["iife"],
        name: "_unused",
      },
      write: false,
      minify: true,
    },
    logLevel: "warn",
  });
  const minified = result[0].output[0].code;
  // get last commit time from the data repo
  const gitlog = (
    await exec_promise(`git -C "${dataDir}" log -1 --format=%cd`)
  ).stdout;
  const time = new Date(gitlog).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });
  await fsPromises.writeFile(
    join(deployDir, "map.js"),
    minified.replace("***UPDATED***", time)
  );
}

await buildMapJs();
