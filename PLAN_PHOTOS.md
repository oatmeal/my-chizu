# Screenshot photo layer — design doc

Status: **design; the engine prep is done, the feature is not started.** This
doc is the shared context across sessions. When something here is settled by
writing code, update the section rather than leaving the doc describing a plan
the code no longer follows.

Done so far: the refactors that give photos somewhere to attach — a renderer
dispatch in `lib/setupLayers.js`, a pure `buildTimelineEntries` and a
kind-keyed `SUMMARY_KINDS` in `lib/timeline.js`, `extendBounds` in
`build-data.mjs` — plus a latent crash on a layer without markers, and a
build-determinism fix. See "The seams are already in place" below. Nothing
photo-specific exists yet: no extractor, no `photos.json`, no renderer.

Two repos are involved:

- `mc-screenshot-to-map` — extraction: classify raw files, read coordinates and
  timestamps, crop and encode. Everything here is derived and reproducible.
- `my-chizu` (this repo) — the viewer: a photo layer, its timeline behaviour,
  and the lightbox. Engine-generic; `llmr` supplies the data.

## Goal

Show the non-map screenshots in `../raw` as located, dated photos on the map —
Google Maps' photo pins — and make them interact with the existing timeline so
that scrubbing time changes which photos exist, not just which tiles render.

## The source data

Measured over `../raw`, 2026-08. 1,414 PNGs that are not map tiles, across 217
date folders. **198 of those 217 dates have no map tiles at all**, against a
current timeline of 76 tile dates and 124 VODs. Photos roughly triple the
timeline's date count; most photo dates land on rows that do not exist today.

| Group | n | PNG | WebP 1600px q80 |
|---|---|---|---|
| Named by world coord (`6827x740z.png`) | 291 | 391 MB | 38 MB |
| Chat logs (`chat1.png`) | 414 | 322 MB | 37 MB |
| Named descriptively (`kadan1.png`, `1.png`, `IMG_0467.png`) | 581 | 302 MB | 37 MB |
| **Total** | **1,286** | **1,015 MB** | **~112 MB** |

Mean 129 KB/photo at 1600px q80; 400px thumbnails run ~12 KB. The full set as
PNG would exceed the GitHub Pages 1 GB cap on its own; re-encoded it does not
come close.

**The world-coord group is 268 photos, not 291.** 23 files are variants at the
same coordinate in the same folder. 17 carry a `c` suffix and are *hand-cropped
duplicates* — `6956x744zc.png` is 1919x1005 against its `z` sibling's 1920x1080,
someone having de-chromed it by hand, slightly wrong, at 1005 rows rather than
1008. Dedupe rule: **prefer the uncropped `z` original** and let the pipeline
crop consistently. These are also the ~16 "already cropped" rows in the chrome
survey below — the same files, counted twice. The remaining 6 variants (`za`,
`zb`, `z-0`, `z-1`) look like genuinely different shots from one spot and stay
as separate photos; this has not been checked file by file.

**About 12 of them are nether.** `20230210/216x59z.png` is a nether highway —
netherrack ceiling, HUD `位置: 216, 56, 59` — and a whole corridor of them share
Z=59 across dates. Rendering those on the overworld map puts them 8x out of
place. Dimension is therefore not an afterthought; see below.

Two filename/HUD pairs check out exactly (`216x59z` = `216, 56, 59`;
`-7771x2879z` = `-7771, 199, 2879`), so the filename is the player's X/Z. But
note what `find_misnamed_tiles.py` already found: five *tile* files whose
coordinate was simply wrong. Photo filenames come from the same hands and have
no equivalent cross-check — you cannot correlate a perspective screenshot
against a tile. `src: filename` is plausible and permanently unverifiable, which
makes `photo_overrides.csv` the only correction mechanism rather than a
convenience.

### What metadata each screenshot carries

Four tiers, in descending order of confidence:

1. **World coordinate in the filename** — 291 files. X/Z free, no OCR.
2. **Coordinate HUD** — Bedrock's Show Coordinates renders `位置: 6659, 62, 509`
   at top-left. Exact X/Y/Z from a fixed crop. Present on many of the files
   whose names say nothing; the survey of how many has not been run (Phase 0).
