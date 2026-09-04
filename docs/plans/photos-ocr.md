# Photo OCR — the remainder of the photo layer

Status: **not started.** Everything else in the photo layer is built and live;
this is what is left of it. Read [`../photos.md`](../photos.md) first — it settles
clustering, the lightbox, the pane and the timeline, and none of that changes
here.

## What it is

OCR the HUD coordinate line and the taskbar clock in the raw screenshots. That:

- brings in the **214 descriptively-named screenshots** that carry no coordinate
  in their filename and are therefore not in the layer at all;
- gives the photos already placed from a filename a **wall-clock time** and a
  **real `y`**, both of which are `null` or absent today.

**Order matters: read the clock before cropping it away.** Roughly 40 files have
no taskbar at all and have nothing beyond their folder date.

## Almost all of it is tool-repo work

`photoCaption` already renders `time` and already drops `y` when it is null, so
populating either needs **no viewer change**. The extraction, the review UI and
the publish step are `mc-screenshot-to-map`'s.

**The HUD reader is shared with
[`../contributors.md`](../contributors.md), and it is already built.** That
feature needed the same `位置` reader and specified it against the Discord set
deliberately, because those images are messier than `../raw` — hand crops, phone
layouts, arbitrary sizes — so a reader that survives them arrives here already
hardened. It shipped as `mc-screenshot-to-map/hud.py` — 105 reads on that
corpus after two threshold corrections, 86 of them surviving the vote gate that
followed — and it has since been run over
`../raw` as well: `scripts/freeze_hud_reads.py` records `hud_x/y/z` on the
owner's own photos without applying them. So this plan does not start from
nothing — the reader exists, it is tested, and the work here is the applying.
The record is `mc-screenshot-to-map/docs/plans/contributors.md` §Phase B and
`docs/plans/hud-gate.md`.

## A position review has to be built

An OCR'd coordinate is a claim about where a screenshot was taken with nothing to
check it against, so the review question is "does this photo look like it belongs
at this spot on the map". The map-excerpt machinery already exists in the review
app; what is missing is the photo beside it, and a coordinate that came from the
HUD rather than the filename.

## What lands on this side

Only the open question below — what to do with the photos OCR dates but cannot
place.

## Open questions

- **Should an unpositioned photo appear at all?** OCR makes this concrete: it
  will place some of the 214 and leave the rest dated but unplaced. A
  timeline-only row is the obvious answer, but it may be a large and
  uninteresting pile.
- **How many `-N` session variants matter?** The timeline is folder-date granular
  and the wall-clock time is not yet extracted, so photos within a day have no
  sort key beyond their filename. OCR of the clock is what would give them one.
- **Do the non-`c` variants hold distinct shots?** There are 11 of them (`a`, `b`,
  `1`, `2`, `-0`, `-1`), currently all kept as separate photos, which is the safe
  direction to be wrong in.

Two questions that were open here are now answered, in
[`../photos.md`](../photos.md): clustering is in screen pixels, and the filename
coordinates agree with the HUD on ten of ten.
