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

## Syncing VODs

`scripts/sync-vods.mjs` pulls VOD entries from YouTube into a data repo's
`data/vods.json`, so the timeline's stream links can be refreshed without
hand-editing JSON. Requires [yt-dlp](https://github.com/yt-dlp/yt-dlp) on PATH.

```bash
node scripts/sync-vods.mjs /path/to/data-repo            # dry run — prints the report
node scripts/sync-vods.mjs /path/to/data-repo --write    # apply it
```

Sources come from `vods.playlists` / `vods.extraVideos` in the data repo's
`site.json`, overridable ad hoc with `--playlist URL` and `--video ID`.

Existing entries are never modified, so manual title and date fixes survive
re-runs; only videos whose id isn't already in `vods.json` are appended, and the
list is re-sorted by date. Extra fields on existing entries, such as a `t` start
offset, are carried through untouched. The stream date comes from a
`YYYY年M月D日` substring in the title, falling back to the video's YouTube
release date — which for a re-upload of an older stream is the *upload* date,
not the stream date, so the report labels which source each date came from.
Undated videos are skipped and listed for manual entry.

The report also flags entries in `vods.json` that no longer appear in any
source, which means the video was removed, privated, or needs pinning via
`vods.extraVideos`.

`scripts/migrate-twitch-vods.mjs` is a one-shot, kept for provenance: it records
how llmr's 109 Twitch VODs were paired with their YouTube re-uploads. It refuses
to run against an already-migrated `vods.json`.

## Project Structure

```
scripts/
  sync-vods.mjs        # Sync data/vods.json from YouTube playlists (needs yt-dlp)
  migrate-twitch-vods.mjs # One-shot Twitch → YouTube id migration (provenance)
  vodTitle.js          # VOD title cleaning rules (pure, tested)
  ytdlp.js             # yt-dlp CLI wrappers
lib/
  map.js               # Main application logic — wires together the modules below
  hash.js              # URL hash parsing (pure, tested)
  tileDate.js          # Tile date selection for exact/fill/before modes (pure, tested)
  timeline.js          # Date formatting, group summaries, timeline entry merge (pure, tested)
  setupLayers.js       # Leaflet layer rendering, dispatched on content kind (tested)
  setupTimeline.js     # Timeline panel DOM; getTileReplacements (partly tested)
  *.test.js            # Vitest unit tests alongside each module
static/                # HTML template, CSS, icons, YouTube branding
  index.html           # Contains ***TOKEN*** placeholders for site-specific content
build-assets.mjs       # Creates deploy/ skeleton: static files, Leaflet deps, map.js
build-data.mjs         # Processes tiles and data from data repo → deploy/data/
build.mjs              # Local dev entry point: node build.mjs /path/to/data-repo
vite.config.js         # Vite/Vitest configuration
.github/workflows/
  build.yml            # Reusable GHA workflow: build + deploy to GitHub Pages
notes.md               # Internal data structure documentation
TODO.md                # Known bugs, gaps and in-code TODOs
PLAN_PHOTOS.md         # Design for the screenshot photo layer (not started)
```

## Data Repo Interface

The engine expects a data repo with this layout:

```
data/
  config.json          # Per-dimension spatial config (X0, Z0, defaults, tile paths)
  dates.json           # YYYYMMDD → display string
  vods.json            # [{id, date, title, t?}] — id is a YouTube video id
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
  "aboutHtml": "<p>HTML content for the info sidebar pane</p>",
  "vods": {
    "playlists": ["https://www.youtube.com/playlist?list=..."],
    "extraVideos": ["videoId"],
    "titleCleanup": {
      "vocab": ["extra boilerplate tag tokens to strip"],
      "overrides": { "videoId": "hand-written title" }
    }
  }
}
```

The `vods` block is only read by `scripts/sync-vods.mjs`; the build ignores it.
`extraVideos` pins videos that belong in the timeline but sit outside the
playlists. Under `titleCleanup`, `vocab` adds site-specific boilerplate tokens
to the engine defaults in `scripts/vodTitle.js`, and `overrides` supplies a
final title for videos the cleaning rules can't fix (an unbalanced `【`, a title
truncated on YouTube itself).

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

**Layer JSON format:** `{ id, name, dimension, markers[], lines[] }` — see `notes.md` for full schema. A layer file may carry any combination of content arrays; `RENDERERS` in `lib/setupLayers.js` maps each key to the function that draws it, so a new kind of content is an entry there rather than a branch. `id` must be a **number** and unique across *all* dimensions — `build-data.mjs` collects ids in one dict for the whole build and sorts layers numerically.

**Adding a timeline entry kind:** `buildTimelineEntries()` in `lib/timeline.js` merges the tile dates with any number of pre-sorted streams (VODs today), and `SUMMARY_KINDS` in the same file drives the per-month counts. Both take new kinds without a signature change.

**VOD links:** `vods.json` entries link to YouTube. `vodUrl()` / `vodIconHtml()` in `lib/timeline.js` are the only places the provider is named, so pointing the timeline elsewhere means changing those two functions and `static/youtube.svg`.

**VOD start offsets:** an entry may carry an optional `t` (seconds) to deep-link
part way into a long stream — `vodUrl()` renders it as YouTube's `&t=<n>s`. It is
a separate field on purpose: `id` must stay a bare video id, since
`scripts/sync-vods.mjs` matches ids against playlist entries verbatim and would
otherwise re-add the video as a duplicate and report the offset entry as stale.

**Build output:** `build-data.mjs` scans `tiles/` and emits `[dim].json` metadata (bounds, dates, layer info) plus per-date tile replacement caches into `deploy/data/`.

**`index.html` tokens:** `***TITLE***`, `***OG_TITLE***`, `***OG_URL***`, `***OG_IMAGE***`, `***OG_DESCRIPTION***`, `***OG_LOCALE***`, `***ABOUT_TITLE***`, `***ABOUT_HTML***` — substituted from `site.json` by `build-assets.mjs`.

## Code Conventions

- ES6+ (async/await, arrow functions, destructuring)
- All UI text is in Japanese
- Leaflet API extensions used extensively (custom `L.Layer`, projections)
- Pure logic should be extracted into separate `lib/*.js` modules with tests
- `lib/map.js` is the entry point that wires together modules and Leaflet
- Vite bundles all modules into a single IIFE for deployment
