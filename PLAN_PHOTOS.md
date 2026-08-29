# Screenshot photo layer — design doc

Status: **Phases 0–3 are built and the first photo set is live.** The
extraction pipeline, the encoded photo set, the layer, the clustering, the
lightbox, the photos pane, the timeline interaction and the review app all
exist and are covered by tests. 280 photos were reviewed — 265 approved, 15
held — and the 265 are committed to `llmr`. What remains is Phase 4 (OCR, to
bring in the screenshots whose filenames carry no coordinate).

That a photo reaches the map only after review is now enforced rather than
remembered: for a photo, *public* means **committed**, and the review queue is
derived from `git ls-files`.

The review pass changed six things, each recorded in its own section below:
photos are switched on from the photos tab rather than from the layers panel;
clustering now guarantees a minimum separation between pins instead of only
bounding their average density; hovering a pin marks its rows and vice versa;
every tile date carries its own `(📷n)` count; a cluster the timeline has split
shows the split rather than presenting future photos as present ones; and the
lightbox has a filmstrip so a cluster is no longer a stack of unknown depth.

**Chat logs are out of scope.** They stay private and are never published, in
any form — not on the map, not as a timeline row, not as a count. The
classifier still has a `chat` category, because that is how those files are
kept out of the photo set, and it must stay: the category is the exclusion.

This doc is the shared context across sessions. When something here is settled
by writing code, update the section rather than leaving the doc describing a
plan the code no longer follows.

**This is the viewer's half of the design.** Two repos are involved and the
split is clean:

- `my-chizu` (this repo) — the viewer: the photo layer, its clustering, its
  timeline behaviour and the lightbox. Engine-generic; `llmr` supplies the data.
  `lib/photos.js` is the pure logic, `lib/setupPhotos.js` the layer, lightbox
  and pane, with coverage in `test/init-integration.test.js`.
- `mc-screenshot-to-map` — extraction and review: classify the raw files, read
  coordinates and timestamps, crop, encode, record what a person decided, and
  publish. Documented **there**: its `CLAUDE.md` carries the reasoning, its
  `README.md` the commands, its `PLAN_DEPLOY.md` §10 the UI backlog, and the
  constants that encode hard-won measurements sit in the code beside them.

What stays here is the **data contract** between the two — `photos.json`, and
what the viewer may assume about it — plus everything downstream of it. Where a
section below is about the other repo it is a summary with a pointer, not the
record; keep it that way.

## Goal

Show the non-map screenshots in `../raw` as located, dated photos on the map —
Google Maps' photo pins — and make them interact with the existing timeline so
that scrubbing time changes which photos exist, not just which tiles render.

## The source data

Measured over `../raw` by `build_photos.py --survey`, 2026-08. 5,760 images:

| Category | n | How it is decided |
|---|---|---|
| `tile` | 4,835 | nested under a dimension folder, claimed by `raw_identity.csv`, or named for a tile index |
| `chat` | 414 | `chat*.png` — classified only so they are excluded; never published |
| `photo` | 297 | loose, named for a world coordinate |
| `unknown` | 214 | loose, named descriptively — waiting on OCR |

**297 world-coord photos become 280**, after dropping the `c`-suffix files as
hand-cropped duplicates of their siblings. Two name rules move files *out* of
the photo set and are why the classifier is run rather than a glob:
`raw_identity.csv` claims 182 oddly-named loose files that content matching has
already proved are map tiles, and a filename coordinate under `TILE_COORD_MAX`
is a tile index rather than a player position. The rules and their evidence are
in `screenshots.py`; re-derive the counts with `build_photos.py --survey`.

### Dates

**372 tile dates against 120 photo dates, overlapping on 101.** Only **19 photo
dates have no tiles at all**, carrying 45 photos between them.

The original design predicted the photo-only row would be most of the timeline;
it is 19 rows. World-coord photos come from sessions where somebody was
actively mapping, so they land on tile dates far more often than the whole raw
set would. The row type is still needed and still built — it is just rare, and
that is what makes each tile date's own `(📷n)` count the load-bearing part
rather than the extra row.

