# The data-repo contract

The engine ships no data. A data repo supplies the tiles, the layer files, the
dates and the site's identity; `build.mjs` reads that repo and writes
`deploy/`. This file is the contract between the two — change anything here and
every data repo has to follow.

Reference implementation: [oatmeal/llmr](https://github.com/oatmeal/llmr).

## Layout

```
data/
  config.json          per-dimension spatial config (X0, Z0, defaults, tile paths)
  dates.json           YYYYMMDD → display string
  vods.json            [{id, date, title, t?}] — see vods.md
  overworld/*.json     layer files, including the optional photos.json
  nether/*.json
  end/*.json
tiles/                 tiles/[dim]/[zoom]/[x]/[z]/[date].png
photos/                optional: [date]/[stem].webp plus thumb/[date]/[stem].webp
static/                optional: site assets copied into deploy/ (e.g. og.jpeg)
site.json              site identity
```

Dimension codes are `o` / `n` / `e`; the directories use the full names.

## Layer files

```json
{ "id": 3, "name": "鉄道", "dimension": "overworld",
  "markers": [ { "name": "…", "pos": [x, y, z] } ],
  "lines":   [ { "name": "…", "pts": [[x,y,z], …] } ] }
```

- **`id` must be a number, and unique across *all* dimensions.** `build-data.mjs`
  collects ids into one dict for the whole build and sorts with `a.id - b.id`, so
  a duplicate throws and a string id yields `NaN`. `llmr` bands them by dimension
  — overworld 1xx, nether 5x, end 2xx.
- A line may carry any other option [Leaflet's polyline](https://leafletjs.com/reference.html#polyline)
  accepts.
- A file may carry any combination of content arrays; see `RENDERERS` in
  [`viewer.md`](viewer.md#rendering-layer-content).
- **`kind`** selects a renderer other than markers/lines. `"photos"` is the only
  one today.

### A photo layer

```json
{ "id": 102, "name": "スクリーンショット", "dimension": "overworld",
  "kind": "photos",
  "authors": { "1": { "name": "pupu" }, "2": { "name": "鹿(本物）" } },
  "photos": [
    { "f": "20240828/6827x740z", "date": "20240828",
      "pos": [6827, null, 740], "src": "filename", "by": 1 }
  ] }
```

| field | |
|---|---|
| `f` | path stem under `baseUrl`/`thumbUrl`; the encoder owns the extension |
| `date` | `YYYYMMDD`, the date the photo counts as taken on |
| `pos` | `[x, y, z]`, dimension-native, exactly as a marker is. `y` is `null` when the position came from a filename, and the caption drops it |
| `src` | `filename` \| `hud` \| `manual` |
| `by` | the id of whoever took it, resolved through `authors`. On **every** entry including the data repo owner's own; see below |
| `time` | `HH:MM`, omitted when there was no taskbar clock in the screenshot |
| `title` | optional, hand-written, never generated |

`authors` is optional and a layer without it renders exactly as it did before
the field existed — no credit, no accent, no filter. Where it is present:

- **The key is an id, and the only published field is `name`.** Whatever the
  producing repo knows about a person beyond their display name stays there.
- **List only the authors that layer credits.** A photo layer for a dimension
  where every photo is one person's names one person. The pane's filter lists
  what it is given, so a contributor with nothing behind them is a dead
  checkbox.
- **`by` is on every entry, and there is no default.** An absent `by` is not
  "the owner"; it is a photo the viewer will not credit. Stamping all of them
  costs a couple of KB and buys an explicit rule.
- **An id with no entry in `authors` renders no credit at all** rather than a
  number. A photo whose author cannot be named is not a photo by somebody
  called "3".

`photos.json` is **rewritten, never merged**, by the publish step in
`mc-screenshot-to-map` — a photo is on the map only if the layer lists it, unlike
a tile, which the site build discovers by globbing filenames. See
[`photos.md`](photos.md).

## `site.json`

```json
{
  "title": "Page <title>",
  "og": {
    "title": "OG title",
    "url": "https://...",
    "image": "https://.../og.jpeg",
    "description": "...",
    "locale": "ja_JP"
  },
  "aboutTitle": "Header text for the info sidebar pane",
  "aboutHtml": "<p>HTML content for the info sidebar pane</p>",
  "photos": {
    "baseUrl": "photos/",
    "thumbUrl": "photos/thumb/",
    "authorOrder": [3, 1, 2],
    "authorColors": { "2": "#43c59e" }
  },
  "vods": {
    "playlists": ["https://www.youtube.com/playlist?list=..."],
    "extraVideos": ["videoId"],
    "titleCleanup": {
      "vocab": ["extra boilerplate tag tokens to strip"],
      "overrides": { "videoId": "hand-written title" }
    }
  }
}
```

`photos` says where the photo layer loads its images from, and how the site
wants its photographers shown. `baseUrl` and `thumbUrl` are relative to the
deploy root by default and are substituted into `index.html` as
`window.photosConfig`, so moving the set to another origin is a config edit and a
file move rather than a code change. `lib/photos.test.js` pins that an absolute
base passes through untouched.

`authorOrder` and `authorColors` are both optional and both keyed on the same
ids as the layer file's `authors`:

- **`authorOrder`** is the order the pane's filter chips go in, and with them the
  wedges of a pin's count badge. Anyone it leaves out keeps the default — share
  of the dimension for the chips, id for the wedges — so a partial list means
  "these first, then carry on".
- **`authorColors`** overrides the built-in palette for the ids it names. Which
  of six hues somebody gets is otherwise decided by arithmetic on an id handed
  out in the order people gave permission, which is no basis for a colour.
  It does not switch the accent on: a map with one contributor still draws none.

They live here rather than beside the names in the layer file because neither is
a fact about a person — `authors` is rewritten wholesale by the producing repo
from its consent record, and these are the site owner's choices about their own
pane, which survive that rewrite.

`vods` is read **only** by `scripts/sync-vods.mjs`; the build ignores it. See
[`vods.md`](vods.md).

## `index.html` tokens

`build-assets.mjs` substitutes these from `site.json`:

`***TITLE***`, `***OG_TITLE***`, `***OG_URL***`, `***OG_IMAGE***`,
`***OG_DESCRIPTION***`, `***OG_LOCALE***`, `***ABOUT_TITLE***`,
`***ABOUT_HTML***`, `***PHOTOS_CONFIG***`

## Build output

`build-assets.mjs` creates the `deploy/` skeleton: the static files, the Leaflet
dependencies, and the bundled `map.js`.

`build-data.mjs` scans `tiles/` and writes into `deploy/data/`:

- **`[dim].json`** — bounds, the date list, `fileDates` per tile key, `photoDates`
  (a count per date that has photos), the tile path and size, and the layer list.
- **Each layer's `kind`**, copied into that metadata. The viewer has to tell a
  photo layer from a marker layer *before* it fetches either — to keep it out of
  the layers panel, and out of the nether's show-everything default.
- **`photoAuthors`** — the union of every layer file's `authors`, across *all*
  dimensions, written identically onto each one. A layer names only the authors
  it credits, but "is more than one person on this map" decides whether accent
  colours exist at all, and answered per dimension that question changes its
  answer as the visitor travels. Absent where no layer names an author, so a
  data repo without the field builds exactly as it did before.
- **Per-date tile replacement caches**, `data/[dim]/[date]-[mode].json`.

It then copies `tiles/` and `photos/` into `deploy/`. **A layer's photos extend
the dimension's bounds**, so a far-flung screenshot is reachable on the map.

`test/build.test.js` runs a real build against a fixture repo.
