# Status

**Last updated: 2026-08-30.** This is the only file in this repo that asserts
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
| **Viewer engine** | Complete for the current feature set. 17 test files, 310 tests, all passing. |
| **Photo layer** | **Live.** Layer, clustering, pins, pane, lightbox, permalinks and timeline filtering all shipped and reviewed against a live preview. |
| **Photo OCR** | **Not started.** [`docs/plans/photos-ocr.md`](docs/plans/photos-ocr.md) — the 214 screenshots with no filename coordinate, plus `time` and a real `y` for the rest. |
| **Photos by other people** | **Not started.** [`docs/plans/contributors.md`](docs/plans/contributors.md). |
| **Next** | Either of those two; they share the HUD reader and it should be built once. |

## The engine

Everything the viewer needs is built: the tile layer with its date/fill/exact
timeline, layer overlays, the coordinate panel, permalinks, VOD links, and the
photo layer.

- **Tests**: 17 files, 310 tests, `npm test`. `test/build.test.js` runs a real
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
| photos in `data/overworld/photos.json` | **249** (layer id 102) |
| photos in `data/nether/photos.json` | **17** (layer id 51) |
| WebP files tracked under `photos/` | 532 — 266 full plus 266 thumbnails |
| end | no photo layer yet; id 202 is reserved and the code path is the same one |

Those 266 are what survived review: 280 photos were built from the filename-coord
screenshots and a person approved the ones on the map. The review round, the
decision counts and the deploy log are `mc-screenshot-to-map`'s record, in its
`STATUS.md`.

**The encoding is settled** — WebP, long edge 1600, q80, plus a 400px q72
thumbnail. Re-encoding is not a free decision; see
[`docs/photos.md`](docs/photos.md#the-encoding-is-settled--do-not-revisit-it-casually).

## What is not done

In the order it is likely to be picked up:

1. **Photo OCR** — [`docs/plans/photos-ocr.md`](docs/plans/photos-ocr.md).
   Almost entirely tool-repo work; `photoCaption` already renders `time` and
   already drops a null `y`, so populating either needs no viewer change. One
   open question lands here: what to do with photos OCR dates but cannot place.
2. **Photos by other people** — [`docs/plans/contributors.md`](docs/plans/contributors.md).
   195 attachments from the two members who have agreed, of which HUD OCR places
   82. Needs `authors` in the layer file and a caption credit on this side; the
   export reader, the placement UI and the consent gate are the tool repo's.
3. **Backlog** — [`docs/plans/backlog.md`](docs/plans/backlog.md). The per-photo
   dim state under a hover swap is the one real bug; the rest is `fetch` error
   handling, VOD test coverage and four stray `console.log`s.

## How to check any of this yourself

```bash
npm test                                                   # 17 files, 310 tests
node build.mjs ../llmr                                     # a real build
git -C ../llmr ls-files photos | wc -l                     # published photo files
python3 -c "import json;print(len(json.load(open('../llmr/data/overworld/photos.json'))['photos']))"
python3 -c "import json;print(len(json.load(open('../llmr/data/nether/photos.json'))['photos']))"
```

For the extraction and review side of those numbers, read
`../mc-screenshot-to-map/STATUS.md` — its deploy logs are append-only and carry
the commit they were made at, so they are the primary record.
