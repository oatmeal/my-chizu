# Remaining Improvements

## Robustness

- **No error handling on `fetch` calls** — 5 bare `await (await fetch(url)).json()` calls across `map.js`, `setupLayers.js`, `setupTimeline.js`. A network error or malformed JSON crashes the app with no user feedback.
- **No error handling on `navigator.clipboard.writeText()`** in `setupPermalink.js:15` — fails silently if clipboard permission is denied.

## Cleanup

- **Debug `console.log` left in production code** (4 locations):
  - `map.js:331` — `console.log(dim, "reset")`
  - `map.js:371` — `console.log("hash", ...)`
  - `map.js:377` — `console.log("updateHash", ...)`
  - `hash.js:23` — `console.log(e, key, ...)` (in a catch block — arguably acceptable)

## Code Smells

- **Hardcoded layer type detection** — `setupLayers.js:34` checks `url.endsWith("gate.json") || url.endsWith("bastion.json")` for z-index boosting. Fragile if naming changes; consider using layer metadata instead.
- **Coordinate clamping duplicated 3 times** in `setupCoordinates.js` (lines 87-88, 168-169, 214-215). Could extract a small `clampCoord(value, min, max)` helper.

## In-Code TODOs

These are enhancement ideas noted in comments throughout the codebase:

- `setupBase.js:22-24` — Nether zoom scaling: investigate whether tweaking minZoom/maxZoom in build-data.mjs instead of setupBase requires mcProject/mcUnproject changes
- `setupBase.js:125` — Grid layer z-index ordering
- `setupBase.js:136-138` — Grid layer performance (Chrome lag) and display improvements
- `setupCoordinates.js:3-6` — Allow creating/saving multiple markers per dimension; store in hashObj or JSON
- `setupLayers.js:5` — Color styling via layer fraction is a hack
- `setupLayers.js:26,46,51` — Add more info to marker/line popups; show interpolated coordinates of clicked polyline point
- `setupLayers.js:33` — Hardcoded z-index offset (1000) for gate/bastion markers
- `setupLayers.js:129` — Handle navigating to a marker whose layer isn't displayed (temporary marker?)
- `map.js:235` — Nether polyline styling not defined
- `map.js:422,424` — Other settings not saved in hash; zoom 3 workaround unexplained
- `setupPermalink.js:48` — Other settings not included in permalink
