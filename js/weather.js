// Weather via Open-Meteo (free, no API key).
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';

export const WMO = {
  0: ['Clear', '☀️'], 1: ['Mostly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
  56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
  80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: ['Violent showers', '⛈️'],
  85: ['Snow showers', '🌨️'], 86: ['Snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm + hail', '⛈️'], 99: ['Thunderstorm + hail', '⛈️'],
};
export const describe = (code) => WMO[code] || ['—', '🌡️'];
const isSnow = (c) => [71, 73, 75, 77, 85, 86].includes(c);
const isRainCode = (c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather service error (${res.status})`);
  return res.json();
}

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location not available'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? 'Location permission denied' : 'Could not get location')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 15 * 60 * 1000 }
    );
  });
}

export async function searchPlaces(query) {
  if (!query || query.trim().length < 2) return [];
  const data = await getJSON(`${GEOCODE}?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`);
  return (data.results || []).map((r) => ({
    name: r.name,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    country: r.country,
    countryCode: r.country_code,
    lat: r.latitude,
    lon: r.longitude,
  }));
}

/**
 * Conditions for one day at a location, focussed on a time window (event hours).
 * Returns a normalised "conditions" object used by the engine.
 */
export async function conditionsFor({ lat, lon, date, fromHour = 9, toHour = 18 }) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'auto',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,uv_index,relative_humidity_2m',
    start_date: date, end_date: date,
  });
  const data = await getJSON(`${FORECAST}?${params}`);
  const h = data.hourly;
  const idx = h.time.map((t, i) => [Number(t.slice(11, 13)), i]).filter(([hr]) => hr >= fromHour && hr <= toHour).map(([, i]) => i);
  const pick = (arr) => idx.map((i) => arr[i]).filter((v) => v != null);
  const temps = pick(h.temperature_2m);
  const feels = pick(h.apparent_temperature);
  const codes = pick(h.weather_code);
  const worst = codes.reduce((a, b) => (b > a ? b : a), 0);
  return normalise({
    tempMin: Math.min(...temps), tempMax: Math.max(...temps),
    feelsMin: Math.min(...feels), feelsMax: Math.max(...feels),
    precipProb: Math.max(0, ...pick(h.precipitation_probability)),
    precipSum: pick(h.precipitation).reduce((a, b) => a + b, 0),
    wind: Math.max(0, ...pick(h.wind_speed_10m)),
    uv: Math.max(0, ...pick(h.uv_index)),
    humidity: avg(pick(h.relative_humidity_2m)),
    code: worst,
    source: 'forecast',
  });
}

/** Daily conditions for a trip. Uses the 16-day forecast when possible, else last year's actual weather as a climate estimate. */
export async function tripConditions({ lat, lon, startDate, endDate }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(endDate + 'T00:00:00');
  const daysAhead = Math.round((end - today) / 86400000);
  const daily = 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,weather_code,wind_speed_10m_max';

  if (daysAhead <= 15) {
    const p = new URLSearchParams({
      latitude: lat, longitude: lon, timezone: 'auto', start_date: startDate, end_date: endDate,
      daily: daily + ',precipitation_probability_max,uv_index_max',
    });
    const d = (await getJSON(`${FORECAST}?${p}`)).daily;
    return d.time.map((date, i) => ({
      date,
      ...normalise({
        tempMin: d.temperature_2m_min[i], tempMax: d.temperature_2m_max[i],
        feelsMin: d.apparent_temperature_min[i], feelsMax: d.apparent_temperature_max[i],
        precipProb: d.precipitation_probability_max[i] ?? 0, precipSum: d.precipitation_sum[i] ?? 0,
        wind: d.wind_speed_10m_max[i] ?? 0, uv: d.uv_index_max[i] ?? 0, code: d.weather_code[i] ?? 0,
        source: 'forecast',
      }),
    }));
  }

  // Too far ahead: use the same dates last year.
  const shift = (s) => { const x = new Date(s + 'T00:00:00'); x.setFullYear(x.getFullYear() - 1); return iso(x); };
  const p = new URLSearchParams({ latitude: lat, longitude: lon, timezone: 'auto', start_date: shift(startDate), end_date: shift(endDate), daily });
  const d = (await getJSON(`${ARCHIVE}?${p}`)).daily;
  const tripDays = dateRange(startDate, endDate);
  return tripDays.map((date, i) => ({
    date,
    ...normalise({
      tempMin: d.temperature_2m_min[i], tempMax: d.temperature_2m_max[i],
      feelsMin: d.apparent_temperature_min[i], feelsMax: d.apparent_temperature_max[i],
      precipProb: (d.precipitation_sum[i] ?? 0) > 1 ? 70 : (d.precipitation_sum[i] ?? 0) > 0.2 ? 40 : 10,
      precipSum: d.precipitation_sum[i] ?? 0, wind: d.wind_speed_10m_max[i] ?? 0, uv: 5, code: d.weather_code[i] ?? 0,
      source: 'typical',
    }),
  }));
}

function normalise(c) {
  const rain = c.precipProb >= 50 || c.precipSum >= 1 || isRainCode(c.code);
  const snow = isSnow(c.code);
  // The temperature the outfit should be dressed for: lean towards the colder part of the window.
  const dressTemp = c.feelsMin + (c.feelsMax - c.feelsMin) * 0.35;
  const [label, icon] = describe(c.code);
  return { ...c, rain, snow, dressTemp: round1(dressTemp), windy: c.wind >= 30, label, icon, swing: c.tempMax - c.tempMin };
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const round1 = (n) => Math.round(n * 10) / 10;
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function dateRange(start, end) {
  const out = [];
  const d = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  while (d <= e && out.length < 60) { out.push(iso(d)); d.setDate(d.getDate() + 1); }
  return out;
}

export function fmtTemp(c, unit) {
  if (c == null || Number.isNaN(c)) return '—';
  return unit === 'F' ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`;
}
