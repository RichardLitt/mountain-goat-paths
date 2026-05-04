# Mountain Goat Paths

A map of places mentioned in [The Mountain Goats](https://en.wikipedia.org/wiki/The_Mountain_Goats) songs.

Static site, hand-curated. Built with [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/), geocoded via [Nominatim](https://nominatim.org/).

## Add an entry

Requires Node 18+. No `npm install` needed — uses only the Node standard library.

```sh
npm run add
```

You'll be prompted for:

1. **Album** — slugified, reused if it already exists.
2. **Song** — same. If the song already exists, you'll be dropped into "add more locations" mode.
3. **Location** — typed as a place name. The CLI hits Nominatim, shows the top 3 results, and lets you pick. Repeat for as many locations as the song mentions; type `done` to finish.

If a Nominatim lookup returns nothing, fails, or you reject the candidates, the CLI falls back to manual entry (you supply lat/lng and a display name).

Locations are deduplicated by raw query string and by Nominatim `place_id`, so re-running with the same input is safe.

## View the map

The map is a static page — `index.html` + `app.js` + `data/mtgoats.json`. To preview locally:

```sh
npm run serve
# then open http://localhost:8000
```

(Use a real HTTP server, not `file://` — browsers block `fetch` of local files.)

## Deploy

Push to GitHub. Repo Settings → Pages → Source: `Deploy from branch` → `main` / `(root)`. The `.nojekyll` file is already in place.

## Data shape

Single normalized JSON file at `data/mtgoats.json`:

- `albums` — keyed by slug, e.g. `tallahassee`.
- `songs` — keyed by slug, with `album` (FK), `track`, `notes`, and `locations: []` (array of location slugs).
- `locations` — keyed by slug like `tampa-fl-us`, with `name`, `display`, `lat`, `lng`, and a `geocoded` block recording how it was looked up.

Set `manual_override: true` on a location to mark it as hand-curated (the CLI will not overwrite it).

## Nominatim etiquette

The CLI sends a `User-Agent` identifying the project + a contact email, and rate-limits to 1 request per ~1.1 seconds, per the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/). Don't bulk-import; this tool is for adding entries one at a time.
