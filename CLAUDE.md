# CLAUDE.md

## Project Overview

Generic Minecraft tile-map viewer engine. Provides the map application (`lib/map.js`), build tooling, and a reusable GitHub Actions workflow. Data repos (tiles, layer JSONs, dates, VODs) plug in via a `site.json` config file.

Reference implementation / primary data repo: https://github.com/oatmeal/llmr

## Tech Stack

- **Leaflet.js** (v1.9.2) — map rendering
- **Vanilla JavaScript** — no framework; ES modules in `lib/`
- **Node.js 16+ / npm 7+** — build tooling only
- **Vite** — JS bundling (IIFE) and minification
- **Vitest** — unit testing
- **GitHub Pages** — deployment target

## Local Build

```bash
npm install                                  # one-time setup
node build.mjs /path/to/data-repo            # build into data-repo/deploy/
python -m http.server --directory /path/to/data-repo/deploy
```

```bash
npm test                                     # run unit tests (vitest)
```

## Project Structure

```
lib/
  map.js               # Main application logic — wires together the modules below
  hash.js              # URL hash parsing (pure, tested)
  tileDate.js          # Tile date selection for exact/fill/before modes (pure, tested)
  timeline.js          # Date formatting and timeline group summary (pure, tested)
  *.test.js            # Vitest unit tests alongside each module
static/                # HTML template, CSS, icons, Twitch branding
  index.html           # Contains ***TOKEN*** placeholders for site-specific content
build-assets.mjs       # Creates deploy/ skeleton: static files, Leaflet deps, map.js
build-data.mjs         # Processes tiles and data from data repo → deploy/data/
build.mjs              # Local dev entry point: node build.mjs /path/to/data-repo
vite.config.js         # Vite/Vitest configuration
.github/workflows/
  build.yml            # Reusable GHA workflow: build + deploy to GitHub Pages
notes.md               # Internal data structure documentation
```

## Data Repo Interface

The engine expects a data repo with this layout:

```
data/
  config.json          # Per-dimension spatial config (X0, Z0, defaults, tile paths)
  dates.json           # YYYYMMDD → display string
  vods.json            # [{id, date, title}]
  overworld/*.json     # Layer files
  nether/*.json
  end/*.json
tiles/                 # tiles/[dim]/[zoom]/[x]/[z]/[date].png
static/                # Optional: site-specific assets copied into deploy/ (e.g. og.jpeg)
site.json              # Site identity — see below
```

### `site.json` schema

```json
{
  "title": "Page <title>",
  "og": {
    "title": "OG title",
    "url": "https://...",
    "image": "https://.../og.jpeg",
    "description": "...",
    "locale": "ja_JP"
  },
  "aboutTitle": "Header text for the info sidebar pane",
  "aboutHtml": "<p>HTML content for the info sidebar pane</p>"
}
```

## Reusable Workflow

Data repos call the engine like this:

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    uses: oatmeal/my-chizu/.github/workflows/build.yml@main
    # Optional override for forks:
    # with:
    #   engine_repo: your-fork/my-chizu
```

## Key Concepts

**Dimensions:** `'o'` (overworld), `'n'` (nether), `'e'` (end)

**Tile path format:** `tiles/[dimension]/[zoom]/[x]/[z]/[date].png`

**Coordinate system:** Minecraft uses X/Z axes. Leaflet uses LatLng. Conversion via `mcProject()` / `mcUnproject()` in `map.js`.

**URL state:** Hash-based (`#d=o&dD={...}`) — permalink panel encodes current view.

**Layer JSON format:** `{ id, name, dimension, markers[], lines[] }` — see `notes.md` for full schema.

**Build output:** `build-data.mjs` scans `tiles/` and emits `[dim].json` metadata (bounds, dates, layer info) plus per-date tile replacement caches into `deploy/data/`.

**`index.html` tokens:** `***TITLE***`, `***OG_TITLE***`, `***OG_URL***`, `***OG_IMAGE***`, `***OG_DESCRIPTION***`, `***OG_LOCALE***`, `***ABOUT_TITLE***`, `***ABOUT_HTML***` — substituted from `site.json` by `build-assets.mjs`.

## Code Conventions

- ES6+ (async/await, arrow functions, destructuring)
- All UI text is in Japanese
- Leaflet API extensions used extensively (custom `L.Layer`, projections)
- Pure logic should be extracted into separate `lib/*.js` modules with tests
- `lib/map.js` is the entry point that wires together modules and Leaflet
- Vite bundles all modules into a single IIFE for deployment
