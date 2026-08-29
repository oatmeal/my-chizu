# Screenshot photo layer — design doc

Status: **Phases 0–2.5 are built, and viewer v1 has had its first review
pass.** The extraction pipeline, the encoded photo set, the layer, the
clustering, the lightbox, the photos pane and the timeline interaction all exist
and are covered by tests. What remains is Phase 3 (photo review in the
`mc-screenshot-to-map` web app) and Phase 4 (OCR, to bring in the screenshots
whose filenames carry no coordinate). Nothing is committed to `llmr` yet — see
"Previewing before you commit".

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

Two repos are involved:

- `mc-screenshot-to-map` — extraction: classify raw files, read coordinates and
  timestamps, crop and encode. Everything here is derived and reproducible.
  - `screenshots.py` — classification, chrome detection, photo records, encoding
  - `scripts/build_photos.py` — the entry point that writes into `llmr`
  - `metadata/photo_overrides.csv` — the hand corrections
  - `tests/test_screenshots.py` — 54 tests
- `my-chizu` (this repo) — the viewer: the photo layer, its timeline behaviour,
  and the lightbox. Engine-generic; `llmr` supplies the data.
  - `lib/photos.js` — pure logic, 37 tests
  - `lib/setupPhotos.js` — layer, lightbox, pane, 47 tests
  - photo coverage in `test/init-integration.test.js` — 15 tests

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

Two corrections to the first pass of these numbers, both of which moved photos
*out* of the set and are the reason to run the classifier rather than a glob:

- `raw_identity.csv` already claims 182 oddly-named loose files as map tiles —
  `20211012/IMG_0400.PNG` looks like a phone photo and is a zoom-4 map
  screenshot. Content matching outranks any name rule, so it is checked first.
- A filename coordinate under `TILE_COORD_MAX` (200) is a tile index, not a
  player position. 45 loose files are tiles by that rule.

**297 world-coord photos become 280.** 17 files carry a `c` suffix and are
hand-cropped duplicates — `6956x744zc.png` is 1919×1005 against its sibling's
1920×1080, someone having de-chromed it by hand and slightly wrong. The
uncropped original wins and the pipeline crops it consistently. The other
variants (`za`, `zb`, `z-1`, `z2`) are genuinely different shots from one spot
and stay.

### Dates

**372 tile dates against 120 photo dates, overlapping on 101.** Only **19 photo
dates have no tiles at all**, carrying 45 photos between them.

This is the one place the original design was substantially wrong. It predicted
"198 of 217 dates have no map tiles" against "a current timeline of 76 tile
dates" — but that counted every raw folder including the chat-only and
descriptively-named ones, and the map has since grown to 372 dates. The
world-coord photos come from sessions where somebody was actively mapping, so
they land on tile dates far more often than the whole raw set would.

The photo-only row type is still needed and still built; it is just 19 rows
rather than the majority of the timeline.

## Window chrome and the crop

Screenshots are 1920×1080 desktop captures with Windows chrome, from **two
machine generations**, which the original design did not know about:

| | title bar | taskbar | files |
|---|---|---|---|
| Windows 10 | 32px, `#000000` | 40px, `#2D2D2D` | 237 |
| Windows 11 | 23px, translucent | 47px, translucent | 26 |

The heights are bimodal with nothing between the modes, which is what makes an
exact-height rule safe.

**The Windows 11 bars have no colour of their own.** They are translucent and
take their tint from whatever the game is drawing behind them — the same
taskbar measures 33 over a nether tunnel, 41 over a desert and 44 over an
ocean. A fixed-colour test finds none of them.

**And the Windows 10 taskbar is not flat either.** It means `#2D2D2D`, but
renders with a faint acrylic noise: its pixels run 36–61 over a span whose mean
sits at 44.2–44.3 with σ 4.4–4.5. A per-pixel tolerance can never match it.

So both bars are found the same way, by the one property both actually have:
**a bar is a flat horizontal band whose rows share one colour, ending at a row
that does not.** Concretely, in `detect_chrome`:

