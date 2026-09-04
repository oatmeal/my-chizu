# my-chizu

Generic Minecraft tile-map viewer. Displays tile-based maps of multiple dimensions with historical snapshots, layer overlays, and a timeline control.

Used by [りり村のWeb地図](https://oatmeal.github.io/llmr) — a map for the Minecraft server りりまる村.

It can also link each snapshot to the stream it came from, and carry a layer of
located, dated screenshots that scrub with the timeline.

Working on the engine itself? Start with [`STATUS.md`](STATUS.md) for where
things stand, then [`docs/`](docs/) for how each part works.

## Using this engine for your own map

### 1. Set up your data repo

Your repo needs:

```
data/
  config.json    # per-dimension spatial config
  dates.json     # YYYYMMDD → display label
  vods.json      # [{id, date, title, t?}] — optional VOD links (YouTube video ids)
  overworld/     # layer JSON files, including the optional photos.json
  nether/
  end/
tiles/           # tiles/[dim]/[zoom]/[x]/[z]/[date].png
photos/          # optional: [date]/[stem].webp plus thumb/[date]/[stem].webp
static/          # optional: og.jpeg, etc.
site.json        # site identity (title, OG tags, about page)
```

See [oatmeal/llmr](https://github.com/oatmeal/llmr) for a reference example, and
[`docs/data-repo.md`](docs/data-repo.md) for the full contract — the layer JSON
schema, `site.json`, and what the build writes.

### 1a. Optional: link stream VODs from the timeline

Entries in `data/vods.json` show up in the timeline as links to the stream a
snapshot came from. You can maintain that file by hand, or point the engine at
your YouTube playlists and let it sync:

```jsonc
// site.json
"vods": {
  "playlists": ["https://www.youtube.com/playlist?list=..."],
  "extraVideos": ["videoId"]        // streams outside those playlists
}
```

```bash
node scripts/sync-vods.mjs /path/to/your-data-repo          # dry run
node scripts/sync-vods.mjs /path/to/your-data-repo --write  # apply
```

This needs [yt-dlp](https://github.com/yt-dlp/yt-dlp) on your PATH. It only ever
appends videos it hasn't seen before, so any titles or dates you fix by hand
stay fixed. Dates are read from a `YYYY年M月D日` substring in the video title
where present, otherwise from the video's YouTube release date.

Titles are stripped of genre tags and the redundant date. To tune that for your
channel, add its boilerplate words under `vods.titleCleanup.vocab`, and give any
title the rules can't salvage a replacement under `vods.titleCleanup.overrides`.

Full details in [`docs/vods.md`](docs/vods.md).

### 1b. Optional: a photo layer

A layer file with `kind: "photos"` draws located, dated screenshots as clustered
thumbnail pins with a lightbox, filtered by the same timeline that selects the
tiles. Point `site.json`'s `photos.baseUrl` / `photos.thumbUrl` at the images.

**If more than one person took them**, give the layer an `authors` block and
each photo a `by`. Every photo is then credited in the lightbox and in the
photos pane, each author gets a colour on the pins and rows, and the pane grows
a filter. Leave both out and the layer draws exactly as it does without them.

The layer file format is in [`docs/data-repo.md`](docs/data-repo.md#a-photo-layer)
and the design in [`docs/photos.md`](docs/photos.md). llmr's own photos are
extracted and reviewed by
[mc-screenshot-to-map](https://github.com/oatmeal/mc-screenshot-to-map).

### 2. Add a GitHub Actions workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    uses: oatmeal/my-chizu/.github/workflows/build.yml@main
```

Enable GitHub Pages in your repo settings (source: GitHub Actions).

### 3. Local builds

```bash
git clone https://github.com/oatmeal/my-chizu
cd my-chizu && npm install
node build.mjs /path/to/your-data-repo
python -m http.server --directory /path/to/your-data-repo/deploy
```

## THANKS TO

### Open source libraries used
- https://leafletjs.com
- https://github.com/ghybs/Leaflet.TileLayer.Fallback
- https://github.com/noerw/leaflet-sidebar-v2

### Icons
- https://uxwing.com

## License

BSD 2-Clause. See [LICENSE](./LICENSE) for full details, including third-party licenses for Leaflet and Leaflet.TileLayer.Fallback.
