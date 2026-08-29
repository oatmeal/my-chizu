# Remaining Improvements

## Bugs

- In the timeline view, using the keyboard up/down to navigate between radio options skips the items that are inside collapsed `<details>` blocks. If modifying this requires Javascript to intercept keyboard events then it's probably not worth changing.

## Features

- **Screenshot photo layer** — display screenshots pinned where they were taken, filtered by the timeline. Designed in `PLAN_PHOTOS.md`; not started. The original open questions (what metadata to carry, how it interacts with the timeline) are answered there; the ones still open are listed at the end of that doc.

## Robustness

- **No error handling on `fetch` calls** — 5 bare `await (await fetch(url)).json()` calls across `map.js`, `setupLayers.js`, `setupTimeline.js`. A network error or malformed JSON crashes the app with no user feedback.
- **No error handling on `navigator.clipboard.writeText()`** in `setupPermalink.js:15` — fails silently if clipboard permission is denied.

## Testing

- **No DOM-level coverage of the timeline builder** — `vite.config.js` sets `environment: "node"`, and `setupTimeline.test.js` only covers `getTileReplacements`. The DOM-building `setupTimelinePanel` is untested, so the wiring between an entry's fields and the rendered `<a href>` (`vodUrl(vod.id, vod.t)` at `setupTimeline.js:189`) is verified only by reading, as is the year/month group assembly. The date/VOD interleaving no longer needs jsdom — it moved to `buildTimelineEntries` in `lib/timeline.js` and is covered there. `setupLayers.js` is covered by stubbing Leaflet and the DOM rather than standing up jsdom; the same approach would work here.
- **No tests for `scripts/sync-vods.mjs`** — the known/stale/dedupe logic is untested, which is why a `?t=` suffix on an id silently became a duplicate-append path. `scripts/vodTitle.js` is the only part of the sync tooling with coverage. A cheap id-shape guard that flags a malformed id in `vods.json` would catch that class of mistake at sync time.

## Cleanup

- **Debug `console.log` left in production code** (4 locations):
  - `map.js:331` — `console.log(dim, "reset")`
  - `map.js:371` — `console.log("hash", ...)`
  - `map.js:377` — `console.log("updateHash", ...)`
  - `hash.js:23` — `console.log(e, key, ...)` (in a catch block — arguably acceptable)

## Code Smells

- **Hardcoded layer type detection** — `setupLayers.js:41` checks `url.endsWith("gate.json") || url.endsWith("bastion.json")` for z-index boosting: the engine reaching into a data repo's filenames. A `zIndex` field on the layer JSON would do it properly. The photo layer will want a z-order of its own, which is the point at which this is worth fixing. Pinned by tests in `setupLayers.test.js`, so a fix has to update them deliberately.
- **Coordinate clamping duplicated 3 times** in `setupCoordinates.js` (lines 87-88, 168-169, 214-215). Could extract a small `clampCoord(value, min, max)` helper.

## In-Code TODOs

These are enhancement ideas noted in comments throughout the codebase:

- `setupBase.js:22-24` — Nether zoom scaling: investigate whether tweaking minZoom/maxZoom in build-data.mjs instead of setupBase requires mcProject/mcUnproject changes
- `setupBase.js:125` — Grid layer z-index ordering
- `setupBase.js:136-138` — Grid layer performance (Chrome lag) and display improvements
- `setupCoordinates.js:3-6` — Allow creating/saving multiple markers per dimension; store in hashObj or JSON
- `setupLayers.js:8` — Color styling via layer fraction is a hack
- `setupLayers.js:33,60,65` — Add more info to marker/line popups; show interpolated coordinates of clicked polyline point
- `setupLayers.js:41` — Hardcoded z-index offset (1000) for gate/bastion markers
- `setupLayers.js:162` — Handle navigating to a marker whose layer isn't displayed (temporary marker?)
- `map.js:235` — Nether polyline styling not defined
- `map.js:422,424` — Other settings not saved in hash; zoom 3 workaround unexplained
- `setupPermalink.js:48` — Other settings not included in permalink