- Compare each row's mean colour, per channel, across a span clear of the bar's
  own contents — the window title and buttons, the taskbar icons and clock.
  The buttons reach further in than they look: a span ending at x=1700 clipped
  them on six files and cost those files their crop.
- Judge flatness against the band's **median** row, not its first, so an
  overlay cannot disqualify a real bar. A notification toast sat over one
  taskbar and a strict all-rows test threw the whole thing away.
- Accept only the four real heights above. Anything else crops nothing and is
  flagged.
- The Windows 10 title bar keeps a dedicated pure-black test as well, because
  it is the one case where the row *below* the bar may legitimately be dark —
  a cave ceiling — and the general test would read that as more bar.

**This is what stops the overshoot the original design warned about.** A night
or cave screenshot has a genuinely black sky, and a greedy "consume leading
black rows" scan ate 82, 99, 125 and 214 rows of game content. Four files here
have leading black runs of 41, 60, 67 and 70 rows; none of those is a real
height, so none of them is cropped.

Result: **272 of 280 cropped, 7 flagged, 1 left whole deliberately.** Six of
the seven flagged are files somebody had already hand-cropped years ago. The
deliberate one is `20230920/6955x819z.png`, where the game content directly
under the title bar is itself pure black, so the ambiguity guard fires — the
conservative outcome the rule exists to produce.

**Order still matters: OCR the taskbar clock before cropping it away.** The
clock is legible in both generations and is the only source of wall-clock time.
Roughly 40 files have no taskbar at all and have nothing beyond their folder
date.

## Storage

The encoded set is **35 MB** — 32.1 MB of full images at 1600px q80 and 2.9 MB
of 400px q72 thumbnails, mean 115 KB per photo. `llmr/deploy` goes from 223 MB
to 269 MB, about a quarter of the GitHub Pages 1 GB cap. The full raw PNGs for
these 280 files are just over 400 MB.

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

**Nothing has to be committed to see the real thing.** `build_photos.py --write`
puts the WebP pairs and the layer JSONs into the `llmr` working tree, and the
`my-chizu` build copies them into `llmr/deploy/`, which is gitignored. So the
whole feature can be run, looked at and thrown away without touching git:

```bash
# 1. encode into the llmr working tree (writes ~35 MB, commits nothing)
cd mc-screenshot-to-map && uv run python scripts/build_photos.py --write

# 2. build the site
cd ../my-chizu && node build.mjs ../llmr

# 3. serve it
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

To undo it entirely: `git clean -nd` in `llmr` to see the untracked photo files,
then `git clean -fd` once the list looks right.

### Then committing

`llmr/.git` is 185 MB, and it is that small only because the tiles were written
once. Each re-encode of the photo set adds another ~35 MB of blobs permanently.
**Settle the encoding before the first commit** — revision three is what hurts,
not the import. A 30-file sample at the candidate settings is one command:

```
uv run python scripts/build_photos.py --sample 30   # → scratch/photo_sample/
```

The current setting is WebP, long edge 1600, q80, plus a 400px q72 thumbnail.
Minecraft's flat-shaded art is close to a best case for WebP.

Note that `mc-screenshot-to-map/scratch/` is untracked but **not** gitignored,
and a sample run leaves tens of MB in it. Ignore it before someone commits it
by accident.

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
place *silently*. So `suggest_dimension` asserts only the case it can argue:

- A world-scale coordinate, far outside anything the nether reaches → overworld.
- A small coordinate whose ×8 lands inside the mapped overworld → **unknown**.
  This is the inverse of the nether scale, and it is exactly what a nether
  screenshot looks like: `20220929/816x60z.png` becomes (6528, 480), the main
  base.
- Any other small coordinate → **unknown**.

That flagged 27 files. All 27 were opened and resolved by hand into
`photo_overrides.csv`: **17 nether, 10 overworld, 0 left unknown.** What settled
them:

- Netherrack, basalt, soul sand valley fog and lava seas are unmistakable.
- **Y is decisive in one direction.** `20220521/578x-96z.png` reads
  `位置: 578, -2, -96`, and Y=−2 is below the nether's bedrock floor, so that
  one is an overworld deep cave however dark it looks.
- **Corridors give each other away.** Several files share Z=59 across four
  years — `-523x59z`, `216x59z`, `484x59z` — which is one nether highway. A
  sandstone-lined stretch of it looks nothing like netherrack on its own.
- **Sessions give each other away.** `20240616/1521x66z.png` is a stone-brick
  tunnel with a camel in it and could be anywhere; `1909x67z.png` from the same
  session shows the same tunnel with a netherrack ceiling and the same camels.

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

**Phase 3.** `mc-screenshot-to-map` already has a review UI for map tiles —
FastAPI + Jinja2 at `web/app.py`, with a queue, a per-date page, a per-tile
page and a deploy page. Photos should join it rather than grow a second review
surface, because the two need the same things: look at a derived artefact
beside its source, record a human judgement, and never let that judgement
outlive the pixels it was made about.

Today the photo pipeline has no review step at all. Its human decisions live in
`metadata/photo_overrides.csv`, hand-edited, which was the right call for 27
dimension corrections and will not survive the OCR phase.

### What it should reuse

- **`metadata_store.py` decision states.** `approved` / `hold` / `rejected` /
  undecided carry over unchanged. A photo on `hold` means looked at, known
  imperfect, no better version — an uncropped screenshot whose chrome the rules
  refused to guess at is exactly that, and it should still ship.
- **The digest rule.** Every tile decision records the digest of the tile it was
  made about, so a re-extraction that changes the pixels drops it back into the
  queue instead of inheriting an approval made about a different image. Photos
  need this *more* than tiles do, because the encoder settings are still in
  play: a re-encode at a different quality must not silently keep its approvals.
- **The deploy page's shape.** `/deploy` shows new / replace / identical, blocks
  on problems, and commits nothing. The photo import wants precisely that, and
  it is where the "settle the encoding before the first commit" discipline
  should be enforced rather than remembered.
- **The compare widget** (`web/static/compare.js`), for the one comparison that
  matters here: the raw PNG against the encoded WebP, to judge the quality
  setting on real content instead of on a file listing.

### What is new

- **A crop review.** The 7 files `detect_chrome` flags, and any future flag, laid
  out with the detected band drawn on the image. The decision is usually "the
  rule was right to refuse", which is an `approve`, not a fix.
- **A dimension review.** The one that cannot be automated and the one that goes
  silently wrong. It wants the photo, its coordinate, its ×8 coordinate, and
  what is at both places on the map — the ×8 test is what identified the nether
  photos, and showing it is more useful than asking someone to imagine it.
- **A position review, once OCR lands.** An OCR'd coordinate is a claim
  about where a screenshot was taken and there is nothing to check it against,
  so the review is "does this photo look like it belongs at this spot on the
  map" — the photo beside the deployed tile for its coordinate and date.
- **Writing back to `photo_overrides.csv`** rather than to a new store, so the
  hand corrections stay one reviewable file in git and the diff stays the audit
  trail.

### The ordering argument

Build this **before** OCR, not after. OCR is what will produce review work
at volume — 214 files with machine-read coordinates, each unverifiable — and
building the reviewer first means that output has somewhere to land the day it
exists. Doing it the other way round means hand-editing a CSV against 214 rows.

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
- **Phase 3 — photo review in the web app.** See "Photo review in the web app"
  above. This and OCR were the other way round in the original plan; they are
  swapped deliberately, because OCR is what produces review work at volume and
  building the reviewer second means hand-editing a CSV against 214 rows.
- **Phase 4 — OCR.** HUD coordinates and the taskbar clock, bringing in the 214
  descriptively-named screenshots and giving the existing 280 a wall-clock time.
  Crop the clock *after* reading it.

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