## Window chrome and the crop

*Extraction. Detail and constants: `screenshots.detect_chrome`.*

The screenshots are 1920×1080 desktop captures from two machine generations, so
they carry a Windows title bar and taskbar that have to come off. The heights
are bimodal with nothing between the modes — title bars 32px (Win10) or 23px
(Win11), taskbars 40px or 47px — and only those four are accepted.

Two properties of it are worth knowing on this side, because they decide what
the viewer is handed:

- **Neither bar can be found by colour.** The Win11 pair is translucent and
  takes its tint from whatever the game draws behind it; the Win10 taskbar
  renders `#2D2D2D` with an acrylic noise no per-pixel tolerance matches. Both
  are found as a *flat horizontal band whose rows share one colour*, ending at
  a row that does not.
- **The rule refuses rather than guesses.** A band that is bar-shaped but not a
  real height crops nothing and is flagged. That matters because the failure it
  avoids is severe: a night or cave screenshot has a genuinely black sky, and a
  greedy "consume leading black rows" scan ate 82, 99, 125 and 214 rows of game
  content.

Result: **272 of 280 cropped, 7 flagged, 1 left whole deliberately.** So the
photo set is not uniform in aspect ratio: most images are 1920×1008 before
scaling, and eight keep their chrome. Nothing in the viewer may assume a common
shape, and nothing does: the pin is a fixed 56px box with `object-fit: cover`,
and the lightbox is `max-width`/`max-height` with `object-fit: contain`.

**Order matters: OCR the taskbar clock before cropping it away.** The clock is
legible in both generations and is the only source of wall-clock time; roughly
40 files have no taskbar at all and have nothing beyond their folder date.

## Storage

The encoded set is **35 MB** — 32.1 MB of full images at 1600px q80 and 2.9 MB
of 400px q72 thumbnails, mean 115 KB each. That takes `llmr/deploy` from 223 MB
to 269 MB, about a quarter of the GitHub Pages 1 GB cap.

**Decision: one repo, no split.** At this rate it is a decade of headroom, and
a second repo costs two deploys to keep in sync. Bandwidth is not a concern
either: thumbnails are lazy-loaded, so a session pulls a few hundred KB.

**The escape hatch is built.** `site.json` carries:

```json
"photos": { "baseUrl": "photos/", "thumbUrl": "photos/thumb/" }
```

Relative by default, substituted into `index.html` as `window.photosConfig` by
`build-assets.mjs`. If the set ever outgrows the repo, pointing these at
`https://oatmeal.github.io/llmr-photos/` is a config edit and a file move — no
code change, no data migration. A plain `<img>` loads cross-origin without CORS.
`lib/photos.test.js` pins that an absolute base passes through untouched.

**Raw PNGs never enter the data repo.** `../raw` is untracked by `llmr` and
stays that way; the deploy artifact is the derived WebP.

### Previewing before you commit

**Nothing has to be committed to see the real thing.** The extractor builds into
a tree of its own, the publish step copies into `llmr`'s working tree, and the
site build copies from there into the gitignored `llmr/deploy/`. So the whole
feature can be run, looked at and thrown away without touching git:

```bash
# 1-3. build, review and publish -- see mc-screenshot-to-map's README
cd mc-screenshot-to-map
uv run python scripts/build_photos.py --write
uv run python -m uvicorn web.app:app --reload      # http://localhost:8000/photos
uv run python scripts/deploy_photos.py --apply

# 4. build the site
cd ../my-chizu && node build.mjs ../llmr

# 5. serve it
python -m http.server --directory ../llmr/deploy 8000
```

Then open `http://localhost:8000/` and click the photos tab, which is what turns
the pins on. Worth walking through, because each exercises a different part of
the design:

- **Zoom out to the whole map, then in.** The cluster counts should fall apart
  into individual thumbnails. This is the clustering decision.