3. **Taskbar clock** — `3/29/2023 9:48 PM` bottom-right, wall-clock to the
   minute. Present only when the taskbar is (see below).
4. **Folder date** — always available, `YYYYMMDD`, sometimes with a `-N` session
   suffix.

`mc-screenshot-to-map/metadata/raw_ignore.csv` already classifies these files —
it distinguishes `"named for the player's world coordinate, not a tile
coordinate"`, `"chat log(s)"` and `"unnamed screenshot(s)"`. The classifier
exists; today its output is a skip reason. Phase 1 promotes it to a category.

## Window chrome and the crop

Screenshots are 1920×1080 desktop captures with Windows chrome. Measured over
all 291 world-coord files, sampling the centre strip (x ∈ 36–58%, which misses
both the title-bar text and the taskbar icons):

| Top black band | Bottom grey band | Height | n |
|---|---|---|---|
| 32 | 40 | 1080 | 198 |
| 32 | 0 | 1080 | 29 |
| 0 | 0 | 1080 | 31 |
| 0 | 0 | 1003–1032 | ~16 |
| 32 | 0 | 1252 | 2 |
| overshoot | — | 1080 | 4 |

Read: the canonical case is a **32px title bar (`#000000`) and a 40px taskbar
(`#2D2D2D`)**, leaving a 1920×1008 game area at `+0+32`. 29 files have the title
bar with no taskbar (game content runs to the bottom edge — verified, not a
centred Windows 11 taskbar). 31 are fullscreen with no chrome. ~16 were already
cropped by hand at some point. Two are from a taller display.

**The crop must be detected, and the detection must be constrained.** The four
"overshoot" rows are the reason: a night or cave screenshot has a genuinely
black sky, and a greedy "consume leading black rows" scan ate 82, 99, 125 and
214 rows of actual game content. Rules:

- Accept a top band **only if it is exactly 32 rows**, and row 32 is not black.
- Accept a bottom band **only if it is exactly 40 rows** of `#2D2D2D` (±6).
- Verify uniformity across the full width excluding the icon zones — check
  x ∈ [200, 1700] for the title bar, x ∈ [500, 1550] for the taskbar.
- Anything else: crop nothing, flag for review. Never guess a band height.

**Order matters: OCR the taskbar clock before cropping it away.** The clock is
the only source of wall-clock time, and ~60 files (29 + 31) have no taskbar and
therefore no time beyond their folder date.

The crop is for looks, not bytes — it removes 6.7% of rows, and they are the
cheapest rows in the image. It changes the storage estimates by ~3%.

## Storage and repo layout

Current `llmr` deploy is 211 MB (196 MB of it 4,543 tiles) against the GitHub
Pages 1 GB cap.

- world-coord photos only → **253 MB**, 25% of cap
- every screenshot → **334 MB**, 33% of cap

**Decision: one repo, no split.** At ~45 new date folders a year this is a
decade of headroom, and a second repo costs two deploys to keep in sync.
Bandwidth is not a concern either: thumbnails are lazy-loaded, so a session
pulls a few hundred KB, not the set.

**But build the escape hatch now.** `site.json` carries:

```json
"photos": { "baseUrl": "photos/", "thumbUrl": "photos/thumb/" }
```

Relative by default. If the set ever does outgrow the repo, moving to
`https://oatmeal.github.io/llmr-photos/` is a config edit and a file move — no
code change, no data migration. A plain `<img>` loads cross-origin without CORS.

The real constraint is **git history, not the deploy cap.** `llmr/.git` is
185 MB, and it is that small only because the tiles were written once. Each
re-encode of the photo set adds another ~40 MB of blobs permanently. So:

- **Settle the encoding before the first commit.** Encode a 30-file sample at
  the candidate settings, look at them, pick one, then import. Revision three is
  what hurts, not the import.
- **Raw PNGs never enter the data repo.** `../raw` is untracked by `llmr` today.
  Keep it that way; the deploy artifact is the derived WebP. If the originals
  ever need publishing, GitHub Releases assets stay out of git history.

