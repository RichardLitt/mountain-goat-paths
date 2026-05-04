const DATA_URL = './data/mtgoats.json';

const escapeHTML = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

function buildReverseIndex(data) {
  const locToSongs = new Map();
  for (const [songId, song] of Object.entries(data.songs)) {
    for (const locId of song.locations || []) {
      if (!locToSongs.has(locId)) locToSongs.set(locId, []);
      locToSongs.get(locId).push(songId);
    }
  }
  return locToSongs;
}

function popupHTML(loc, songIds, data) {
  const items = songIds.map((sid) => {
    const song = data.songs[sid];
    const album = song.album ? data.albums[song.album] : null;
    return `<li><strong>${escapeHTML(song.title)}</strong>${album ? ` <span class="popup-album">— ${escapeHTML(album.title)}</span>` : ''}</li>`;
  }).join('');
  return `
    <div>
      <strong>${escapeHTML(loc.name)}</strong><br />
      <span class="popup-album">${escapeHTML(loc.display)}</span>
      <ul class="popup-songs">${items}</ul>
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
    const songIds = reverseIndex.get(locId) || [];
    if (!songIds.length) continue;
    const m = L.marker([loc.lat, loc.lng]).addTo(map);
    m.bindPopup(popupHTML(loc, songIds, data));
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
    .map(([locId, songIds]) => ({ locId, loc: data.locations[locId], songIds }))
    .filter((e) => e.loc)
    .sort((a, b) => a.loc.name.localeCompare(b.loc.name));

  function render(filter = '') {
    const f = filter.trim().toLowerCase();
    const visible = f
      ? entries.filter((e) => e.loc.name.toLowerCase().includes(f) || (e.loc.display || '').toLowerCase().includes(f))
      : entries;
    count.textContent = `${visible.length} place${visible.length === 1 ? '' : 's'} · ${Object.keys(data.songs).length} song${Object.keys(data.songs).length === 1 ? '' : 's'}`;
    list.innerHTML = visible.map((e) => `
      <li data-loc="${escapeHTML(e.locId)}">
        <div class="name">${escapeHTML(e.loc.name)}</div>
        <div class="meta">${e.songIds.length} song${e.songIds.length === 1 ? '' : 's'} · ${escapeHTML(e.loc.admin1 || e.loc.country || '')}</div>
      </li>
    `).join('');
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