- **Open a cluster over the main base** and arrow through it. This is the
  190-photo stack the pins alone cannot handle.
- **Press 「この日付の地図を表示」** in the lightbox and watch the terrain
  change under the pin. This pairing is the point of the feature.
- **Scrub the timeline backward.** Photos should disappear as you pass the
  dates they were taken on, and the 📷 counts sit both in the month headings and
  on each date's own row.
- **Switch to the nether.** 17 photos, positioned by the same code.
- **Pan with the photos tab open**; the list re-filters to the viewport.
- **Hover a row, then hover a pin.** Each should mark the other.
- **Tick 「このタブを閉じても写真を地図に表示し続けます」** and close the tab; the
  pins stay, and the permalink then reproduces them.
- **Press 「リンクをコピー」 in the lightbox** and open the copied URL in a fresh
  tab: the same photo should reopen, in its pin, over the same terrain.

To undo it entirely: `git clean -nd` in `llmr` to see the untracked photo files,
then `git clean -fd` once the list looks right. The build tree is outside every
repo and can simply be deleted.

### Then committing

`llmr/.git` is 185 MB, and it is that small only because the tiles were written
once. Each re-encode of the photo set adds another ~35 MB of blobs permanently.
**Settle the encoding before the first commit** — revision three is what hurts,
not the import. The current setting is WebP, long edge 1600, q80, plus a 400px
q72 thumbnail; Minecraft's flat-shaded art is close to a best case for WebP.

This is no longer only a discipline to remember. For a photo, *public* means
**committed**, and the review app derives its queue from `git ls-files` — so
nothing reaches a commit unreviewed, the review page leads with the compression
difference at ×8, and a decision's digest covers the encoded bytes, so a
re-encode at different settings invalidates every approval rather than
inheriting it. See `mc-screenshot-to-map/CLAUDE.md`.

## Data format

`data/[dim]/photos.json`, alongside the existing layer files:

```json
{ "id": 102, "name": "スクリーンショット", "dimension": "overworld",
  "kind": "photos",
  "photos": [
    { "f": "20240828/6827x740z", "date": "20240828",
      "pos": [6827, null, 740], "src": "filename" }
  ] }
```

`id` is a **number**, unique *across all dimensions*: overworld 102, nether 51,
end 202, following llmr's existing banding. The build collects layer ids in one
dict for the whole run and sorts with `a.id - b.id`, so a duplicate throws and
a string id yields `NaN`.

- `f` — path stem under `baseUrl`/`thumbUrl`; the encoder owns the extension.
- `pos` — `[x, y, z]` in **dimension-native coordinates**, exactly as layer
  markers are. The nether ×8 is never baked in; `dimScale()` applies it at
  render time. `y` is `null` when the position came from a filename, which
  carries no height, and the lightbox caption drops it when it is.
- `kind` — dispatches the renderer. Absent means the existing marker/line layer.
- `time` — `HH:MM`, omitted when there was no taskbar clock. Not populated
  yet; it arrives with OCR.
- `src` — `filename` | `hud` | `manual`.
- `title` — optional, hand-written, never generated.

**`src` earns its keep.** The filename coordinate is plausible and permanently
unverifiable — you cannot correlate a perspective screenshot against a tile the
way `find_misnamed_tiles.py` correlates a map one, and that script found five
tile names that were simply wrong. So `metadata/photo_overrides.csv` is the
correction mechanism rather than a convenience, keyed by raw path and carrying
dimension, position, time and title. It lives in git next to `raw_identity.csv`
for the reason `metadata_store.py` already gives: the diff is the audit trail.

**Ten filename coordinates have now been checked against the HUD and all ten
agree** — `216x59z` reads `位置: 216, 56, 59`, `2938x367z` reads
`位置: 2938, 64, 367`, `6670x542z` reads `位置: 6670, 62, 542`, and so on. That is not proof, but it is no longer two
spot-checks.