Encoding baseline, subject to the Phase 0 eyeball: WebP, long edge 1600,
q80, plus a 400px q72 thumbnail. Verified legible at that setting — the taskbar
clock survives, block edges stay clean. Minecraft's flat-shaded art is close to
a best case for WebP.

## Data format

`data/[dim]/photos.json`, alongside the existing layer files:

```json
{ "id": 102, "name": "スクリーンショット", "kind": "photos",
  "photos": [
    { "f": "20240828/6827x740z",
      "date": "20240828",
      "time": "12:28",
      "pos": [6827, 74, 740],
      "src": "filename",
      "title": "..." }
  ] }
```

`id` is a **number**, and must be unique *across all dimensions* — see the
gotchas below. Follow llmr's existing banding: overworld 100s, nether 1-50,
end 200s. So `photos` is 102 in the overworld, 51 in the nether, 202 in the end.

- `f` — path stem under `baseUrl`/`thumbUrl`; the encoder owns the extension.
- `time` — `HH:MM` from the taskbar clock, omitted when there is no taskbar.
- `pos` — `[x, y, z]` in **dimension-native coordinates**, exactly as layer
  markers already are. Never bake the nether x8 into the data; `dimScale()`
  applies it at render time. `y` is null when the position came from a
  filename, which carries no height.
- `kind` — dispatches the renderer in `setupLayer()`. Absent means the existing
  marker/line layer.
- `src` — `filename` | `hud` | `manual`. **Keep this.** It is the same
  discipline `sync-vods.mjs` uses when it labels which source a date came from,
  and you will want it the first time a photo lands in the middle of the ocean.
- `title` — optional, hand-written, never generated.

Hand corrections live in `mc-screenshot-to-map/metadata/` as CSV next to
`raw_identity.csv`, for the reason `metadata_store.py` already gives: the diff
is the audit trail. A `photo_overrides.csv` keyed by raw path, carrying
position, time and title, applied over whatever extraction produced.

## Dimension independence

**Decision: Phase 1 ships overworld only, but nothing in the code is
overworld-specific.** Nether photos land before the feature deploys, and adding
them must be a data change, not a code change.

This costs almost nothing, because the layer system *is* the mechanism. Photos
ride it as a layer kind rather than a parallel system:

- `build-data.mjs` globs `data/[dimension]/*.json` and builds every match into
  that dimension's layer list. Dropping `data/nether/photos.json` in later is
  picked up with no new discovery code.
- `setupLayer()` in `lib/setupLayers.js` already does
  `const scale = dimScale(mymap.dim); const x = pos[0] * scale`. Store
  dimension-native coordinates and the nether x8 is handled for free.
- The layers panel checkbox, the `visibleLayers` set, and its hash persistence
  are all per-dimension already.
- `changeDim()` swaps `mymap.dimData`, so a viewer that only ever reads
  `mymap.dimData` never learns dimensions exist.

**The rule that keeps it that way: no code may branch on dimension.** The one
legitimate exception is `dimScale()`, which already exists. If a second
`dim === DIM_NETHER` appears anywhere in the photo code, something is wrong.

### The seams are already in place

The prep refactors landed, so each of these is now an entry in a list rather
than new plumbing:

- **Rendering** — add `{ key: "photos", render: renderPhotos }` to `RENDERERS`
  in `lib/setupLayers.js`. `renderPhotos` receives `(mymap, data, dataLayer,
  { url, fraction })` like its siblings, and `setupLayers.test.js` shows how to
  test it without a browser.
- **Timeline order** — pass a second stream to `buildTimelineEntries(dates, [...])`
  in `lib/setupTimeline.js`, and switch on `kind` in the loop that follows.
  The merge itself is pure and tested in `lib/timeline.js`.
- **Month counts** — add `{ kind: "photo", icon: () => "📷" }` to `SUMMARY_KINDS`
  in `lib/timeline.js`, and count it where `addVodEntry` counts VODs.
- **Bounds** — one more `extendBounds(bounds, points, dim)` call in
  `build-data.mjs`, next to the markers and lines calls.

