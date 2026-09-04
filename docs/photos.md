# The photo layer

Non-map screenshots shown as located, dated photos on the map — Google Maps'
photo pins — interacting with the existing timeline so that scrubbing time
changes which photos exist, not just which tiles render.

This is the **viewer's half**. Two repos are involved and the split is clean:

- **`my-chizu`** (this repo) — the layer, its clustering, its timeline behaviour,
  the pane and the lightbox. Engine-generic; a data repo supplies the photos.
  `lib/photos.js` is the pure logic, `lib/setupPhotos.js` the layer, lightbox and
  pane, with coverage in `lib/setupPhotos.test.js` and `test/init-integration.test.js`.
- **`mc-screenshot-to-map`** — extraction and review: classify the raw files,
  read coordinates and timestamps, crop, encode, record what a person decided,
  and publish. Documented **there**, in its `docs/photos.md`.

What lives here is the **data contract** between them and everything downstream
of it. The `photos.json` schema itself is in
[`data-repo.md`](data-repo.md#a-photo-layer). Where a section below touches
extraction it is a summary with a pointer, not the record.

Where the set currently stands — how many photos, reviewed and published — is in
[`../STATUS.md`](../STATUS.md). What is left to build is
[`plans/photos-ocr.md`](plans/photos-ocr.md).

## Chat logs are never published

Not on the map, not as a timeline row, not as a count. The extractor's classifier
keeps a `chat` category **because that is how those files are kept out** — the
category is the exclusion, and it must stay.

The rule is narrower than its first wording suggested, and the narrower reading
is the right one: it is about a screenshot that is **nothing but a chat log**.
**Chat visible incidentally behind a photograph of a place is fine**, and is not
a reason to hold the photo. That distinction is what the `chat*.png` filename
rule was always drawing.

## The source data

Measured over `../raw` by `build_photos.py --survey`, 2026-08. 5,760 images:

| Category | n | How it is decided |
|---|---|---|
| `tile` | 4,835 | nested under a dimension folder, claimed by `raw_identity.csv`, or named for a tile index |
| `chat` | 414 | `chat*.png` — classified only so they are excluded; never published |
| `photo` | 297 | loose, named for a world coordinate |
| `unknown` | 214 | loose, named descriptively — waiting on OCR |

**297 world-coord photos become 280**, after dropping the `c`-suffix files as
hand-cropped duplicates of their siblings. Two name rules move files *out* of the
photo set and are why the classifier is run rather than a glob:
`raw_identity.csv` claims 182 oddly-named loose files that content matching has
already proved are map tiles, and a filename coordinate under `TILE_COORD_MAX` is
a tile index rather than a player position. The rules and their evidence are in
`screenshots.py`; re-derive the counts with `build_photos.py --survey`.

### Dates

**372 tile dates against 120 photo dates, overlapping on 101.** Only **19 photo
dates have no tiles at all**, carrying 45 photos between them.

The original design predicted the photo-only row would be most of the timeline;
at this survey it was a couple of dozen. World-coord photos come from sessions
where somebody was actively mapping, so they land on tile dates far more often
than the whole raw set would. The row type is still needed and still built — it
was just rare, and that is what makes each tile date's own `(📷n)` count the
load-bearing part rather than the extra row.

Photos from Discord changed that: they are not mapping-session screenshots and
land on tile dates much less often, so the photo-only row is now several times
commoner than this section found it. See
[`contributors.md`](contributors.md#the-timeline-gains-a-good-many-photo-only-dates).

## What the viewer is handed

*Extraction. Detail and constants: `screenshots.detect_chrome` in the tool repo.*

The screenshots are 1920×1080 desktop captures from two machine generations, so
they carry a Windows title bar and taskbar that have to come off. Two properties
of that decide what reaches this side:

- **Neither bar can be found by colour**, so both are found as a flat horizontal
  band whose rows share one colour, ending at a row that does not.
- **The rule refuses rather than guesses.** A band that is bar-shaped but not a
  real height crops nothing and is flagged, because the failure it avoids is
  severe: a night or cave screenshot has a genuinely black sky, and a greedy
  "consume leading black rows" scan ate 82, 99, 125 and 214 rows of game content.

Result: 272 of 280 cropped, 7 flagged, 1 left whole deliberately. **So the photo
set is not uniform in aspect ratio** — most images are 1920×1008 before scaling,
and eight keep their chrome.

**Nothing in the viewer may assume a common shape, and nothing does**: the pin is
a fixed 56px box with `object-fit: cover`, and the lightbox is
`max-width`/`max-height` with `object-fit: contain`.

## Where the position comes from

`src` on each photo records it — `filename`, `hud` or `manual` — and it earns its
keep. A filename coordinate is plausible and permanently unverifiable: you cannot
correlate a perspective screenshot against a tile the way `find_misnamed_tiles.py`
correlates a map one, and that script found five tile names that were simply
wrong. So `metadata/photo_overrides.csv` in the tool repo is a correction
*mechanism* rather than a convenience, keyed by raw path and carrying dimension,
position, time and title.

**Ten filename coordinates have been checked against the HUD and all ten agree** —
`216x59z` reads `位置: 216, 56, 59`, `2938x367z` reads `位置: 2938, 64, 367`,
`6670x542z` reads `位置: 6670, 62, 542`, and so on. Not proof, but no longer two
spot-checks.

### Which dimension a photo is in

Not recoverable from a filename, and a defaulted nether photo lands 8× out of
place *silently*. So `suggest_dimension` asserts only the case it can argue — a
world-scale coordinate far outside anything the nether reaches is overworld — and
calls everything else **unknown** rather than guessing. A small coordinate whose
×8 lands inside the mapped overworld is exactly what a nether screenshot looks
like: `20220929/816x60z.png` becomes (6528, 480), the main base.

**An unplaced photo cannot be published.** The publish plan blocks on it, so the
viewer never receives a photo whose dimension nobody could argue for.

Both dimensions ship, and the only thing distinguishing them in code is the data
file the photo is in — see "no code branches on dimension" in
[`viewer.md`](viewer.md#coordinates). `setupPhotos.test.js` pins overworld,
nether and end rendering to keep it that way.

## Storage

The encoded set is **35 MB** — 32.1 MB of full images at 1600px q80 and 2.9 MB of
400px q72 thumbnails, mean 115 KB each. That takes `llmr/deploy` from 223 MB to
269 MB, about a quarter of the GitHub Pages 1 GB cap.

**Decision: one repo, no split.** At this rate it is a decade of headroom, and a
second repo costs two deploys to keep in sync. Bandwidth is not a concern either:
thumbnails are lazy-loaded, so a session pulls a few hundred KB.

**The escape hatch is built.** `site.json`'s `photos.baseUrl` / `thumbUrl` are
relative by default; pointing them at another origin is a config edit and a file
move, with no code change and no data migration. A plain `<img>` loads
cross-origin without CORS.

**Raw PNGs never enter the data repo.** `../raw` is untracked by `llmr` and stays
that way; the deploy artifact is the derived WebP.

### The encoding is settled — do not revisit it casually

`llmr/.git` is 185 MB, and it is that small only because the tiles were written
once. **Each re-encode of the photo set adds another ~35 MB of blobs
permanently**, and it invalidates every approval, because a decision's digest
covers the encoded bytes. Revision three is what hurts, not the import.

The current setting is WebP, long edge 1600, q80, plus a 400px q72 thumbnail;
Minecraft's flat-shaded art is close to a best case for WebP.

### Previewing before you commit

**Nothing has to be committed to see the real thing.** The extractor builds into a
tree of its own, the publish step copies into `llmr`'s working tree, and the site
build copies from there into the gitignored `llmr/deploy/`. So the whole feature
can be run, looked at and thrown away without touching git:

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
the pins on. Worth walking through, because each step exercises a different part
of the design:

- **Zoom out to the whole map, then in.** The cluster counts should fall apart
  into individual thumbnails. This is the clustering decision.
- **Open a cluster over the main base** and arrow through it. This is the
  190-photo stack the pins alone cannot handle.
- **Press 「この日付の地図を表示」** in the lightbox and watch the terrain change
  under the pin. This pairing is the point of the feature.
- **Scrub the timeline backward.** Photos should disappear as you pass the dates
  they were taken on, and the 📷 counts sit both in the month headings and on each
  date's own row.
- **Switch to the nether.** Positioned by the same code.
- **Pan with the photos tab open**; the list re-filters to the viewport.
- **Hover a row, then hover a pin.** Each should mark the other, and a row hover
  should also put that row's photo on its pin until the cursor leaves.
- **Look at the author accent at real density.** Zoom out until the main base is
  one pin: its badge should be a wheel in the proportion the stack actually
  holds. Zoom in and watch the wheel break apart into flat colours as the
  cluster does, and the lone photos show their dots. This is the part that was
  never going to be settled by a test — whether three colours read at 56px over
  Minecraft terrain, beside a white border and a yellow hover.
- **Toggle the author chips.** The pins should go with the list, the counts
  should not move as you scrub or pan, and turning the last one off should say
  「絞り込み中の」 rather than looking like an empty place.
- **Walk a filmstrip through photos of different sizes.** The Discord source is
  not one shape; the frame resizes between them. Whether that is worth fixing is
  in [`plans/backlog.md`](plans/backlog.md).
- **Scroll the timeline.** 57 of the overworld's rows are now photo-only, up
  from 19. Read it and say whether the `(📷n)` counts still do their job.
- **Tick 「このタブを閉じても写真を地図に表示し続けます」** and close the tab; the
  pins stay, and the permalink then reproduces them.
- **Press 「リンクをコピー」 in the lightbox** and open the copied URL in a fresh
  tab: the same photo should reopen, in its pin, over the same terrain.

To undo it entirely: `git clean -nd` in `llmr` to see the untracked photo files,
then `git clean -fd` once the list looks right. The build tree is outside every
repo and can simply be deleted.

## Who switches photos on

**The photos tab, not the layers panel.** The first version made photos an
ordinary layer with an ordinary checkbox, which is what the plumbing wanted — the
layers panel, `visibleLayers` and its hash persistence all came free. But it is
the wrong shape for the visitor: photos are a *mode of looking* at the map rather
than one overlay among the rail lines and the nether gates, and asking someone to
find a checkbox in one tab before the tab named 「写真」 does anything is a puzzle,
not a control.

So: opening the photos tab puts the pins up, closing it takes them down, and a
checkbox in the tab — 「このタブを閉じても写真を地図に表示し続けます」 — keeps them up
for people who want to browse the map with the photos on.

The plumbing is kept anyway. `setupPhotoPanel`'s `apply` still adds and removes
the same layer ids from `visibleLayers`, so the permalink still carries them and a
link to a photo-covered view still reproduces it; the checkbox is seeded from the
incoming hash on the first `dimviewready` and then applied to every dimension the
visitor moves to. What changed is who holds the switch, not where the state lives.

Two consequences worth knowing:

- `build-data.mjs` copies each layer file's `kind` into the dimension metadata,
  because the viewer has to tell a photo layer from a marker layer *before*
  fetching either — to leave it out of the layers panel, and out of the nether's
  show-everything default.
- **A photo layer therefore has no `check` element.** `map.js`'s `visibleLayers`
  restore and `setupLayers.js`'s panel builder both guard on that.

The layers panel's 🔎 「レイヤー全体が表示されるようにズームする」 button went away for
photos along with the row. Nothing has asked for it back; if it is wanted, it
belongs in the photos tab.

## Clustering

**Screen pixels, not world coordinates.** A fixed 84px cell at the current zoom.
World-coordinate cells are stable and cacheable but look wrong at both ends — a
cell that separates two builds when zoomed in merges half the map when zoomed
out. Pixels are what the eye is judging, so one cell size gives one density at
every zoom and clusters break apart on their own as you zoom in. Clustering
therefore depends on zoom but *not* on pan, so panning costs nothing.

**A grid alone was not enough, and this is the thing the first version got
wrong.** Because a pin is anchored on a real photo's position rather than on the
cell centre, two lead photos either side of a cell edge can be a pixel apart. So
the cell bounded the *average* density and nothing at all bounded the overlap, and
the map looked cluttered at exactly the zooms where it should have been readable.

**The pin is 56×56 because a stylesheet fight was won, not because CSS said so.**
Leaflet ships `.leaflet-container .leaflet-marker-pane img { width: auto }`, which
is two classes deep and outranks a plain `.photo-pin img`. So for as long as the
pin's rule was one class deep the width was silently dropped: the pin took the
height and then whatever width the thumbnail's aspect asked for — around 100×56
for a 16:9 screenshot and a different width for each of the set's 43 aspect
ratios — `object-fit: cover` cropped nothing, the pin hung to the right of the
place it marks because `iconAnchor` still said 28, and the separation this
section guarantees was guaranteed against 56px of ink that was really 100. Any
rule that has to beat Leaflet's own needs its specificity, so
`.leaflet-marker-icon.photo-pin img` sets the size and `box-sizing: border-box`
keeps the border inside `iconSize`.

**That override carries only the three properties Leaflet contests, and this is
not tidiness.** Restating the whole pin at two classes deep also outranks the
state rules — `.photo-pin:hover img` and `.photo-pin-highlight img` are one
class deep, written to beat a one-class base — and the first version of the fix
did exactly that, taking the pane's highlight ring off the map. A rule written
to win a specificity fight should be no wider than the fight.

`clusterPhotos` sweeps the cells in a fixed order — north to south, then west to
east — and a cell joins a neighbouring cluster whose anchor is nearer than one
cell. That makes `cellSize` a real **minimum separation between rendered pins**.
Only the eight neighbouring cells need checking, because an anchor two cells away
is a full cell width away by construction, so the sweep is still linear in the
number of photos and still independent of pan. An absorbed cell points at its host
rather than at itself, which is what stops a run of near neighbours walking across
the map as a chain of overlapping pairs.

84 is chosen against the ink of a pin: a 56px thumbnail, its 2px border and a
count badge overhanging 6px at each corner is 72px, so 84 leaves a visible gap
instead of letting neighbours kiss.

Measured over the real 263 overworld photos, at cell 84, with the closest pair of
pins measured at each zoom:

| zoom | pins | biggest cluster | closest pins |
|---|---|---|---|
| −3 (min) | 6 | 201 | 131px |
| 0 | 29 | 114 | 101px |
| 4 (default) | 121 | 19 | 85px |
| 5 | 147 | 12 | 85px |
| 7 | 213 | 4 | 86px |

The closest-pins column is the point: under the old pure grid it was 0 by
construction, and pins routinely sat on top of each other.

This was the load-bearing question. The set is severely concentrated — 40% of the
photos sit in one 500-block cell at (6500, 500) and the top three cells hold 54%
— so the default view without clustering is a hundred-odd pins stacked on the
main base.

A cluster renders as its **lead** photo's thumbnail with a count badge; a lone
photo renders as a bare thumbnail. One rule gives all three behaviours the design
asked for, with zoom doing the work. The pin is anchored on a real photo's
position rather than the cell centroid, so it sits where somebody stood instead of
in the average of a bay.

**The lead is the newest photo the timeline says exists** — the newest one that is
not dimmed, falling back to the newest outright when the whole cluster is dim.
That qualification is not decoration; see "A cluster the timeline has split".

## The photos pane

Lists every photo in the current viewport, newest first, re-filtered on `moveend`.
Click one and the map flies to it and opens the lightbox. It also holds the switch
for the whole feature.

**Co-primary with the pins, not secondary.** Given the concentration above, a
cluster of 201 photos cannot be explored by clicking it; the list is the way
through the main base. The pins are for when you already know where you are
looking.

**The two renderings point at each other.** Hovering a row outlines its pin and
lifts it out of the stack with a z-index bump; hovering a pin marks every row it
stands for and scrolls the first into view. Both directions go through one map
event, **`photohighlight`**, carrying a set of photo stems — so each side fires it
and each side listens, and neither has to know the other exists.

The z-index bump matters more than the outline. Given the concentration, the pin a
row belongs to is often *underneath* a neighbour, and an outline you cannot see
answers nothing.

**And the pin wears the row you are pointing at.** A row hover names its single
stem alongside the set, and the pin swaps its thumbnail to that photo until the
cursor leaves. Without it the link is only half made: a pin wears its lead photo,
and in a 201-deep cluster that is almost never the row under the cursor, so the
outline said *which stack* and left the visitor to guess which of the 201 images
it stood for. Only photos listed in the pane can be named this way and the pane is
already showing their thumbnails, so the swap is a cache hit.

## Who took it

The set is no longer one person's. `photos.json` carries a `by` on every entry
and an `authors` registry naming the ids it uses; the schema and the rules a
data repo has to keep are in
[`data-repo.md`](data-repo.md#a-photo-layer). Where they are absent the viewer
is exactly what it was, which is what makes any of this safe to have in a
generic engine.

**The credit is written out in the lightbox and under the pane row.** 「撮影:
名前」, before the date, on **every** photo including the data repo owner's own.
Naming other people only when it is not the owner's photo is a map that quietly
claims the rest.

### The accent is the count badge

Each author gets a colour, and it appears in three places that have to agree:
the rim of a pin's count badge, a bar under a pane row's thumbnail, and the dot
on that author's filter chip. So the chips are the legend as well as the
control.

**It was a bar along the foot of the pin first, and the bar was wrong twice
over.** It was wrong by accident, because Leaflet's own `width: auto` for marker
images had beaten the pin's width for as long as the pin existed and the bar was
covering 47% of a photo that was nearly twice the width it was written as — the
account of that is under [Clustering](#clustering). And it was wrong on purpose:
even at full width, 4px along one edge is legible only once you have decided to
look at a particular pin, while the count badge is the thing the eye finds
first. Nine treatments were drawn at real size on real tiles before this was
settled; the badge won on the plainest ground, which is that it is where people
already look.

Five things about it were decided rather than fallen into:

- **The colour is on the rim, over a near-black core.** The numeral has to stay
  readable over whichever hues a cluster holds, and white on a light accent is
  thin — `#43c59e` was the case that decided it. A rim also leaves the wheel
  intact, so the badge can be a proportion and a number at once. It is
  `linear-gradient(…) padding-box, var(--author-fill) border-box`: a gradient
  border with a solid core, drawn with the box the badge already had.
- **A lone photo gets a plain dot in the badge's place.** Four in five pins hold
  one photographer and most of those hold one photo, so a scheme that only
  spoke on stacks would say nothing on most of the map. The dot is the one job
  the bar did that the count cannot.
- **Split in proportion, which is what makes it survive clustering.** A pin
  standing for eleven photos by two people is a wheel in the ratio it actually
  holds. This was the open question — what a per-author colour does when photos
  by different people merge — and the answer is that it never has to pick a
  winner. The wedges run in the pane's chip order — `authorOrder` where the site
  states one, author id where it does not — and never by count, and they start
  at twelve o'clock, so a person's wedge begins in the same place on every pin
  and the chips are the legend for it.
- **It counts only the photos the timeline says exist.** The pin already
  refuses to wear a future photo and already splits its count as `3+2`; a wheel
  drawn over the whole stack would be the last part of the pin still claiming a
  future photo is there. A wholly future cluster falls back to all of them,
  because a wheel of nothing is not an improvement on one dimmed with its pin.
  The badge itself does not dim, because it is the element that *explains* the
  dimming; the lone photo's dot does, because it describes that one photo.
- **Red survives where there is nobody to tell apart.** A data repo whose photos
  are all one person's, and a `by` that resolves to nobody, get the plain red
  badge the pin has always had. The accent switches itself on with the second
  contributor, here as everywhere else.
- **The colour is keyed on the id, never on a position in the registry.** A
  layer lists only the authors it credits, so the end's registry is a subset of
  the overworld's — and colouring by position would give one person two colours
  depending on which dimension you were looking at, which is the exact question
  the accent exists to answer. `site.json`'s `photos.authorColors` names a
  colour for the ids it wants to choose for, because *which* of six hues
  somebody gets is a look, and the palette settles it by arithmetic on an id
  handed out in the order people gave permission. An override does not switch
  the accent on: the rule below still rules.

**One author means no colour anywhere.** The whole scheme switches itself on
with the second contributor, so a data repo whose photos are all one person's
looks precisely as it did before this existed, and an accent that is always the
same accent is never drawn.

**And "one author" is a question about the site, not about a dimension.** It has
to be, or the answer changes as the visitor travels. Each layer file names only
the authors it credits, so a dimension one person happens to own says "one
author" on its own — and would drop every accent, then grow them back once the
visitor had been somewhere else and returned and the merged roster had quietly
got bigger behind them. Same photos, same dimension, different map depending on
the route taken to it.

So `build-data.mjs` unions every layer file's `authors` across every dimension
and writes the result into each dimension's metadata as `photoAuthors`
(`collectPhotoAuthors`). The viewer takes that as its roster before any layer
arrives — the same reason `kind` is hoisted there, and the same mechanism. The
per-layer merge stays underneath it so a data repo built by an older engine, or
by hand, still works. The gate itself never changed: it still asks whether the
roster it holds names more than one person. What changed is that the roster is
now the same everywhere.

**The pane row keeps its bar**, because the colour is what ties a row to its
pin and the shape is what each of them has room for: a 96px thumbnail in a list
reads a bar along its foot cleanly, where a pin needed the colour on the one
element the eye was already going to.

### The filter is a set of chips in the pane

One toggle per author, with a count, above the list. It narrows the **pins as
well as** the list: a pane that disagrees with the map about which photos exist
is two answers to one question, and the timeline already set the precedent that
narrowing the set narrows both.

- **The count follows the view; the order does not.** A chip counting the whole
  dimension sits directly above a sentence counting the viewport, and one of
  them is answering a question nobody asked — so the number is of what is on
  screen, exactly as the sentence is. The *order* is fixed by each author's
  share of the whole dimension, because chips that resort themselves as you pan
  are a filter you cannot aim: the target moves out from under the cursor. An
  author with nothing in view keeps their chip, reading `0`, since otherwise
  turning somebody off removes the control that turns them back on. The chip's
  tooltip carries the dimension-wide total, which is the fact the ordering is
  made of — where the ordering is made of a fact at all: a site that states
  `photos.authorOrder` gets exactly the order it asked for, and share of the
  dimension is left to break the tie among everybody it did not name.
- **The counts ignore the filter itself.** "How many of theirs are here" does
  not change because you have just hidden them, and a chip that zeroed itself
  on being switched off would say it had.
- **Everybody on is stored as no filter at all** (`null`, not a full set). The
  untouched case then costs nothing, and an incoming `ph` permalink can never
  land on a photo the filter is hiding.
- **Turning the last author off shows nothing**, and should: the alternative is
  a set of checkboxes that silently disagrees with itself. The status line says
  「絞り込み中の」 so an empty list is not misread as an empty place.
- **It rides the hash as `by`, and that was a reversal.** It was first built
  deliberately *not* to: a filter is a way of reading the map for a moment
  rather than a state you send somebody, and a permalink that arrives filtered
  is a permalink that can arrive pointing at nothing. The first half turned out
  to be wrong — a filtered map is exactly the thing somebody wants to send,
  which is the whole reason the filter exists — and the second half was a real
  risk with a small answer, below. `by` is a list of the ids the pane is letting
  through: absent for everybody, `[]` for everybody switched off, which is a
  state the pane allows and so a state a link can carry. It is top-level rather
  than filed under a dimension because the pane keeps one filter for the whole
  map; author ids are global.
- **An arriving photo outranks an arriving filter, by the smallest margin.**
  `find` searches the pins that were *drawn*, so a `ph` naming a photo the
  filter hides would land on nothing and the link would silently do nothing —
  the failure the original decision was avoiding. So a `ph` adds its
  photographer to the filter on arrival and leaves the rest of it standing: the
  link is about that photo, and the visitor still gets the map that was sent
  with one more person switched on. Every change to the filter goes through one
  function, which is what keeps the hash from drifting from the pane.
- **Anything that is not a list of ids is discarded whole.** A half-read filter
  is a map nobody chose; an unreadable one opens unfiltered, which is what every
  visitor without a link gets. Ids naming nobody survive parsing, since the
  roster is not loaded when the hash is read, and the first click on any chip
  rebuilds the set from the roster and drops them.

## The lightbox

Holds the whole cluster, not one photo, so ← → walk it. Escape closes.
「この日付の地図を表示」 sets the timeline to the photo's date — the pairing that is
the point of the feature.

**A filmstrip under the caption says how deep the stack is.** Without it a cluster
is a stack of unknown depth and the arrow keys are a guess at how far there is
left to go; with it the current photo is outlined among its siblings and any of
them is one click away. It is built on open rather than on every step, because a
cluster does not change while you walk it and a 201-thumbnail strip is not free.

The layout is a single column — photo, caption bar, filmstrip — rather than the
bar pinned to the bottom of the screen. The bar describes the photo above it, so a
gap between the two reads as though it belongs to neither.

It opens on the photo the pin was showing (`cluster.leadIndex`), not on whatever
sorted first, so clicking a pin gives you the image you clicked.

### Photo permalinks

**「リンクをコピー」 links to the photo itself.** A screenshot is the most
pointed-at thing on the map — "look at this one" — and until this button the only
shareable state was a viewport, which does not survive a cluster of a hundred.

The link carries the photo's stem in a top-level `ph` hash key, the photo's *own*
coordinates rather than the map centre (so closing the lightbox leaves the
recipient looking at the pin), and the timeline verbatim — the photo is on screen
under exactly those settings, which is how it came to be in the lightbox, so
repeating them puts it back with its terrain.

**`ph` is an arrival instruction, not state.** `setupPhotoPanel` consumes it on
the first `dimviewready`, after `apply` has drawn the pins, and a dimension switch
afterwards does not reopen it. Carrying it also *implies* the photo layer — it
ticks the persist checkbox — so a link works whether or not the sender was
browsing with the pins up. It resolves to a **pin** rather than to a lone image,
via `find` on the layer's current pins, because showing the photo alone would hide
that it sits in a stack.

The confirmation is the button's own label rather than a toast: the caption bar
has no room for a status line, and a toast over the photo covers the thing being
looked at.

`buildPermalinkUrl` in `lib/permalink.js` is still the only place a hash URL is
assembled.

## Timeline behaviour

**Photos obey the timeline's existing exact/before/fill semantics**, and
`selectPhotos` is written to mean the same three things `selectTileDate` means:

- **exact** → only photos taken on the selected date
- **before** → every photo up to and including it
- **fill** → photos from any date, dimmed if they postdate the selection

Scrubbing backward empties the map of photos that had not been taken yet. No new
control, no new mental model.

The two dates — `timeline.date` for terrain, `timeline.photoDate` for which photos
exist — are described in [`viewer.md`](viewer.md#two-timeline-dates).

`groupSummaryHtml` renders `(🗓3) (▶4) (📷12)` per year/month group, **and each
tile date's own row carries its `(📷n)` too**, from the same function. Before that,
the only rows advertising photos were the 19 photo-only ones, which reads exactly
backwards — as though a day somebody spent mapping never has screenshots, when in
fact 218 of the 263 photos fall on dates that already have a tile row. Only the
extra *row* was ever suppressed there, never the photos.

### A cluster the timeline has split

In fill mode a cluster can hold photos from before and after the selected date,
and the first version got this visibly wrong. It dimmed a cluster only when
*every* photo in it was dim, and it led with the newest photo outright — so a
mixed cluster rendered a future photo at full brightness, and a photo the timeline
had decided was not taken yet looked exactly like one that was. Clicking a date
faded the lone future pins and left the grouped ones bright.

Two rules in `clusterPhotos` fix it:

- **The lead is the newest photo that is not dimmed**, falling back to the newest
  outright only when the whole cluster is dim. The image on a bright pin is
  therefore always a photo you have scrubbed far enough forward to have taken. A
  cluster is dim exactly when its lead is, which for the all-dim case is the old
  behaviour unchanged.
- **The badge writes the split out** as `3+2`: three photos that exist, two that
  do not yet, the tail in a lighter weight. Folding them into one `5` is what made
  a bright pin able to be mostly future. A cluster with no split reads as a plain
  count, which is the common case — `before` mode dims nothing at all.

A cluster still holds all of its photos and the lightbox still walks all of them:
the timeline's judgement is about what to *show*, not about what to hide.

There is a known gap in this, at the level of the individual photo rather than the
cluster — see [`plans/backlog.md`](plans/backlog.md).

## What review guarantees

Photo review lives in `mc-screenshot-to-map`'s web app, alongside the tile review,
reusing its decision states (`approved` / `hold` / `rejected` / undecided), its
digest rule and its plan-then-confirm deploy. What the viewer can rely on:

- **Nothing reaches `photos.json` unreviewed.** The layer file is rewritten from
  the set a person has approved, so a photo on the map has been looked at.
- **For a photo, *public* means committed**, not present — the review queue is
  derived from `git ls-files`.
- **A published photo is not withdrawn by a later rejection.** Taking one down is
  a separate, deliberate act; the plan warns rather than doing it silently.
- **`photos.json` is rewritten, never merged**, because a photo is only on the map
  if the layer lists it — unlike a tile, which the site build discovers by
  globbing filenames.
- **Placement is inside the decision digest**, not just the pixels. The same image
  at a nether coordinate instead of an overworld one is a different thing on the
  map, so correcting a dimension invalidates the approval.

## Rejected

**Deep-linking a photo into the VOD at the moment it was taken.** The taskbar
clock plus a stream start time would give a seconds offset, which is exactly the
`t` field `vodUrl()` already renders. It does not work: the majority of the VODs
are re-uploads of Twitch archives, so the YouTube timestamps describe the
re-upload, not the stream. Revisit only if a source of true stream start times
turns up.
