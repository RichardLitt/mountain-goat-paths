const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'mountain-goat-paths/0.1 (richard.littauer@gmail.com)';
const RATE_LIMIT_MS = 1100;

let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttle() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < RATE_LIMIT_MS) await sleep(RATE_LIMIT_MS - elapsed);
  lastRequestAt = Date.now();
}

export async function nominatimSearch(query, { limit = 3 } = {}) {
  await throttle();
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=${limit}&addressdetails=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}: ${res.statusText}`);
  return res.json();
}

export function slugify(input) {
  return String(input)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const US_STATE_ABBR = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia',
  kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo',
  montana: 'mt', nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj',
  'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh',
  oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
  'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt',
  virginia: 'va', washington: 'wa', 'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy',
  'district of columbia': 'dc',
};

export function summarize(result) {
  const a = result.address || {};
  const name = a.city || a.town || a.village || a.hamlet || a.suburb || a.county || a.state || result.display_name?.split(',')[0]?.trim() || 'Unknown';
  const country = (a.country_code || '').toUpperCase();
  const admin1 = a.state || a.region || a.province || '';
  return {
    name,
    display: result.display_name,
    lat: Number(result.lat),
    lng: Number(result.lon),
    country: country || null,
    admin1: admin1 || null,
    place_id: result.place_id,
  };
}

export function buildLocationSlug({ name, country, admin1 }) {
  const parts = [slugify(name)];
  if (admin1 && country === 'US') {
    const abbr = US_STATE_ABBR[admin1.toLowerCase()];
    if (abbr) parts.push(abbr);
    else parts.push(slugify(admin1));
  } else if (admin1) {
    parts.push(slugify(admin1));
  }
  if (country) parts.push(country.toLowerCase());
  return parts.filter(Boolean).join('-');
}
