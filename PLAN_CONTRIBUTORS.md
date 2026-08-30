# Photos by other people — design doc

Status: **Not started.** This is the plan; no code has been written.

The photo layer today carries 280 screenshots, all taken by the site owner and
all placed by a coordinate in their filename. This doc covers the next source:
screenshots other members posted to the server's Discord, published **with
credit** and **only with permission**.

It is the sibling of `PLAN_PHOTOS.md` and keeps the same split. What lives here
is the **data contract** — `photos.json` and what the viewer may assume about
it — plus everything downstream. The extraction half belongs in
`mc-screenshot-to-map` and is **recorded there**, in its own
`PLAN_CONTRIBUTORS.md`: the export reader, the HUD OCR, the pipeline changes,
the review app and the publish step, in the detail you would want if you opened
a session in that repo. Sections below that touch extraction are summaries with
a pointer, not the record.

Read `PLAN_PHOTOS.md` first. Everything it settles about clustering, the
lightbox, the photos pane and the timeline still holds; this changes what goes
*into* the layer, not how it is drawn.

## Goal

Two members — **鹿(本物）** and **りりまる** — have given permission to publish
the screenshots they posted in the server's `#minecraft` channel. Put those on
the map beside the owner's own, credited to whoever took each one, without
publishing anything from anybody who has not agreed.

## The source, in one table

Measured over `../discord-exports`, 2026-08-30 — two Discrub zips, one
`#minecraft` channel, 4,871 messages spanning 2021-08-19 → 2026-08-30.

| | |
|---|---|
| attachments from the two permitted users | **195** (155 png, 40 jpg) |
| 鹿(本物） / りりまる | 118 / 77 |
| by year | 2021: 56 · 2022: 52 · 2023: 58 · 2024: 6 · 2025: 11 · 2026: 12 |
| placed by HUD OCR | **82** (42%), of which 80 land inside the mapped overworld |
| distinct JST dates | 108, of which only 47 have tiles |
| messages carrying text as well | 134 |

The images are far more heterogeneous than `../raw` — 43 distinct sizes, from
hand-cropped near-1920×1080 uploads down to 412×198 re-crops, plus phone
screenshots and two photographs of a screen. Nothing in the viewer may assume a
common aspect ratio, and nothing does.

## Three findings that reach this side

The rest are extraction facts and live in the tool repo's doc. These three
change the data or the viewer.

### The set is dated in the wrong timezone until it is converted

Discrub renders timestamps in the local zone of the machine that made the
export. The map's dates are JST, and **102 of the 195 land on a different
calendar day** once converted — more than half the set filed under the wrong
date if this is missed. The conversion is verifiable against seven files whose
names carry Minecraft's own capture timestamp, and matches them to within a few
minutes.

Consequence here: nothing, if the tool repo gets it right. It is stated because
a `date` in `photos.json` that is silently off by one is the kind of error the
viewer cannot detect and a reader would never suspect.

### The timeline gains about 61 photo-only dates

`PLAN_PHOTOS.md` predicted the photo-only row would be most of the timeline,
found it was 19 rows, and built around it being rare. This takes it to about 80.

The row type works and needs no change. What deserves a look once the real set
is in is whether a timeline that is now a third photo-only rows still reads
well, and whether the per-date `(📷n)` counts still carry the weight
`PLAN_PHOTOS.md` gives them. **Do not pre-solve it** — look at it in the
preview, the way the first review pass was done.

### HUD OCR gives these photos a real `y`

42% of the set is placed by reading `位置: 6603, 160, 145` out of the frame,
which carries a height. No filename-derived photo has one. `photoCaption`
already renders `y` and already drops it when null, so these get a fuller
caption than the existing 265 with no viewer change at all.

## Decisions

### Consent gates the pipeline

`mc-screenshot-to-map/metadata/contributors.csv` — git-tracked, hand-authored,
one row per person: an id, their Discord id and handle, the display name, and
when and how permission was given. It follows the convention
`raw_identity.csv` and `photo_overrides.csv` already set, where **the diff is
the audit trail**.

It is not documentation. The export reader takes it as its allowlist, so a
photo from somebody who has not agreed is never extracted at all — consent is
enforced at the boundary rather than remembered downstream, the same way
*public* already means *committed*. The deploy refuses an unknown author as a
last gate.

No editing UI: three rows do not justify a CRUD page. Details and the
counter-arguments are in the tool repo's doc.

### The published id is a number, and carries no handle

`photos.json` gets `"by": 2`, never `shika_honmono`. Display names resolve
through a registry; Discord handles and user ids stay in the tool repo and are
never deployed. So the site credits people by the name they chose and leaks
nothing about where the photos came from.

### Every photo is stamped, and there is no default author

`by` is written on **every** entry including the owner's own 265, rather than
letting an absent `by` mean the owner. `photos.json` is rewritten wholesale on
every deploy and never merged, so stamping all of them costs one line and about
2 KB, and it buys an explicit rule in place of an implicit one. The viewer never
has to know who the default is.

### The registry ships inside `photos.json`

```json
{ "id": 102, "name": "スクリーンショット", "dimension": "overworld",
  "kind": "photos",
  "authors": { "1": { "name": "pupu" },
               "2": { "name": "鹿(本物）" },
               "3": { "name": "りりまる" } },
  "photos": [
    { "f": "20220426/d968…-0", "date": "20220426", "by": 3,
      "pos": [6521, 212, 597], "time": "19:31", "src": "hud" }
  ] }
```

Rather than in `site.json`, which was the obvious guess because
`photos.baseUrl` already lives there and is already plumbed to
`window.photosConfig`. Three reasons to prefer the layer file:

- **One source of truth.** `contributors.csv` is where the names are authored,
  and `deploy_photos.py` already rewrites the layer files from it. Names in
  `site.json` too means a second place to edit and a way for the two to drift,
  with the failure showing up as a wrong name under somebody's photo.
- **`site.json`'s `photos` block is about where the files are.** `baseUrl` and
  `thumbUrl` exist so the set can move to another origin without a code change.
  Author names are not that kind of fact.
- **It arrives exactly when it is needed.** The lightbox and the pane only exist
  once a photo layer has been fetched, so nothing needs hoisting into the
  dimension metadata the way `kind` did.

`src` gains `hud`, and a value for "not placed yet" that never reaches a
published entry. No `url` field on an author for now; adding one later requires
no change anywhere else.

### Stems are opaque, and settled now

`{date}/d{msgid}-{n}` — the JST post date, the Discord message id, and the
attachment's index within that message. Not a coordinate, because these
filenames carry none: 64 of りりまる's 77 are bare numbers like `143.png`, which
collide across dates.

This is a data-contract decision rather than a tool one, because **a stem is a
published URL** — it is the `ph` permalink key and the file path in `llmr`. It
is fixed before the first commit and not revised.

The date in the stem is the *post* date and is immutable; a photo's displayed
date is separately correctable, so fixing a date never moves a published file.

### An unplaced photo is held, never published

OCR proposes a coordinate for the 82 it can read; everything else waits for a
person to place it in the review app. A photo nobody places simply never ships.

This preserves the invariant the viewer relies on — every entry in
`photos.json` is somewhere real — rather than introducing a positionless state
through the pane, the clustering and the `ph` permalink, all three of which
assume a position exists. It also keeps `deploy_photos.py`'s existing refusal
rule intact instead of adding an exception to it.

The manual load is smaller than the 113 without a read suggests, since many of
those will be rejected as not-a-place anyway.

### Incidental chat is fine

`PLAN_PHOTOS.md` stated the chat rule more broadly than it was meant, and has
been narrowed. The rule is about a screenshot that is **nothing but a chat
log**, among the owner's own raw files. **Chat visible incidentally behind a
photograph of a place is fine** and is not a reason to hold it.

### There is no classifier stage

Roughly a third of the 195 are not game screenshots at all, and a further large
block are in-game UI rather than places. The obvious response is a cheap
detector that pre-filters before a person looks, and **it was tried and it does
not work** — the best structural signal ranks the finest photos in the set at
the bottom, because people hide the HUD precisely when composing a nice
screenshot. The measurement is recorded in the tool repo's doc so nobody builds
it twice.

Every image goes to the review app instead. At 195 that is one sitting, and the
decision states already exist.

## Viewer changes

Small, and confined to the two files that already own photos.

- **`lib/photos.js`** — `photoCaption` gains the credit. Pure, so it is tested
  there: `[title, 撮影: name, when, where].filter(Boolean).join(" ・ ")`. An
  unknown `by` renders no credit rather than an id.
- **`lib/setupPhotos.js`** — read `authors` off the layer JSON and thread it
  through to the caption and the pane row.
- **`llmr/site.json`** — the About pane is the natural place to thank
  contributors. That is `aboutHtml`, site-owned, so it is a hand edit in the
  data repo, not engine work.

Nothing else. The layer, clustering, lightbox, filmstrip, pane, hover linking
and permalink all work unchanged on photos that now carry one more field.

## Phases

Detail, ordering and the per-phase reasoning are in the tool repo's doc. In
outline:

- **A — read the export.** Parse the HTML, apply `contributors.csv` as the
  gate, convert the timezone, write a processed tree.
- **B — the HUD reader.** Built as a component serving both this and
  `PLAN_PHOTOS.md` Phase 4, against this set because it is the messier corpus.
- **C — pipeline.** Four schema gaps, a second discovery path, encode the 195.
- **D — review app.** Author, message text, an editable date, and a placement
  UI. The largest phase.
- **E — viewer.** `authors`, the caption credit, tests. Everything in this doc's
  "Viewer changes".
- **F — publish.** Review all 195, then deploy. Settle the encoding first, for
  the reason `PLAN_PHOTOS.md` gives.

D was initially assumed to be the long pole because placing ~113 photos looked
like it needed a real map embedded in the review app. It does not:
`map_excerpt` already takes an arbitrary centre and span and reports its own
scale, so click-to-place is exact arithmetic over a rendered PNG, with no map
library. The phase is still the largest, but its shape is known.

## Open questions

- **The Japanese credit label.** 「撮影: 鹿(本物）」 is the assumption. Not
  confirmed.
- **Should the photos pane filter by author?** Plausibly useful with three of
  them; nothing needs it yet, and the pane is already co-primary with the pins
  for a different reason.
- **Do 80 photo-only timeline rows still read well?** Look at it in the preview.
- **How many of the 195 survive review?** The guess from the contact sheets is
  90–110, which would make this source about a third of the combined set.
- **Other members' in-game nametags are visible in many of these photos.** The
  photographer has consented; the people in frame have not been asked. Those
  names are already public in the streams the map exists to accompany, so the
  working assumption is that this is fine — recorded so it is a decision rather
  than an oversight.