## Dimension independence

**Both dimensions ship.** 263 overworld photos and 17 nether ones, and the only
thing that distinguishes them in code is the data file they are in.

The rule that keeps it that way: **no code branches on dimension.** The one
legitimate exception is `dimScale()`, which already existed. `setupPhotos.js`
has no dimension test of any kind, and `setupPhotos.test.js` pins overworld,
nether and end rendering to make sure it stays that way.

### Deciding which dimension a photo is in

Not recoverable from a filename, and a defaulted nether photo lands 8× out of
place *silently*. So `suggest_dimension` asserts only the case it can argue — a
world-scale coordinate far outside anything the nether reaches is overworld —
and calls everything else **unknown** rather than guessing. In particular a
small coordinate whose ×8 lands inside the mapped overworld is exactly what a
nether screenshot looks like: `20220929/816x60z.png` becomes (6528, 480), the
main base.

That flagged 27 files, all since resolved by hand into `photo_overrides.csv`:
**17 nether, 10 overworld, 0 left unknown.** How they were settled, and the ×8
review that now draws the test instead of asking somebody to imagine it, are in
`mc-screenshot-to-map/CLAUDE.md`; the per-file evidence is the `note` column of
`photo_overrides.csv`, which is what that file is for.

**An unplaced photo cannot be published.** The publish plan blocks on it, so the
viewer never receives a photo whose dimension nobody could argue for.

## Viewer

- `lib/photos.js` — pure: timeline filtering, clustering, URLs, captions, date
  grouping, terrain-date selection.
- `lib/setupPhotos.js` — the Leaflet layer, the lightbox, the photos pane, and
  the switch for the whole feature.
- `RENDERERS` in `lib/setupLayers.js` gains `{ key: "photos", render: renderPhotos }`
  and nothing else changes there.

### Who switches photos on

**The photos tab, not the layers panel.** The first version made photos an
ordinary layer with an ordinary checkbox, which is what the plumbing wanted —
the layers panel, `visibleLayers` and its hash persistence all came free. But it
is the wrong shape for the visitor: photos are a *mode of looking* at the map
rather than one overlay among the rail lines and the nether gates, and asking
someone to find a checkbox in one tab before the tab named 「スクリーンショット」
does anything is a puzzle, not a control.

So: opening the photos tab puts the pins up, closing it takes them down, and a
checkbox in the tab — 「このタブを閉じても写真を地図に表示し続けます」 — keeps them
up for people who want to browse the map with the photos on.

The plumbing is kept anyway. `setupPhotoPanel`'s `apply` still adds and removes
the same layer ids from `visibleLayers`, so the permalink still carries them and a link to
a photo-covered view still reproduces it; the checkbox is seeded from the
incoming hash on the first `dimviewready` and then applied to every dimension
the visitor moves to. What changed is who holds the switch, not where the state
lives.

Two consequences worth knowing:

- `build-data.mjs` copies each layer file's `kind` into the dimension metadata,
  because the viewer has to tell a photo layer from a marker layer *before*
  fetching either — to leave it out of the layers panel, and out of the nether's
  show-everything default.
- A photo layer therefore has no `check` element. `map.js`'s `visibleLayers`
  restore and `setupLayers.js`'s panel builder both guard on that.

The layers panel's 🔎 "zoom to this layer" button goes away for photos with the
row. Nothing has asked for it back yet; if it is wanted, it belongs in the
photos tab.

### Clustering

**Answered: screen pixels, not world coordinates.** A fixed 84px cell at the
current zoom. World-coordinate cells are stable and cacheable but look wrong at
both ends — a cell that separates two builds when zoomed in merges half the map
when zoomed out. Pixels are what the eye is judging, so one cell size gives one
density at every zoom and clusters break apart on their own as you zoom in.
Clustering therefore depends on zoom but *not* on pan, so panning costs nothing.