### Three gotchas in the existing build

1. **The glob will eat `photos.json` as a layer.** `data/[dim]/*.json` matches
   it, and `build-data.mjs` throws on a missing `id`. Give it the layer envelope
   (`id`, `name`) and a `kind` that `setupLayer()` dispatches on, rather than
   inventing a path outside the glob.
2. **`layerIds` is global across dimensions.** It is declared *outside* the
   `for (const dim of ...)` loop, so a duplicate `id` in two dimensions throws
   at build time. `photos` in the overworld and in the nether need different
   ids. llmr's existing layers are numeric and already banded this way —
   `gate.json` is 100 in the overworld and 1 in the nether.
3. **`id` must be numeric.** `sortedLayers.sort((a, b) => a.id - b.id)`
   subtracts them; a string id yields `NaN` and an unstable sort.

### The one dimension-aware edit

`build-data.mjs` computes each dimension's bounds through `extendBounds`, which
is where the nether scale is applied and the only place in the build that does
dimension math. It is called for `over.markers` and `over.lines`; photos need a
third call. Everything else stays dimension-blind.

## Extraction pipeline

New `mc-screenshot-to-map/screenshots.py`, plus a `scripts/build_photos.py`
entry point that writes into the `llmr` checkout.

1. **Classify** every raw file: `tile` | `photo` | `chat` | `unknown`. Promote
   the logic behind `raw_ignore.csv` from a skip reason to a category, and keep
   `raw_ignore.csv` generated from it so the existing pipeline is unaffected.
2. **Locate** — filename coordinate first; else OCR the HUD crop; else
   unpositioned. Record `src`.
3. **Timestamp** — OCR the taskbar clock crop, before the crop step.
4. **Crop** — detect the chrome bands under the constrained rules above.
5. **Encode** — WebP full + thumbnail.
6. **Emit** `photos.json` per dimension, applying `photo_overrides.csv`.

**Dimension.** Not recoverable from a filename, only sometimes from the image.
The extractor tags every photo `overworld` | `nether` | `end` | `unknown`, and
Phase 1 writes only the `overworld` file. `unknown` is never defaulted — a
defaulted nether photo lands 8x out of place, silently. It goes into a report
for the overrides CSV instead.

There is a usable hint, if it earns its keep: the base sits at ~(6500, 500)
overworld, and the suspected nether photos cluster around ~(810, 60), which is
that divided by eight. Small magnitude *and* landing on an overworld cluster
over eight is suggestive. At 12 files, hand-entering the overrides is cheaper
and certain.

## Viewer

New modules in this repo, following the existing split — pure logic in `lib/*.js`
with tests, wiring in a `setup*.js`:

- `lib/photos.js` — pure: filtering a photo list by timeline date and mode,
  clustering by zoom, building the lightbox caption. Tested.
- `lib/setupPhotos.js` — Leaflet layer, markers, lightbox, sidebar pane.
- `static/index.html` — a photos pane and its sidebar tab.

**Clustering is the primary case, not a refinement.** The photos are severely
concentrated: 40% of them sit in one 500-block cell at (6500, 500), the top
three cells hold 54%, and the whole set spans 50 occupied cells across
X -7,787..16,210. The default view is 118 pins stacked on the main base. A
photo-pin map without clustering does not work at all here.

Rendering, zoom-dependent: cluster bubble with a count when far out; the top
photo at each cluster as a small square thumbnail pinned to the map at mid
zoom (the Google Maps look); individual pins when close. Worth building
custom rather than pulling in Leaflet.markercluster, since the thumbnail-as-pin
behaviour is wanted anyway.

A photos sidebar pane lists thumbnails for photos in the current viewport,
re-filtered on `moveend`. Pan to a build, see its photos; click one, the map
flies to its pin. Given the concentration above this is **co-primary, not
secondary** — a 118-photo cluster cannot be explored by clicking pins, so the
list is the only way through the main base. The marker path is for when you are
already looking at a place.

## Timeline behaviour

**Photos obey the timeline's existing exact/before/fill semantics.** The
timeline already means three things about tiles; it means the same three about
photos:

