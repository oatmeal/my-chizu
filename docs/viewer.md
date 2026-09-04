# The viewer

How `lib/` is put together: the module layout, the coordinate system, the state
that rides the URL hash, and the in-memory shapes those modules pass around.

The data contract this reads — `config.json`, layer files, the build's `[dim].json`
— is in [`data-repo.md`](data-repo.md). The photo layer has its own file,
[`photos.md`](photos.md), because it is large enough to drown this one.

## Modules

`lib/map.js` is the entry point. It owns `myMap`, wires Leaflet to the panels,
and fires the events the panels redraw on; everything else is either pure logic
or one panel.

| module | what it is |
|---|---|
| `map.js` | Entry point. `init()`, `changeDim()`, the hash read/write, the tile layer |
| `coords.js` | Minecraft `[X, Z]` ↔ Leaflet `LatLng`, pure. `test/coords-leaflet.test.js` checks it against real Leaflet |
| `dimensions.js` | The `o`/`n`/`e` codes, their full names, and `dimScale()` |
| `hash.js` | Parse and serialise the URL hash |
| `viewState.js` | Resolve the starting X/Z/zoom for a dimension: programmatic override → hash → default |
| `tileDate.js` | Which date's image a tile shows, for exact/fill/before |
| `tileUrl.js` | Tile URLs, and whether a tile is worth creating at all at this zoom |
| `pixelated.js` | Per-image smoothing: a tile smaller than its CSS box is upscaled and must not be smoothed |
| `permalink.js` | `buildPermalinkUrl()` — the only place a hash URL is assembled |
| `timeline.js` | Date formatting, group summaries, merging tile dates with VOD entries |
| `photos.js` | Photo filtering, clustering, captions — pure |
| `setupBase.js` | The base tile layer, the background layer, the grid |
| `setupLayers.js` | The layers panel and the Leaflet rendering of layer content |
| `setupTimeline.js` | The timeline panel DOM, and `getTileReplacements` |
| `setupCoordinates.js` | The coordinate panel and its marker |
| `setupPermalink.js` | The permalink panel |
| `setupPhotos.js` | The photo layer, its clustering, the lightbox and the photos pane |

Pure logic lives in its own module with `*.test.js` beside it. `test/` holds the
tests that need more than a function: `build.test.js` runs a real build,
`coords-leaflet.test.js` and `init-integration.test.js` stand up real Leaflet
under jsdom with a `@vitest-environment jsdom` pragma (`vite.config.js` still
defaults to `node`).

## Coordinates

Minecraft uses X/Z; Leaflet uses LatLng. `mcProject()` / `mcUnproject()` in
`map.js` convert, over the pure functions in `coords.js`: Minecraft X maps to
Leaflet lng, Minecraft Z to negated lat, with the per-dimension origin offset
`(X0, Z0)` and a scaling ratio.

**Coordinates in data are dimension-native.** The nether's ×8 is never baked into
a file; `dimScale()` applies it at render time.

**No code branches on dimension.** `dimScale()` is the one legitimate exception.
A dimension test anywhere else is how a nether feature lands 8× out of place in
the overworld, silently.

## Dimension switching

`changeDim()` fires two Leaflet events, and the order is load-bearing:

- **`dimchange`** — early. `setupLayerPanel` and `setupTimelinePanel` populate
  their caches on it.
- **`dimviewready`** — after `setView()`. `setupCoordinatePanel` needs it because
  it calls `getCenter()`. So does the photo panel's one-shot `ph` handling.

## URL hash

```
hashObj:
  d       current dimension
  ph      a photo's file stem to open the lightbox on, from a photo permalink.
          An arrival instruction, not state: consumed on the first
          `dimviewready` rather than kept
  by      the photos pane's author filter, as the ids it lets through. State,
          and one filter for the whole map rather than one per dimension.
          Absent is everybody; `[]` is everybody switched off. A `ph` for a
          photo this hides adds that photographer on arrival — see photos.md
  pv      photos stay on the map with the photos tab shut. `1` when they do,
          absent when they do not. One setting for the whole map, like `by`,
          because the checkbox it stands for outlives a dimension switch
  dD      dimension dict, for each dimension:
    c     coords: X, Z, z (zoom)
    v     visible layers — never the photo layers, which are `pv`
    h     timeline: d (date), f (fill), e (exact), p (photo date)
```

### `pv` replaced a layer id, and still reads one

The photos-stay-up state used to ride `v` as the photo layer's id, which worked
— the restore loop switches the layer on and the pane read it back off — but it
published a number `build-data.mjs` hands out as the public interface for a
checkbox, and made the shortest link to a photo-covered map carry a layer list
to say one bit.

So `pv` is written and `v` is still read: `hashPhotosVisible` takes the new key
first and falls back to a photo layer id in `v`, so links already sent out keep
opening the map they described. Nothing writes the old spelling any more —
`hashLayerIds` strips photo layers at all four points where `v` is assembled
(`map.js` twice, `setupPermalink.js`, and the photo permalink in
`setupPhotos.js`), which is the whole boundary between the internal
`visibleLayers` set and the published one.

`visibleLayers` itself is unchanged and still holds the photo layer at runtime.
On arrival the layer is no longer restored from `v`; the photos pane loads it
from the setting on `dimviewready`, which fires after the restore loop and is
the same path a click on the checkbox already took.

`buildPermalinkUrl()` in `lib/permalink.js` is the only place a hash URL is
assembled. Keep it that way — the photo permalink is the second caller and it
found the invariant already true.

## `myMap`

```
myMap:
  dim
  dimCache, for each dimension:
    (everything loaded from data/[dim].json — see data-repo.md)
    visibleLayers   new Set(...)
    timeline:
      date          the date whose terrain is drawn
      fill
      exact
      photoDate     the date whose photos exist — see below
      dateCache, for each date: data from data/[dim]/[date]-[mode].json
        tileReplacements, for each tile key: key, scale, pos_x, pos_z, date
        skip             for any skippable tile key
  layerCache, for each layerId:
    check       the layers-panel checkbox. Absent for a photo layer, which
                has no panel row — the photos pane owns its visibility
    url
    data        loaded from data/[dim]/[layer].json
    dataLayer   the Leaflet layer object
  sidebar       leaflet-sidebar-v2 control
```

## Rendering layer content

`RENDERERS` in `lib/setupLayers.js` maps a key on the layer file (`markers`,
`lines`, `photos`) to the function that draws it. A layer file may carry any
combination of them. **A new kind of content is an entry in that table, not a
branch** — which is how the photo layer was added.

## Two timeline dates

`timeline.date` selects the terrain and `timeline.photoDate` selects which photos
exist. They are equal for every ordinary selection, and differ only for a date
that has photos but no tiles: that row sets `photoDate` to itself and drops
`date` to the nearest earlier tile date. Both persist in the hash (`h.d` and
`h.p`).

**Anything that changes either must fire `timelinechange`**, which is what the
photo layer and the photos pane redraw on.

## Adding a timeline entry kind

`buildTimelineEntries()` in `lib/timeline.js` merges the tile dates with any
number of pre-sorted streams — VODs today — and `SUMMARY_KINDS` in the same file
drives the per-month counts. Both take a new kind without a signature change.