**A grid alone was not enough, and this is the thing the first version got
wrong.** Because a pin is anchored on a real photo's position rather than on the
cell centre, two lead photos either side of a cell edge can be a pixel apart. So
the cell bounded the *average* density and nothing at all bounded the overlap,
and the map looked cluttered at exactly the zooms where it should have been
readable.

`clusterPhotos` now sweeps the cells in a fixed order — north to south, then
west to east — and a cell joins a neighbouring cluster whose anchor is nearer
than one cell. That makes `cellSize` a real **minimum separation between
rendered pins**. Only the eight neighbouring cells need checking, because an
anchor two cells away is a full cell width away by construction, so the sweep is
still linear in the number of photos and still independent of pan. An absorbed
cell points at its host rather than at itself, which is what stops a run of near
neighbours walking across the map as a chain of overlapping pairs.

84 is chosen against the ink of a pin: a 56px thumbnail, its 2px border and a
count badge overhanging 6px at each corner is 72px, so 84 leaves a visible gap
instead of letting neighbours kiss.

Measured over the real 263 overworld photos, at cell 84, with the closest pair
of pins measured at each zoom:

| zoom | pins | biggest cluster | closest pins |
|---|---|---|---|
| −3 (min) | 6 | 201 | 131px |
| 0 | 29 | 114 | 101px |
| 4 (default) | 121 | 19 | 85px |
| 5 | 147 | 12 | 85px |
| 7 | 213 | 4 | 86px |

The closest-pins column is the point: under the old pure grid it was 0 by
construction, and pins routinely sat on top of each other.

This was the load-bearing question. The set is severely concentrated — 40% of
the photos sit in one 500-block cell at (6500, 500) and the top three cells hold
54% — so the default view without clustering is a hundred-odd pins stacked on
the main base.

A cluster renders as its **lead** photo's thumbnail with a count badge; a lone
photo renders as a bare thumbnail. One rule gives all three behaviours the
design asked for, with zoom doing the work. The pin is anchored on a real photo's
position rather than the cell centroid, so it sits where somebody stood instead
of in the average of a bay.

**The lead is the newest photo the timeline says exists** — the newest one that
is not dimmed, falling back to the newest outright when the whole cluster is
dim. That qualification is not decoration; see "A cluster the timeline has
split" below.

### The photos pane

Lists every photo in the current viewport, newest first, re-filtered on
`moveend`. Click one and the map flies to it and opens the lightbox. It also
holds the switch for the whole feature — see "Who switches photos on".

**Co-primary with the pins, not secondary.** Given the concentration above, a
cluster of 201 photos cannot be explored by clicking it; the list is the way
through the main base. The pins are for when you already know where you are
looking.

**The two renderings point at each other.** Hovering a row outlines its pin and
lifts it out of the stack with a z-index bump; hovering a pin marks every row it
stands for and scrolls the first into view. Both directions go through one map
event, `photohighlight`, carrying a set of photo stems — so each side fires it
and each side listens, and neither has to know the other exists.

The z-index bump matters more than the outline. Given the concentration, the pin
a row belongs to is often *underneath* a neighbour, and an outline you cannot see
answers nothing.

### The lightbox

Holds the whole cluster, not one photo, so ← → walk it. Escape closes.
"この日付の地図を表示" sets the timeline to the photo's date — the pairing that
is the point of the feature.

**A filmstrip under the caption says how deep the stack is.** Without it a
cluster is a stack of unknown depth and the arrow keys are a guess at how far
there is left to go; with it the current photo is outlined among its siblings and
any of them is one click away. It is built on open rather than on every step,
because a cluster does not change while you walk it and a 201-thumbnail strip is
not free.

The layout is a single column — photo, caption bar, filmstrip — rather than the
bar pinned to the bottom of the screen as it was. The bar describes the photo
above it, so a gap between the two reads as though it belongs to neither.

It opens on the photo the pin was showing (`cluster.leadIndex`), not on
whatever sorted first, so clicking a pin gives you the image you clicked.

