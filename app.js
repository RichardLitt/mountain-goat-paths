const DATA_URL = './data/mtgoats.json';

const escapeHTML = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

function buildReverseIndex(data) {
  const locToRefs = new Map();
  const ensure = (locId) => {
    if (!locToRefs.has(locId)) locToRefs.set(locId, { albums: [], songs: [] });
    return locToRefs.get(locId);
  };
  for (const [albumId, album] of Object.entries(data.albums)) {
    for (const locId of album.locations || []) ensure(locId).albums.push(albumId);
  }
  for (const [songId, song] of Object.entries(data.songs)) {
    for (const locId of song.locations || []) ensure(locId).songs.push(songId);
  }
  return locToRefs;
}

function popupHTML(loc, refs, data) {
  const albumItems = refs.albums.map((aid) => {
    const album = data.albums[aid];
    const yr = album.year ? ` (${album.year})` : '';
    return `<li><span class="popup-tag">album</span> <strong>${escapeHTML(album.title)}</strong>${yr}</li>`;
  }).join('');
  const songItems = refs.songs.map((sid) => {
    const song = data.songs[sid];
    const album = song.album ? data.albums[song.album] : null;
    return `<li><span class="popup-tag">song</span> <strong>${escapeHTML(song.title)}</strong>${album ? ` <span class="popup-album">— ${escapeHTML(album.title)}</span>` : ''}</li>`;
  }).join('');
  return `
    <div>
      <strong>${escapeHTML(loc.name)}</strong><br />
      <span class="popup-album">${escapeHTML(loc.display)}</span>
      <ul class="popup-songs">${albumItems}${songItems}</ul>
    </div>
  `;
}

async function main() {
  const map = L.map('map').setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  let data;
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    document.getElementById('count').textContent = `Could not load data: ${err.message}`;
    return;
  }

  const reverseIndex = buildReverseIndex(data);
  const markers = new Map();
  const bounds = [];

  for (const [locId, loc] of Object.entries(data.locations)) {
    const refs = reverseIndex.get(locId);
    if (!refs || (!refs.albums.length && !refs.songs.length)) continue;
    const m = L.marker([loc.lat, loc.lng]).addTo(map);
    m.bindPopup(popupHTML(loc, refs, data));
    markers.set(locId, m);
    bounds.push([loc.lat, loc.lng]);
  }

  if (bounds.length === 1) {
    map.setView(bounds[0], 8);
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }

  const list = document.getElementById('locations');
  const count = document.getElementById('count');
  const search = document.getElementById('search');

  const entries = Array.from(reverseIndex.entries())
    .map(([locId, refs]) => ({ locId, loc: data.locations[locId], refs }))
    .filter((e) => e.loc)
    .sort((a, b) => a.loc.name.localeCompare(b.loc.name));

  const totalSongs = Object.keys(data.songs).length;
  const totalAlbums = Object.keys(data.albums).length;

  function render(filter = '') {
    const f = filter.trim().toLowerCase();
    const visible = f
      ? entries.filter((e) => e.loc.name.toLowerCase().includes(f) || (e.loc.display || '').toLowerCase().includes(f))
      : entries;
    count.textContent = `${visible.length} place${visible.length === 1 ? '' : 's'} · ${totalSongs} song${totalSongs === 1 ? '' : 's'} · ${totalAlbums} album${totalAlbums === 1 ? '' : 's'}`;
    list.innerHTML = visible.map((e) => {
      const parts = [];
      if (e.refs.albums.length) parts.push(`${e.refs.albums.length} album${e.refs.albums.length === 1 ? '' : 's'}`);
      if (e.refs.songs.length) parts.push(`${e.refs.songs.length} song${e.refs.songs.length === 1 ? '' : 's'}`);
      const region = e.loc.admin1 || e.loc.country || '';
      return `
        <li data-loc="${escapeHTML(e.locId)}">
          <div class="name">${escapeHTML(e.loc.name)}</div>
          <div class="meta">${parts.join(' · ')}${region ? ` · ${escapeHTML(region)}` : ''}</div>
        </li>
      `;
    }).join('');
  }

  list.addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-loc]');
    if (!li) return;
    const m = markers.get(li.dataset.loc);
    if (!m) return;
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 8));
    m.openPopup();
  });

  search.addEventListener('input', (ev) => render(ev.target.value));
  render();
}

main();
