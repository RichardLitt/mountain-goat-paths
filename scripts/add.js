import { readFile, writeFile, rename } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { nominatimSearch, slugify, summarize, buildLocationSlug } from './geocode.js';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(here, '..', 'data', 'mtgoats.json');
const TMP_PATH = `${DATA_PATH}.tmp`;

const rl = createInterface({ input: stdin, output: stdout });
const ask = (q) => rl.question(q);

function sortKeys(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

async function loadData() {
  const raw = await readFile(DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

async function saveData(data) {
  data.albums = sortKeys(data.albums);
  data.songs = sortKeys(data.songs);
  data.locations = sortKeys(data.locations);
  data.updated = new Date().toISOString().slice(0, 10);
  await writeFile(TMP_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await rename(TMP_PATH, DATA_PATH);
}

async function pickAlbum(data) {
  const title = (await ask('Album: ')).trim();
  if (!title) throw new Error('Album required.');
  const id = slugify(title);
  if (data.albums[id]) {
    console.log(`  → reusing existing album: ${id} (${data.albums[id].title}${data.albums[id].year ? `, ${data.albums[id].year}` : ''})`);
    return id;
  }
  const yearStr = (await ask('  Year (optional): ')).trim();
  const year = yearStr ? Number(yearStr) : null;
  data.albums[id] = { title, ...(year ? { year } : {}) };
  console.log(`  → created album: ${id}`);
  return id;
}

async function pickSong(data, albumId) {
  const title = (await ask('Song: ')).trim();
  if (!title) throw new Error('Song required.');
  const id = slugify(title);
  if (data.songs[id]) {
    if (data.songs[id].album !== albumId) {
      console.log(`  ! song slug '${id}' already exists under album '${data.songs[id].album}', not '${albumId}'.`);
      const confirm = (await ask('  Add this album anyway? [y/N]: ')).trim().toLowerCase();
      if (confirm !== 'y') throw new Error('Aborted.');
    }
    console.log(`  → reusing existing song: ${id} — will add new locations to it.`);
    return id;
  }
  const trackStr = (await ask('  Track # (optional): ')).trim();
  const notes = (await ask('  Notes (optional): ')).trim();
  data.songs[id] = {
    title,
    album: albumId,
    ...(trackStr ? { track: Number(trackStr) } : {}),
    locations: [],
    notes,
  };
  console.log(`  → created song: ${id}`);
  return id;
}

function findLocationByQuery(data, query) {
  const q = query.trim().toLowerCase();
  for (const [id, loc] of Object.entries(data.locations)) {
    if (loc.geocoded?.raw_query?.trim().toLowerCase() === q) return id;
  }
  return null;
}

function findLocationByPlaceId(data, placeId) {
  for (const [id, loc] of Object.entries(data.locations)) {
    if (loc.geocoded?.place_id && Number(loc.geocoded.place_id) === Number(placeId)) return id;
  }
  return null;
}

async function manualLocation(data, query) {
  const name = (await ask('  Display name: ')).trim() || query;
  const lat = Number((await ask('  Latitude: ')).trim());
  const lng = Number((await ask('  Longitude: ')).trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Invalid lat/lng.');
  const country = (await ask('  Country code (e.g. US, optional): ')).trim().toUpperCase() || null;
  const admin1 = (await ask('  Admin1 / state (optional): ')).trim() || null;
  const slug = buildLocationSlug({ name, country, admin1 });
  if (data.locations[slug]) {
    console.log(`  ! slug '${slug}' already taken; appending '-x' suffix.`);
  }
  const id = data.locations[slug] ? `${slug}-x${Object.keys(data.locations).length}` : slug;
  data.locations[id] = {
    name,
    display: name,
    lat,
    lng,
    country,
    admin1,
    geocoded: { source: 'manual', raw_query: query, fetched_at: new Date().toISOString() },
    manual_override: true,
  };
  console.log(`  → created location: ${id}`);
  return id;
}

async function addLocation(data, query) {
  const cachedByQuery = findLocationByQuery(data, query);
  if (cachedByQuery) {
    console.log(`  → reusing cached location: ${cachedByQuery}`);
    return cachedByQuery;
  }

  let results;
  try {
    console.log(`  → querying Nominatim for "${query}"…`);
    results = await nominatimSearch(query);
  } catch (err) {
    console.log(`  ! geocode failed: ${err.message}`);
    console.log('  → falling back to manual entry');
    return manualLocation(data, query);
  }

  if (!results.length) {
    console.log('  ! no results from Nominatim.');
    console.log('  → falling back to manual entry');
    return manualLocation(data, query);
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`  [${i + 1}] ${r.display_name}  (${r.lat}, ${r.lon})`);
  }
  const choice = (await ask(`  Pick [1-${results.length}], 'm' for manual, or 's' to skip: `)).trim().toLowerCase();
  if (choice === 's') return null;
  if (choice === 'm') return manualLocation(data, query);

  const idx = Number(choice || '1') - 1;
  if (!results[idx]) {
    console.log('  ! invalid choice; skipping.');
    return null;
  }
  const summary = summarize(results[idx]);

  const existingByPlaceId = findLocationByPlaceId(data, summary.place_id);
  if (existingByPlaceId) {
    console.log(`  → matches existing location by place_id: ${existingByPlaceId}`);
    return existingByPlaceId;
  }

  let slug = buildLocationSlug(summary);
  if (data.locations[slug]) {
    slug = `${slug}-${summary.place_id}`;
  }
  data.locations[slug] = {
    name: summary.name,
    display: summary.display,
    lat: summary.lat,
    lng: summary.lng,
    country: summary.country,
    admin1: summary.admin1,
    geocoded: {
      source: 'nominatim',
      place_id: summary.place_id,
      raw_query: query,
      fetched_at: new Date().toISOString(),
    },
    manual_override: false,
  };
  console.log(`  → created location: ${slug}`);
  return slug;
}

async function main() {
  const data = await loadData();
  console.log(`Loaded ${Object.keys(data.albums).length} albums, ${Object.keys(data.songs).length} songs, ${Object.keys(data.locations).length} locations.\n`);

  const albumId = await pickAlbum(data);
  const songId = await pickSong(data, albumId);
  const song = data.songs[songId];

  console.log('\nAdd locations (one per prompt). Type "done" when finished.');
  while (true) {
    const q = (await ask('Location: ')).trim();
    if (!q || q.toLowerCase() === 'done') break;
    const locId = await addLocation(data, q);
    if (locId && !song.locations.includes(locId)) {
      song.locations.push(locId);
      console.log(`  → linked ${locId} to ${songId}`);
    } else if (locId) {
      console.log(`  → ${locId} already linked to ${songId}`);
    }
  }

  await saveData(data);
  console.log(`\nSaved → ${DATA_PATH}`);
  rl.close();
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  rl.close();
  process.exit(1);
});