**「リンクをコピー」 links to the photo itself.** A screenshot is the most
pointed-at thing on the map — "look at this one" — and until this button the
only shareable state was a viewport, which does not survive a cluster of a
hundred. The link carries the photo's stem in a top-level `ph` hash key, the
photo's *own* coordinates rather than the map centre (so closing the lightbox
leaves the recipient looking at the pin), and the timeline verbatim — the photo
is on screen under exactly those settings, which is how it came to be in the
lightbox, so repeating them puts it back with its terrain.

`ph` is an arrival instruction, not state: `setupPhotoPanel` consumes it on the
first `dimviewready`, after `apply` has drawn the pins, and a dimension switch
afterwards does not reopen it. Carrying it also *implies* the photo layer — it
ticks the persist checkbox — so a link works whether or not the sender was
browsing with the pins up. It resolves to a pin rather than to a lone image,
via `find` on the layer's current pins, because showing the photo alone would
hide that it sits in a stack.

The confirmation is the button's own label rather than a toast: the caption bar
has no room for a status line, and a toast over the photo covers the thing being
looked at.

## Timeline behaviour

**Photos obey the timeline's existing exact/before/fill semantics**, and
`selectPhotos` is written to mean the same three things `selectTileDate` means:

- **exact** → only photos taken on the selected date
- **before** → every photo up to and including it
- **fill** → photos from any date, dimmed if they postdate the selection

Scrubbing backward empties the map of photos that had not been taken yet. No
new control, no new mental model.

**Two dates, not one.** `timeline.date` chooses the terrain and
`timeline.photoDate` chooses which photos exist. They are equal for every
ordinary selection and differ only for a photo-only row, which has no tiles of
its own to select: that row sets `photoDate` to itself and drops `date` to the
nearest earlier tile date, which is what "what did this place look like when
the photo was taken" means. Both ride the permalink hash (`h.p`).

`groupSummaryHtml` renders `(🗓3) (▶4) (📷12)` per year/month group, **and each
tile date's own row now carries its `(📷n)` too**, from the same function. Before
that, the only rows advertising photos were the 19 photo-only ones, which reads
exactly backwards — as though a day somebody spent mapping never has
screenshots, when in fact 218 of the 263 photos fall on dates that already have a
tile row. Only the extra *row* was ever suppressed there, never the photos.

### A cluster the timeline has split

In fill mode a cluster can hold photos from before and after the selected date,
and the first version got this visibly wrong. It dimmed a cluster only when
*every* photo in it was dim, and it led with the newest photo outright — so a
mixed cluster rendered a future photo at full brightness, and a photo the
timeline had decided was not taken yet looked exactly like one that was. Clicking
a date faded the lone future pins and left the grouped ones bright.

Two changes, both in `clusterPhotos`:

- **The lead is the newest photo that is not dimmed**, falling back to the newest
  outright only when the whole cluster is dim. The image on a bright pin is
  therefore always a photo you have scrubbed far enough forward to have taken.
  A cluster is dim exactly when its lead is, which for the all-dim case is the
  old behaviour unchanged.
- **The badge writes the split out** as `3+2`: three photos that exist, two that
  do not yet, the tail in a lighter weight. Folding them into one `5` is what
  made a bright pin able to be mostly future. A cluster with no split reads as a
  plain count, which is the common case — `before` mode dims nothing at all.

A cluster still holds all of its photos and the lightbox still walks all of
them: the timeline's judgement is about what to *show*, not about what to hide.

## Photo review in the web app

**Phase 3 — built, in `mc-screenshot-to-map`.** Photos joined the existing tile
review app rather than growing a second review surface, and reuse its decision
states (`approved` / `hold` / `rejected` / undecided), its digest rule and its
plan-then-confirm deploy.

What matters from this side of the fence is what the viewer can now rely on:

- **Nothing reaches `photos.json` unreviewed.** The layer file is rewritten from
  the set a person has approved, so a photo on the map has been looked at.
