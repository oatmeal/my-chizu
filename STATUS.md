# Status

**Last updated: 2026-09-04.** This is the only file in this repo that asserts
where things stand. Every other document describes how something works or why it
is that way; if one of them contradicts this file, this file is right and the
other one is stale.

This repo is the **engine**. The map it is best known for lives in the `llmr`
data repo, and the screenshots come from `mc-screenshot-to-map` — each has its
own status.

**This file states no counts** — not how many photos are published, how many
tests there are, or how many rows the timeline has. Every one of them is a fact
about a working tree that changes without anybody editing this file, so written
down here it is a number that quietly goes wrong. The commands under
[How to check any of this yourself](#how-to-check-any-of-this-yourself) print
the current ones instead.

## The short version

| | state |
|---|---|
| **Viewer engine** | Complete for the current feature set, and `npm test` is green. |
| **Photo layer** | **Live.** Layer, clustering, pins, pane, lightbox, permalinks and timeline filtering all shipped and reviewed against a live preview. |
| **Photos by other people** | **Built, being looked at.** A large minority of the published photos are two other members'. Every photo carries a credit, each author an accent colour, and the pane a filter; the site says the chip order and the colours it wants (`photos.authorOrder` / `authorColors` in `site.json`). The accent now rides the pin's **count badge** — a near-black core with the authorship on its rim, and a dot where a lone photo has no count — after the bar along the foot lost a nine-way comparison at real density. The filter rides the hash as `by`, reversing the decision that kept it out. An author's colour is settled over the whole site rather than per dimension, so it cannot depend on which dimensions a visitor has already loaded. [`docs/contributors.md`](docs/contributors.md), [`docs/photos.md`](docs/photos.md#who-took-it). |
| **Photo OCR** | **Not started.** [`docs/plans/photos-ocr.md`](docs/plans/photos-ocr.md) — the loose screenshots with no filename coordinate, plus `time` and a real `y` for the rest. |
| **Next** | **Look at the badge at real pin density**, and at a timeline carrying several times the photo-only rows it was designed against. Two pin bugs were found and fixed on the way here: the pin had never been square (Leaflet's `width: auto` for marker images outranked its own rule, so it drew at each thumbnail's aspect, hung right of its anchor and overlapped its neighbours), which is also why the old bar looked half-width and the badge looked adrift. Then photo OCR. |

## The engine

Everything the viewer needs is built: the tile layer with its date/fill/exact
timeline, layer overlays, the coordinate panel, permalinks, VOD links, and the
photo layer.

- **Tests**: `npm test`, all passing. `test/build.test.js` runs a real build
  against a fixture data repo; `test/coords-leaflet.test.js` and
  `test/init-integration.test.js` stand up real Leaflet under jsdom.
- **`lib/pixelated.js`** — per-image smoothing, which the tile deploy in
  `mc-screenshot-to-map` depended on — went live 2026-08-22.

Known bugs, gaps and in-code TODOs: [`docs/plans/backlog.md`](docs/plans/backlog.md).
Nothing there is blocking.

## The photo layer

Built and published. On the viewer side that means the layer file format, the
`RENDERERS` entry, clustering with a guaranteed minimum pin separation, the
photos pane, pin↔row hover linking, per-date `📷` counts, split-cluster badges,
the lightbox with its filmstrip, and photo permalinks. All of it is covered by
`lib/setupPhotos.test.js` and the photo block of
`test/init-integration.test.js`.

All three dimensions carry a photo layer in `../llmr` — the overworld's is
much the largest, and the end's is a handful. Every photo has both a full WebP
and a thumbnail tracked under `photos/`, and every one of them names its author.
Most are the site owner's, with the remainder split between 鹿(本物） and
りりまる. **The counts are not written down here**; the commands at the foot of
this file print the current ones, and any number in this file would be wrong by
the next deploy.

That set is what survived review across two rounds: the owner's own went out on
2026-08-29, and the deploy of 2026-09-04 added most of the permitted Discord
attachments, some of the owner's that had been on hold, and one re-cut. The
review rounds, the decision counts and the deploy log are
`mc-screenshot-to-map`'s record, in its `STATUS.md`.

**The encoding is settled** — WebP, long edge 1600, q80, plus a 400px q72
thumbnail. Re-encoding is not a free decision; see
[`docs/photos.md`](docs/photos.md#the-encoding-is-settled--do-not-revisit-it-casually).

## What is not done

In the order it is likely to be picked up:

1. **Look at the credit work.** Built and tested but not yet seen at real
   density: the accent bar on pins over the main base, the chips in the pane,
   a timeline with far more photo-only rows than it was designed against, and
   the lightbox frame resizing between photos of unequal natural size (in the
   backlog). The walkthrough is in [`docs/photos.md`](docs/photos.md#previewing-before-you-commit).
2. **Thank the contributors in the About pane.** `aboutHtml` in `../llmr`'s
   `site.json` — a hand edit in the data repo, not engine work.
3. **Photo OCR** — [`docs/plans/photos-ocr.md`](docs/plans/photos-ocr.md).
   Almost entirely tool-repo work; `photoCaption` already renders `time` and
   already drops a null `y`, so populating either needs no viewer change. One
   open question lands here: what to do with photos OCR dates but cannot place.
4. **Backlog** — [`docs/plans/backlog.md`](docs/plans/backlog.md). The per-photo
   dim state under a hover swap is the one real bug; the rest is `fetch` error
   handling, VOD test coverage and the stray `console.log`s.

## How to check any of this yourself

```bash
npm test
node build.mjs ../llmr                                     # a real build
git -C ../llmr ls-files photos | wc -l                     # published photo files
python3 -c "import json;print(len(json.load(open('../llmr/data/overworld/photos.json'))['photos']))"
python3 -c "import json;print(len(json.load(open('../llmr/data/nether/photos.json'))['photos']))"
# who took them, and the photo-only timeline rows
python3 -c "import json,collections;d=json.load(open('../llmr/data/overworld/photos.json'));print(d['authors'],collections.Counter(p['by'] for p in d['photos']))"
python3 -c "import json;m=json.load(open('../llmr/deploy/data/overworld.json'));print(len([d for d in m['photoDates'] if d not in set(m['dates'])]))"
```

For the extraction and review side of those numbers, read
`../mc-screenshot-to-map/STATUS.md` — its deploy logs are append-only and carry
the commit they were made at, so they are the primary record.
