# Status

**Last updated: 2026-09-04.** This is the only file in this repo that asserts
where things stand. Every other document describes how something works or why it
is that way; if one of them contradicts this file, this file is right and the
other one is stale.

This repo is the **engine**. The map it is best known for lives in the `llmr`
data repo, and the screenshots come from `mc-screenshot-to-map` — each has its
own status. Numbers below that describe the deployed map are stated as facts
about `../llmr`'s working tree and are re-derivable at the bottom.

## The short version

| | state |
|---|---|
| **Viewer engine** | Complete for the current feature set. 17 test files, 371 tests, all passing. |
| **Photo layer** | **Live.** Layer, clustering, pins, pane, lightbox, permalinks and timeline filtering all shipped and reviewed against a live preview. |
| **Photos by other people** | **Built, being looked at.** 137 of the 417 published photos are two other members'. Every photo carries a credit, each author an accent colour, and the pane a filter; the site says the chip order and the colours it wants (`photos.authorOrder` / `authorColors` in `site.json`). The accent now rides the pin's **count badge** — a near-black core with the authorship on its rim, and a dot where a lone photo has no count — after the bar along the foot lost a nine-way comparison at real density. The filter rides the hash as `by`, reversing the decision that kept it out. An author's colour is settled over the whole site rather than per dimension, so it cannot depend on which dimensions a visitor has already loaded. [`docs/contributors.md`](docs/contributors.md), [`docs/photos.md`](docs/photos.md#who-took-it). |
| **Photo OCR** | **Not started.** [`docs/plans/photos-ocr.md`](docs/plans/photos-ocr.md) — the 214 screenshots with no filename coordinate, plus `time` and a real `y` for the rest. |
| **Next** | **Look at the badge at real pin density**, and at a timeline that now has 57 photo-only rows. Two pin bugs were found and fixed on the way here: the pin had never been square (Leaflet's `width: auto` for marker images outranked its own rule, so it drew at each thumbnail's aspect, hung right of its anchor and overlapped its neighbours), which is also why the old bar looked half-width and the badge looked adrift. Then photo OCR. |

## The engine

Everything the viewer needs is built: the tile layer with its date/fill/exact
timeline, layer overlays, the coordinate panel, permalinks, VOD links, and the
photo layer.

- **Tests**: 17 files, 346 tests, `npm test`. `test/build.test.js` runs a real
  build against a fixture data repo; `test/coords-leaflet.test.js` and
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
`lib/setupPhotos.test.js` (807 lines) and the photo block of
`test/init-integration.test.js`.

Published in `../llmr` today:

| | |
|---|---|
| photos in `data/overworld/photos.json` | **389** (layer id 102) |
| photos in `data/nether/photos.json` | **26** (layer id 51) |
| photos in `data/end/photos.json` | **2** (layer id 202) |
| WebP files tracked under `photos/` | 834 — 417 full plus 417 thumbnails |
| by author | 280 the site owner's, 66 鹿(本物）'s, 71 りりまる's |

Those 417 are what survived review across two rounds. 266 of the owner's went
out on 2026-08-29; the deploy of 2026-09-04 added 152 more — **137 of the 195
Discord attachments**, 14 of the owner's that had been on hold, and one re-cut.
The review rounds, the decision counts and the deploy log are
`mc-screenshot-to-map`'s record, in its `STATUS.md`.

**The encoding is settled** — WebP, long edge 1600, q80, plus a 400px q72
thumbnail. Re-encoding is not a free decision; see
[`docs/photos.md`](docs/photos.md#the-encoding-is-settled--do-not-revisit-it-casually).

## What is not done

In the order it is likely to be picked up:

1. **Look at the credit work.** Built and tested but not yet seen at real
   density: the accent bar on pins over the main base, three chips in the pane,
   57 photo-only timeline rows where the estimate said 80, and the lightbox
   frame resizing between photos of unequal natural size (in the backlog). The
   walkthrough is in [`docs/photos.md`](docs/photos.md#previewing-before-you-commit).
2. **Thank the contributors in the About pane.** `aboutHtml` in `../llmr`'s
   `site.json` — a hand edit in the data repo, not engine work.
3. **Photo OCR** — [`docs/plans/photos-ocr.md`](docs/plans/photos-ocr.md).
   Almost entirely tool-repo work; `photoCaption` already renders `time` and
   already drops a null `y`, so populating either needs no viewer change. One
   open question lands here: what to do with photos OCR dates but cannot place.
4. **Backlog** — [`docs/plans/backlog.md`](docs/plans/backlog.md). The per-photo
   dim state under a hover swap is the one real bug; the rest is `fetch` error
   handling, VOD test coverage and four stray `console.log`s.

## How to check any of this yourself

```bash
npm test                                                   # 17 files, 346 tests
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
