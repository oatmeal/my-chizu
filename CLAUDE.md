# CLAUDE.md

## Project overview

Generic Minecraft tile-map viewer engine. Provides the map application
(`lib/`), the build tooling, and a reusable GitHub Actions workflow. Data repos
— tiles, layer JSONs, dates, VODs, photos — plug in via a `site.json` config
file.

Reference implementation and primary data repo:
[oatmeal/llmr](https://github.com/oatmeal/llmr), the map for the Minecraft
server りりまる村. The screenshots and tiles it publishes are produced by the
sibling `../mc-screenshot-to-map`.

**Read [`STATUS.md`](STATUS.md) first.** It is the one file that says where
things stand; the design docs describe how things work, not whether they are
done.

## Doc layout

Every document here is one of five things, and mixing them is what the layout
exists to prevent:

| | |
|---|---|
| [`STATUS.md`](STATUS.md) | **Status.** The only file that asserts it. |
| [`README.md`](README.md) | **For someone using the engine** for their own map. |
| `CLAUDE.md` | **Instructions.** This file: conventions, commands, what to read. |
| `docs/` | **Durable design** — how a subsystem works and why. |
| `docs/plans/` | **Live plans** — work that is not built yet, and the backlog. |

Before every commit, check whether `STATUS.md` and the affected `docs/` file
need updating. If you finish something, it changes in `STATUS.md` — not in five
places.

## Read before you change

Each of these records a decision that was expensive to reach, and in several
cases the first obvious approach is the one that was already tried and refuted.

| Before touching | Read | Why it will cost you |
|---|---|---|
| `lib/setupPhotos.js`, `lib/photos.js`, clustering, the lightbox | [`docs/photos.md`](docs/photos.md) | A pure grid bounded average density and *nothing* bounded pin overlap; the lead photo has to be the newest **undimmed** one or a bright pin shows a photo the timeline says was never taken |
| `lib/map.js`, `lib/hash.js`, `lib/permalink.js`, dimension switching | [`docs/viewer.md`](docs/viewer.md) | `dimchange` vs `dimviewready` ordering; `ph` is an arrival instruction, not state; `buildPermalinkUrl` is the only place a hash URL may be assembled |
| `build-data.mjs`, `build-assets.mjs`, any layer-file field | [`docs/data-repo.md`](docs/data-repo.md) | Layer `id` is a number unique across *all* dimensions; `kind` must reach the viewer before the layer file is fetched |
| `lib/timeline.js`, `scripts/sync-vods.mjs`, `data/vods.json` | [`docs/vods.md`](docs/vods.md) | `id` must stay a bare video id — a `?t=` glued on makes the sync duplicate the video and report the real entry as stale |

Live plans: [`docs/plans/photos-ocr.md`](docs/plans/photos-ocr.md),
[`docs/plans/contributors.md`](docs/plans/contributors.md), and
[`docs/plans/backlog.md`](docs/plans/backlog.md) for bugs and in-code TODOs.

## Tech stack

- **Leaflet.js** (v1.9.2) — map rendering
- **Vanilla JavaScript** — no framework; ES modules in `lib/`
- **Node.js 16+ / npm 7+** — build tooling only
- **Vite** — JS bundling (IIFE) and minification
- **Vitest** — unit testing
- **GitHub Pages** — deployment target

## Commands

```bash
npm install                                  # one-time setup
node build.mjs /path/to/data-repo            # build into data-repo/deploy/
python -m http.server --directory /path/to/data-repo/deploy
npm test                                     # vitest
```

To see a photo change end to end without committing anything, follow
"Previewing before you commit" in [`docs/photos.md`](docs/photos.md).

## Project structure

```
lib/                   The viewer. See docs/viewer.md for the module table
  map.js               Entry point; wires Leaflet to the panels
  *.test.js            Vitest unit tests alongside each module
test/                  Tests that need a real build or real Leaflet under jsdom
scripts/
  sync-vods.mjs        Sync data/vods.json from YouTube playlists (needs yt-dlp)
  migrate-twitch-vods.mjs  One-shot Twitch → YouTube id migration (provenance)
  vodTitle.js          VOD title cleaning rules (pure, tested)
  ytdlp.js             yt-dlp CLI wrappers
static/                HTML template, CSS, icons, YouTube branding
  index.html           Contains ***TOKEN*** placeholders, filled from site.json
build-assets.mjs       Creates deploy/ skeleton: static files, Leaflet, map.js
build-data.mjs         Processes tiles and data from a data repo → deploy/data/
build.mjs              Local dev entry point: node build.mjs /path/to/data-repo
vite.config.js         Vite/Vitest configuration
.github/workflows/
  build.yml            Reusable GHA workflow: build + deploy to GitHub Pages
```

## Code conventions

- ES6+ (async/await, arrow functions, destructuring).
- **All UI text is in Japanese.**
- Leaflet API extensions used heavily (custom `L.Layer`, projections).
- **Pure logic goes in its own `lib/*.js` module with tests beside it.**
  `lib/map.js` wires modules and Leaflet together and should not grow logic of
  its own.
- **No code branches on dimension** — `dimScale()` is the one exception. A
  dimension test anywhere else is how a nether feature lands 8× out of place,
  silently.
- **A new kind of layer content is an entry in `RENDERERS`**, not a branch.
- Vite bundles everything into a single IIFE for deployment.
