# my-chizu

Generic Minecraft tile-map viewer. Displays tile-based maps of multiple dimensions with historical snapshots, layer overlays, and a timeline control.

Used by [りり村のWeb地図](https://oatmeal.github.io/llmr) — a map for the Minecraft server りりまる村.

## Using this engine for your own map

### 1. Set up your data repo

Your repo needs:

```
data/
  config.json    # per-dimension spatial config
  dates.json     # YYYYMMDD → display label
  vods.json      # [{id, date, title}] — optional VOD links
  overworld/     # layer JSON files
  nether/
  end/
tiles/           # tiles/[dim]/[zoom]/[x]/[z]/[date].png
static/          # optional: og.jpeg, etc.
site.json        # site identity (title, OG tags, about page)
```

See [oatmeal/llmr](https://github.com/oatmeal/llmr) for a reference example.

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
