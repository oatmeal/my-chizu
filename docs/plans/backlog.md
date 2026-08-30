# Backlog

Known bugs, gaps and in-code TODOs. Nothing here asserts project status — that is
[`../../STATUS.md`](../../STATUS.md) — and the two live design plans are
[`photos-ocr.md`](photos-ocr.md) and [`contributors.md`](contributors.md).

## Bugs

- **A photo pin wearing a hovered row's thumbnail says nothing about whether
  *that* photo is present or future.** `photo-pin-dim` is a cluster-level fact —
  set when every photo in the cluster postdates the selected date — and
  `.photo-pin-highlight img` restores `opacity: 1` for the duration of a hover
  anyway. So in fill mode a pin can show a future photo at full opacity while its
  `3+2` badge says only that the split exists, not which side the row is on. The
  hovered row in the pane does carry `.photos-item-dim`, so the answer is on
  screen, just not on the pin. Fixing it properly means a per-photo dim class on
  the pin's `<img>` rather than on the cluster's wrapper, which the badge would
  then want to agree with.

- **Keyboard navigation skips collapsed timeline entries.** Up/down between radio
  options passes over items inside collapsed `<details>` blocks. If fixing it
  needs JavaScript intercepting key events, it is probably not worth changing.

## Robustness

- **No error handling on `fetch`** — 5 bare `await (await fetch(url)).json()`
  calls: `map.js:300`, `setupLayers.js:86`, `setupTimeline.js:17,24,26`. A network
  error or malformed JSON crashes the app with no user feedback.
- **No error handling on `navigator.clipboard.writeText()`** in
  `setupPermalink.js:15` — fails silently if clipboard permission is denied. The
  photo lightbox's copy button (`setupPhotos.js:269`) does handle it and says so;
  the permalink panel is the one left.

## Testing

- **Partial DOM coverage of the timeline builder.** `setupTimeline.test.js` still
  only covers `getTileReplacements`. The photo half of `setupTimelinePanel` is
  exercised end-to-end by the photo block in `test/init-integration.test.js` —
  photo-only rows, month summary counts, the terrain-date fallback,
  `setTimelineDate` — but **the VOD half is verified only by reading**: the wiring
  between an entry's fields and the rendered `<a href>` (`vodUrl(vod.id, vod.t)`),
  and the year/month group assembly. Adding VOD fixtures to that same block is the
  cheap way in.
- **No tests for `scripts/sync-vods.mjs`** — the known/stale/dedupe logic is
  untested, which is why a `?t=` suffix on an id silently became a
  duplicate-append path. `scripts/vodTitle.js` is the only part of the sync tooling
  with coverage. A cheap id-shape guard that flags a malformed id in `vods.json`
  would catch that class of mistake at sync time.

## Cleanup

- **Debug `console.log` left in production code**, 4 locations:
  - `map.js:341` — `console.log(dim, "reset")`
  - `map.js:381` — `console.log("hash", ...)`
  - `map.js:387` — `console.log("updateHash", ...)`
  - `hash.js:23` — `console.log(e, key, ...)` (in a catch block — arguably
    acceptable)

## Code smells

- **Hardcoded layer type detection.** `setupLayers.js:45` checks
  `url.endsWith("gate.json") || url.endsWith("bastion.json")` to boost z-index:
  the engine reaching into a data repo's filenames. A `zIndex` field on the layer
  JSON would do it properly. The photo layer did *not* end up forcing this — its
  pins are `divIcon` markers that sit in the normal marker pane and look fine
  there — so the smell is unchanged and still worth fixing on its own merits.
  Pinned by tests in `setupLayers.test.js`, so a fix has to update them
  deliberately.
- **Coordinate clamping duplicated 3 times** in `setupCoordinates.js` (87-88,
  168-169, 214-215). A small `clampCoord(value, min, max)` would do.

## In-code TODOs

Enhancement ideas noted in comments:

- `setupBase.js:23` — nether zoom scaling: whether tweaking minZoom/maxZoom in
  `build-data.mjs` instead of `setupBase` requires `mcProject`/`mcUnproject`
  changes
- `setupBase.js:132` — grid layer z-index ordering
- `setupBase.js:143-145` — grid layer performance (Chrome lag) and display
  improvements
- `setupCoordinates.js:3-4` — general cleanup; allow creating and saving multiple
  markers per dimension
- `setupLayers.js:8` — colour styling via layer fraction is a hack
- `setupLayers.js:34,61,66` — more info in marker/line popups; interpolated
  coordinates of a clicked polyline point
- `setupLayers.js:41` — hardcoded z-index offset (1000) for gate/bastion markers
- `setupLayers.js:181` — navigating to a marker whose layer isn't displayed
  (temporary marker?)
- `map.js:237` — nether polyline styling not defined
- `map.js:432` — other settings not saved in hash
- `setupPermalink.js:49` — other settings not included in the permalink