- **exact** → only photos taken on the selected date
- **before** (default) → every photo up to and including it
- **fill** → photos from any date, dimmed if they postdate the selection

Scrubbing backward empties the map of photos that had not been taken yet; the
world visibly fills with memories as you move forward. No new control, no new
mental model.

`groupSummaryHtml` in `lib/timeline.js` already renders `(🗓3) (▶4)` per
year/month group. Add `(📷12)`. One small change, and it makes the photo dates
discoverable from the pane people already open.

**Photo-only dates need their own row type.** A date with photos but no tiles
cannot be a tile-selection radio — there is nothing to redraw. It should render
as a non-radio row (as VOD rows do today) that sets the photo filter and selects
the *nearest earlier* tile date for terrain, which is what "what did this place
look like when the photo was taken" actually means.

**Clicking a photo sets the timeline to its date**, so the terrain under it
snaps to what was there, and ◀ ▶ then walk history with the photo pinned. This
pairing is the point of the feature.

**Chat logs stay off the map.** They have no location and reading one is a
full-screen act. Timeline-only entries — a 💬 count in the month summary and a
row that opens the lightbox — sitting alongside VOD rows. Placing them
geographically would be inventing data.

## Rejected

**Deep-linking a photo into the VOD at the moment it was taken.** The taskbar
clock plus a stream start time would give a seconds offset, which is exactly the
`t` field `vodUrl()` already renders. It does not work: the majority of the
VODs are re-uploads of Twitch archives, so the YouTube timestamps describe the
re-upload, not the stream. Revisit only if a source of true stream start times
turns up.

## Phases

- **Phase 0 — survey.** How many of the 581 descriptively-named files have a
  readable HUD? Settle the encoding by eyeballing a sample. Both are cheap and
  both change the plan; do them before writing the importer. No commits to
  `llmr`.
- **Phase 1 — extraction, world-coord only.** Classifier, crop, encode,
  `photos.json` for the 291 files with free coordinates. Zero OCR. Produces real
  data to build the viewer against.
- **Phase 2 — viewer v1.** Photo layer, markers with clustering, lightbox,
  timeline filtering by the three existing modes, month-summary counts.
- **Phase 2.5 — nether and end photos.** Fill in the dimension overrides, write
  `data/nether/photos.json`. If Phase 1 and 2 were built to the rule above this
  is a data change and nothing else; if it turns out not to be, that is the bug
  to fix before deploying.
- **Phase 3 — OCR.** HUD coordinates and taskbar clock, bringing in the
  descriptively-named set. Overrides CSV for what OCR gets wrong.
- **Phase 4 — chat logs** as timeline-only entries.

Phase 1 + 2 is a coherent shippable feature on its own, and it proves the
timeline interaction before any investment in OCR. **The feature does not deploy
before Phase 2.5** — shipping an overworld-only photo layer would silently drop
photos that exist.

For the *prototype*, invert 1 and 2. Extraction is known work; the clustering UX
and the timeline interaction are the unknowns. Hand-write a `photos.json` for
the 118 base-cluster photos, encode them roughly, and build the viewer against
that — an afternoon tells you whether exact/before/fill feels as good in
practice as it reads on paper, and if it does not, nothing was spent on OCR.

## Open questions

- How many `-N` session variants matter for photos — is folder-date granularity
  enough, or does the timeline need the wall-clock time as a sort key within a
  day?
- Should an unpositioned photo (dated but no coordinate) appear at all? A
  timeline-only row like a chat log is the obvious answer, but it may be a large
  and uninteresting pile.
- Clustering: cluster in world coordinates at a fixed radius, or in screen
  pixels per zoom level? Screen pixels behaves better; world coords are stable
  across zoom and cacheable. Needs answering *before* the viewer, not after —
  see the concentration figures above.
- Do the 6 non-`c` variants (`za`, `zb`, `z-0`, `z-1`) hold distinct shots, or
  more hand-edits? 23 files turn on this; nobody has opened them.
- Are the filename coordinates right? Two spot-checks agree with the HUD
  exactly. Ten more would be worth the ten minutes, given the tile precedent.