- **A published photo is not withdrawn by a later rejection.** Taking one down
  is a separate, deliberate act; the plan warns rather than doing it silently.
- **`photos.json` is rewritten, never merged**, because a photo is only on the
  map if the layer lists it — unlike a tile, which the site build discovers by
  globbing filenames.
- **Placement is inside the decision digest**, not just the pixels. The same
  image at a nether coordinate instead of an overworld one is a different thing
  on the map, so correcting a dimension invalidates the approval.

The three views it puts in front of a person — the crop, the compression
difference against the encoder's own input, and the deployed map drawn around
the coordinate at both scales — are described in
`mc-screenshot-to-map/CLAUDE.md` under "Photo review", with the commands in its
`README.md` and the remaining UI backlog in its `PLAN_DEPLOY.md` §10.

**A position review still has to be built, and it is Phase 4 work.** An OCR'd
coordinate is a claim about where a screenshot was taken with nothing to check
it against, so the review is "does this photo look like it belongs at this spot
on the map". The map-excerpt machinery already exists; what is missing is the
photo beside it and a coordinate that came from the HUD rather than the
filename.

## Rejected

**Deep-linking a photo into the VOD at the moment it was taken.** The taskbar
clock plus a stream start time would give a seconds offset, which is exactly the
`t` field `vodUrl()` already renders. It does not work: the majority of the VODs
are re-uploads of Twitch archives, so the YouTube timestamps describe the
re-upload, not the stream. Revisit only if a source of true stream start times
turns up.

## Phases

- **Phase 0 — survey.** *Done.* `--survey` and `--crop-survey` are the standing
  version of it.
- **Phase 1 — extraction, world-coord only.** *Done.* 280 photos, no OCR.
- **Phase 2 — viewer v1.** *Done, plus one review pass.* Layer, clustering,
  lightbox, pane, timeline filtering, per-date and per-month counts. The review
  pass moved the switch into the photos tab, gave clustering a real minimum
  separation, linked pin and row by hover, put a filmstrip in the lightbox and
  stopped a split cluster misreporting itself. Each is written up in its own
  section above.
- **Phase 2.5 — nether and end photos.** *Done for the nether* (17 photos), and
  it was a data change and nothing else, as intended. No end photos exist yet;
  the id (202) is reserved and the code path is the same one.
- **Phase 3 — photo review in the web app.** *Done*, in `mc-screenshot-to-map`.
  First pass through it: 265 approved, 15 held, 265 published. This and OCR were
  the other way round in the original plan; they were swapped deliberately,
  because OCR is what produces review work at volume and building the reviewer
  second means hand-editing a CSV against 214 rows.
- **Phase 4 — OCR.** HUD coordinates and the taskbar clock, bringing in the 214
  descriptively-named screenshots and giving the existing 280 a wall-clock time
  and a real `y`. Crop the clock *after* reading it. **Almost entirely
  `mc-screenshot-to-map` work**: `photoCaption` already renders `time` and
  already drops `y` when it is null, so populating either needs no viewer
  change. What does land here is the open question below — what to do with the
  photos OCR dates but cannot place.

## Open questions

- **How many `-N` session variants matter?** Still open. The timeline is
  folder-date granular and the wall-clock time is not yet extracted, so photos
  within a day have no sort key beyond their filename.
- **Should an unpositioned photo appear at all?** Still open, and OCR makes
  it concrete: OCR will place some of the 214 and leave the rest dated but
  unplaced. A timeline-only row is the obvious answer, but it may be a large
  and uninteresting pile.
- **Do the non-`c` variants hold distinct shots?** Still unopened. There are 11
  of them (`a`, `b`, `1`, `2`, `-0`, `-1`), and they are currently all kept as
  separate photos, which is the safe direction to be wrong in.
- ~~Clustering: world coordinates or screen pixels?~~ Answered above.
- ~~Are the filename coordinates right?~~ Ten of ten agree with the HUD.
