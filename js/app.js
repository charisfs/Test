import { db, settings, uid, requestPersistence, exportAll, importAll } from './db.js';
import { CATEGORIES, CATEGORY_ORDER, COLORS, TAGS, OCCASIONS, PLACES, TRIP_ACTIVITIES } from './data.js';
import { currentPosition, searchPlaces, conditionsFor, tripConditions, fmtTemp, iso, dateRange } from './weather.js';
import { makeContext, recommend, piecesOf } from './engine.js';
import { defaultSchedule, planTrip, essentials, occasionLabel } from './travel.js';
import { aiRecommend, aiTagPhoto, aiTripTips, hasKey } from './ai.js';
import { h, toast, openSheet, closeSheet, thumb, catLabel, resizeImage, segmented, spinner, fmtDate, swatchBg } from './ui.js';
import { SAMPLE_WARDROBE } from './sample.js';

// ---------------- state ----------------
const state = {
  tab: 'today',
  items: [],
  unit: 'C',
  today: {
    date: iso(new Date()),
    window: 'day',
    occasion: 'casual',
    place: 'mixed',
    placeNote: '',
    notes: '',
    location: null, // {label, lat, lon} or null = current location
    weather: null,
    results: null,
    aiResults: null,
  },
  wardrobeFilter: 'all',
  wardrobeSearch: '',
  openTripId: null,
};

const WINDOWS = { morning: ['Morning', 7, 12], day: ['Daytime', 9, 18], evening: ['Evening', 17, 23], all: ['All day', 7, 22] };
const view = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const actionEl = document.getElementById('topbar-action');
const byId = () => new Map(state.items.map((i) => [i.id, i]));

// ---------------- boot ----------------
async function boot() {
  state.items = await db.all('items');
  state.unit = await settings.get('unit', 'C');
  const saved = await settings.get('todayPrefs', null);
  if (saved) Object.assign(state.today, { occasion: saved.occasion, place: saved.place, window: saved.window, location: saved.location });
  requestPersistence();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  document.querySelectorAll('.tabbar button').forEach((b) =>
    b.addEventListener('click', () => go(b.dataset.tab)));
  const start = location.hash.replace('#', '');
  go(['today', 'wardrobe', 'travel', 'settings'].includes(start) ? start : (state.items.length ? 'today' : 'wardrobe'));
}

function go(tab) {
  state.tab = tab;
  history.replaceState(null, '', '#' + tab);
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  actionEl.replaceChildren();
  ({ today: renderToday, wardrobe: renderWardrobe, travel: renderTravel, settings: renderSettings })[tab]();
  window.scrollTo(0, 0);
}

function saveTodayPrefs() {
  const t = state.today;
  settings.set('todayPrefs', { occasion: t.occasion, place: t.place, window: t.window, location: t.location });
}

// =====================================================================
// TODAY / OUTFIT
// =====================================================================
function renderToday() {
  titleEl.textContent = 'What to wear';
  const t = state.today;

  if (!state.items.length) {
    view.replaceChildren(emptyWardrobeCard());
    return;
  }

  const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 15);

  const locLabel = h('span', {}, t.location ? t.location.label : '📍 Current location');
  const weatherBox = h('div', { class: 'weather-box' }, t.weather ? weatherCard(t.weather) : h('p', { class: 'muted' }, 'Weather loads when you get suggestions.'));

  const occGrid = h('div', { class: 'chip-grid' },
    Object.entries(OCCASIONS).map(([k, o]) => h('button', {
      type: 'button', class: 'chip' + (k === t.occasion ? ' on' : ''),
      onclick: (e) => { t.occasion = k; occGrid.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); saveTodayPrefs(); },
    }, `${o.icon} ${o.label}`)));

  const form = h('section', { class: 'card' },
    h('div', { class: 'row2' },
      h('label', { class: 'field' }, h('span', {}, 'Day'),
        h('input', { type: 'date', value: t.date, min: iso(new Date()), max: iso(maxDate), onchange: (e) => { t.date = e.target.value || iso(new Date()); t.weather = null; } })),
      h('label', { class: 'field' }, h('span', {}, 'When'),
        h('select', { onchange: (e) => { t.window = e.target.value; t.weather = null; saveTodayPrefs(); } },
          Object.entries(WINDOWS).map(([k, [lab]]) => h('option', { value: k, selected: k === t.window }, lab))))),
    h('div', { class: 'field' }, h('span', {}, 'Where'),
      h('button', { type: 'button', class: 'input-like', onclick: () => pickLocation((loc) => { t.location = loc; t.weather = null; locLabel.textContent = loc ? loc.label : '📍 Current location'; saveTodayPrefs(); }) }, locLabel)),
    h('div', { class: 'field' }, h('span', {}, 'Occasion / event'), occGrid),
    h('div', { class: 'field' }, h('span', {}, 'Setting'),
      segmented(Object.entries(PLACES).map(([k, p]) => [k, p.label]), t.place, (v) => { t.place = v; saveTodayPrefs(); })),
    h('label', { class: 'field' }, h('span', {}, 'Place (optional)'),
      h('input', { type: 'text', placeholder: 'e.g. rooftop bar, temple, client office', value: t.placeNote, oninput: (e) => { t.placeNote = e.target.value; } })),
    h('label', { class: 'field' }, h('span', {}, 'Notes for the AI stylist (optional)'),
      h('input', { type: 'text', placeholder: 'e.g. lots of walking, want to look taller', value: t.notes, oninput: (e) => { t.notes = e.target.value; } })),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onclick: () => suggest(false) }, '✨ Suggest outfits'),
      h('button', { class: 'btn', onclick: () => suggest(true) }, '🤖 Ask AI stylist')),
  );

  const results = h('div', { id: 'results' });
  view.replaceChildren(weatherBox, form, results);
  renderResults();
}

async function loadWeather() {
  const t = state.today;
  const [, from, to] = WINDOWS[t.window];
  let loc = t.location;
  if (!loc) {
    const pos = await currentPosition();
    loc = { ...pos, label: 'Current location' };
  }
  t.weather = await conditionsFor({ lat: loc.lat, lon: loc.lon, date: t.date, fromHour: from, toHour: to });
  t.weather.place = loc.label;
}

async function suggest(useAI) {
  const t = state.today;
  const results = document.getElementById('results');
  const wbox = view.querySelector('.weather-box');
  results.replaceChildren(spinner(useAI ? 'Your AI stylist is thinking…' : 'Checking the weather…'));
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!t.weather) {
    try {
      await loadWeather();
      wbox.replaceChildren(weatherCard(t.weather));
    } catch (e) {
      toast(`${e.message} — suggesting without weather`);
      wbox.replaceChildren(h('p', { class: 'muted' }, `Weather unavailable (${e.message}). Tip: set a city under “Where”.`));
    }
  }
  const ctx = makeContext({ occasion: t.occasion, place: t.place, weather: t.weather, placeNote: t.placeNote });
  t.results = recommend(state.items, ctx, { count: 3 });
  t.aiResults = null;

  if (useAI) {
    if (!(await hasKey())) {
      toast('Add your Anthropic API key in Settings to use the AI stylist');
    } else {
      try {
        t.aiResults = await aiRecommend({ items: state.items, ctx, unit: state.unit, notes: t.notes });
      } catch (e) {
        toast(e.message, 4000);
      }
    }
  }
  t.ctx = ctx;
  renderResults();
}

function renderResults() {
  const t = state.today;
  const results = document.getElementById('results');
  if (!results || !t.results) return;
  const map = byId();
  const blocks = [];

  if (t.aiResults && t.aiResults.outfits.length) {
    blocks.push(h('h3', { class: 'section-title' }, '🤖 AI stylist picks'));
    t.aiResults.outfits.forEach((o) => {
      const pieces = o.ids.map((id) => map.get(id)).filter(Boolean);
      blocks.push(outfitCard({ title: o.title, pieces, reasons: [o.why], tips: o.tip ? [o.tip] : [], ai: true }));
    });
    if (t.aiResults.gaps.length) blocks.push(gapCard(t.aiResults.gaps));
  }

  if (t.results.outfits.length) {
    blocks.push(h('div', { class: 'section-head' },
      h('h3', { class: 'section-title' }, t.aiResults ? 'More ideas' : 'Your best options'),
      h('button', { class: 'link', onclick: () => { t.results = recommend(state.items, t.ctx, { count: 3, jitter: 18 }); renderResults(); } }, '🔀 Shuffle')));
    t.results.outfits.forEach((o, i) => blocks.push(outfitCard({
      title: i === 0 ? 'Top pick' : `Option ${i + 1}`, pieces: piecesOf(o), score: o.score, reasons: o.reasons, tips: o.tips,
    })));
  } else {
    blocks.push(h('div', { class: 'card empty' }, h('p', {}, 'No complete outfit fits this occasion yet.')));
  }
  if (!t.aiResults && t.results.missing.length) blocks.push(gapCard(t.results.missing));
  results.replaceChildren(...blocks);
}

function outfitCard({ title, pieces, score, reasons = [], tips = [], ai = false }) {
  return h('article', { class: 'card outfit' + (ai ? ' ai' : '') },
    h('div', { class: 'outfit-head' },
      h('h4', {}, title),
      score != null ? h('span', { class: 'score', title: 'Match score' }, `${score}%`) : null),
    h('div', { class: 'pieces' }, pieces.map((p) => h('button', { class: 'piece', onclick: () => editItem(p) }, thumb(p), h('span', {}, p.name || p.type)))),
    reasons.length ? h('ul', { class: 'reasons' }, reasons.slice(0, 4).map((r) => h('li', {}, r))) : null,
    tips.length ? h('ul', { class: 'tips' }, tips.map((r) => h('li', {}, r))) : null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', onclick: () => wearOutfit(pieces) }, '✅ Wear this')),
  );
}

function gapCard(list) {
  return h('div', { class: 'card gap' },
    h('h4', {}, '🛍️ Wardrobe gaps'),
    h('p', { class: 'muted' }, 'Worth adding for days like this:'),
    h('ul', {}, list.map((g) => h('li', {}, g))));
}

async function wearOutfit(pieces) {
  const now = new Date().toISOString();
  for (const p of pieces) {
    p.lastWorn = now;
    p.wearCount = (p.wearCount || 0) + 1;
    await db.put('items', p);
  }
  await db.put('history', { id: uid(), date: now, occasion: state.today.occasion, ids: pieces.map((p) => p.id) });
  toast('Logged! These pieces will rest for a few days 👌');
}

function weatherCard(w) {
  const u = state.unit;
  return h('div', { class: 'card weather' },
    h('div', { class: 'w-icon' }, w.icon),
    h('div', {},
      h('div', { class: 'w-temp' }, `${fmtTemp(w.tempMin, u)} – ${fmtTemp(w.tempMax, u)}`),
      h('div', { class: 'muted' }, `${w.label} · feels ${fmtTemp(w.feelsMin, u)}–${fmtTemp(w.feelsMax, u)}`),
      h('div', { class: 'w-meta' },
        h('span', {}, `💧 ${Math.round(w.precipProb)}%`),
        h('span', {}, `💨 ${Math.round(w.wind)} km/h`),
        w.uv != null ? h('span', {}, `☀️ UV ${Math.round(w.uv)}`) : null),
      w.place ? h('div', { class: 'muted tiny' }, w.place) : null));
}

// ---------- location picker (shared by Today + Travel) ----------
function pickLocation(onPick, { allowCurrent = true } = {}) {
  const list = h('div', { class: 'list' });
  let timer;
  const input = h('input', {
    type: 'search', placeholder: 'Search city…', autocomplete: 'off',
    oninput: (e) => {
      clearTimeout(timer);
      const q = e.target.value;
      timer = setTimeout(async () => {
        try {
          const res = await searchPlaces(q);
          list.replaceChildren(...res.map((r) => h('button', { class: 'list-item', onclick: () => { onPick(r); closeSheet(); } }, r.label)));
          if (!res.length && q.length > 1) list.replaceChildren(h('p', { class: 'muted' }, 'No matches'));
        } catch (err) { list.replaceChildren(h('p', { class: 'muted' }, err.message)); }
      }, 300);
    },
  });
  openSheet('Location', h('div', {},
    input,
    allowCurrent ? h('button', { class: 'list-item', onclick: () => { onPick(null); closeSheet(); } }, '📍 Use my current location') : null,
    list));
  setTimeout(() => input.focus(), 250);
}

// =====================================================================
// WARDROBE
// =====================================================================
function emptyWardrobeCard() {
  return h('section', { class: 'card empty' },
    h('div', { class: 'big-emoji' }, '👗👕👟'),
    h('h3', {}, 'Build your wardrobe'),
    h('p', { class: 'muted' }, 'Snap photos of your clothes, or start with a sample wardrobe to try things out.'),
    h('div', { class: 'btn-col' },
      h('button', { class: 'btn primary', onclick: () => editItem(null) }, '📸 Add my first item'),
      h('button', { class: 'btn', onclick: loadSample }, 'Load sample wardrobe')));
}

async function loadSample() {
  const now = Date.now();
  const items = SAMPLE_WARDROBE.map((s, i) => ({ ...s, id: uid(), createdAt: now + i, wearCount: 0, sample: true }));
  await db.putMany('items', items);
  state.items = await db.all('items');
  toast(`Added ${items.length} sample items`);
  go(state.tab);
}

function renderWardrobe() {
  titleEl.textContent = 'Wardrobe';
  actionEl.replaceChildren(h('button', { class: 'btn small primary', onclick: () => editItem(null) }, '+ Add'));
  if (!state.items.length) { view.replaceChildren(emptyWardrobeCard()); return; }

  const f = state.wardrobeFilter;
  const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, state.items.filter((i) => i.category === c).length]));
  const filters = h('div', { class: 'filters' },
    [['all', `All ${state.items.length}`], ...CATEGORY_ORDER.filter((c) => counts[c]).map((c) => [c, `${CATEGORIES[c].label} ${counts[c]}`])]
      .map(([k, lab]) => h('button', { class: 'chip' + (k === f ? ' on' : ''), onclick: () => { state.wardrobeFilter = k; renderWardrobe(); } }, lab)));

  const grid = h('div', { class: 'grid' });
  const draw = () => {
    const q = state.wardrobeSearch.toLowerCase();
    const shown = state.items
      .filter((i) => f === 'all' || i.category === f)
      .filter((i) => !q || [i.name, i.type, i.color, ...(i.tags || [])].join(' ').toLowerCase().includes(q))
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || (b.createdAt || 0) - (a.createdAt || 0));
    grid.replaceChildren(...shown.map((i) => h('button', { class: 'tile' + (i.archived ? ' archived' : ''), onclick: () => editItem(i) },
      thumb(i),
      i.favorite ? h('span', { class: 'fav' }, '♥') : null,
      h('span', { class: 'tile-name' }, i.name || i.type),
      h('span', { class: 'tile-sub' }, `${catLabel(i.category)} · worn ${i.wearCount || 0}×`))));
    if (!shown.length) grid.replaceChildren(h('p', { class: 'muted' }, 'Nothing here yet.'));
  };
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search colour, type, tag…', value: state.wardrobeSearch, oninput: (e) => { state.wardrobeSearch = e.target.value; draw(); } });
  draw();
  view.replaceChildren(search, filters, grid);
}

function editItem(existing) {
  const isNew = !existing;
  const it = existing ? { ...existing, tags: [...(existing.tags || [])] } : {
    id: uid(), name: '', category: 'top', type: 'T-shirt', color: 'black', pattern: 'solid',
    warmth: 2, formality: 2, tags: [], favorite: false, wearCount: 0, createdAt: Date.now(), photo: null,
  };

  const photoBox = h('div', { class: 'photo-box' });
  const drawPhoto = () => photoBox.replaceChildren(it.photo ? h('img', { src: it.photo, alt: '' }) : h('div', { class: 'photo-empty' }, '📸', h('span', {}, 'Add a photo')));
  drawPhoto();

  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'hidden', onchange: async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { it.photo = await resizeImage(file); drawPhoto(); aiBtn.disabled = false; } catch (err) { toast(err.message); }
  } });
  const cameraInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden' });
  cameraInput.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { it.photo = await resizeImage(file); drawPhoto(); aiBtn.disabled = false; } catch (err) { toast(err.message); }
  });

  const aiBtn = h('button', { type: 'button', class: 'btn small', disabled: !it.photo, onclick: async () => {
    if (!(await hasKey())) { toast('Add your Anthropic API key in Settings first'); return; }
    aiBtn.disabled = true; aiBtn.textContent = '🤖 Looking…';
    try {
      const r = await aiTagPhoto(it.photo);
      Object.assign(it, r, { tags: r.tags || [] });
      redraw();
      toast('Filled in from the photo — check & save');
    } catch (err) { toast(err.message, 4000); }
    aiBtn.disabled = false; aiBtn.textContent = '🤖 Auto-fill with AI';
  } }, '🤖 Auto-fill with AI');

  const fields = h('div');
  const redraw = () => {
    const typeSel = h('select', { onchange: (e) => { it.type = e.target.value; } },
      CATEGORIES[it.category].types.map((t) => h('option', { value: t, selected: t === it.type }, t)));
    if (!CATEGORIES[it.category].types.includes(it.type)) it.type = CATEGORIES[it.category].types[0];

    fields.replaceChildren(
      h('label', { class: 'field' }, h('span', {}, 'Name'),
        h('input', { type: 'text', value: it.name, placeholder: 'e.g. Navy linen shirt', oninput: (e) => { it.name = e.target.value; } })),
      h('div', { class: 'row2' },
        h('label', { class: 'field' }, h('span', {}, 'Category'),
          h('select', { onchange: (e) => { it.category = e.target.value; it.type = CATEGORIES[it.category].types[0]; redraw(); } },
            CATEGORY_ORDER.map((c) => h('option', { value: c, selected: c === it.category }, CATEGORIES[c].one)))),
        h('label', { class: 'field' }, h('span', {}, 'Type'), typeSel)),
      h('div', { class: 'field' }, h('span', {}, 'Main colour'),
        h('div', { class: 'swatches' }, Object.keys(COLORS).map((c) => h('button', {
          type: 'button', class: 'swatch' + (c === it.color ? ' on' : ''), title: c, 'aria-label': c,
          style: { background: swatchBg(c) }, onclick: () => { it.color = c; redraw(); },
        }))),
        h('span', { class: 'muted tiny' }, it.color)),
      h('div', { class: 'field' }, h('span', {}, 'Pattern'),
        segmented([['solid', 'Solid'], ['pattern', 'Patterned']], it.pattern || 'solid', (v) => { it.pattern = v; })),
      slider('Warmth', it.warmth, ['Summer-light', 'Light', 'Medium', 'Warm', 'Winter-warm'], (v) => { it.warmth = v; }),
      slider('Formality', it.formality, ['Lounge / sport', 'Casual', 'Smart casual', 'Business', 'Black tie'], (v) => { it.formality = v; }),
      h('div', { class: 'field' }, h('span', {}, 'Tags'),
        h('div', { class: 'chip-grid' }, TAGS.map((t) => h('button', {
          type: 'button', class: 'chip' + (it.tags.includes(t.id) ? ' on' : ''),
          onclick: (e) => { it.tags = it.tags.includes(t.id) ? it.tags.filter((x) => x !== t.id) : [...it.tags, t.id]; e.currentTarget.classList.toggle('on'); },
        }, t.label)))),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!it.favorite, onchange: (e) => { it.favorite = e.target.checked; } }), h('span', {}, '♥ Favourite')),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!it.archived, onchange: (e) => { it.archived = e.target.checked; } }), h('span', {}, 'Away (laundry, lent out, stored) — skip in suggestions')),
      !isNew ? h('p', { class: 'muted tiny' }, `Worn ${it.wearCount || 0}×${it.lastWorn ? ' · last ' + new Date(it.lastWorn).toLocaleDateString() : ''}`) : null,
    );
  };
  redraw();

  const body = h('div', { class: 'item-form' },
    photoBox,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn small', onclick: () => cameraInput.click() }, '📷 Camera'),
      h('button', { type: 'button', class: 'btn small', onclick: () => fileInput.click() }, '🖼️ Library'),
      aiBtn),
    fileInput, cameraInput,
    fields,
    h('div', { class: 'btn-col' },
      h('button', { class: 'btn primary', onclick: async () => {
        if (!it.name) it.name = `${it.color[0].toUpperCase()}${it.color.slice(1)} ${it.type.toLowerCase()}`;
        await db.put('items', it);
        state.items = await db.all('items');
        closeSheet(); toast(isNew ? 'Added to wardrobe' : 'Saved');
        go(state.tab);
      } }, isNew ? 'Add to wardrobe' : 'Save changes'),
      !isNew ? h('button', { class: 'btn danger', onclick: async () => {
        if (!confirm(`Delete “${it.name}”?`)) return;
        await db.del('items', it.id);
        state.items = await db.all('items');
        closeSheet(); toast('Deleted'); go(state.tab);
      } }, 'Delete item') : null),
  );
  openSheet(isNew ? 'New item' : 'Edit item', body);
}

function slider(label, value, names, onChange) {
  const out = h('span', { class: 'muted tiny' }, names[value - 1]);
  return h('label', { class: 'field' }, h('span', {}, label),
    h('input', { type: 'range', min: 1, max: 5, step: 1, value, oninput: (e) => { const v = Number(e.target.value); out.textContent = names[v - 1]; onChange(v); } }),
    out);
}

// =====================================================================
// TRAVEL
// =====================================================================
async function renderTravel() {
  titleEl.textContent = 'Travel';
  if (state.openTripId) return renderTrip(state.openTripId);
  actionEl.replaceChildren(h('button', { class: 'btn small primary', onclick: newTrip }, '+ New trip'));
  const trips = (await db.all('trips')).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (!trips.length) {
    view.replaceChildren(h('section', { class: 'card empty' },
      h('div', { class: 'big-emoji' }, '🧳✈️'),
      h('h3', {}, 'Pack smarter'),
      h('p', { class: 'muted' }, 'Tell me where and when — I’ll check the forecast, plan an outfit for every day from your wardrobe, and build a compact packing list.'),
      h('button', { class: 'btn primary', onclick: newTrip }, 'Plan a trip')));
    return;
  }
  view.replaceChildren(...trips.map((tr) => h('button', { class: 'card trip-row', onclick: () => { state.openTripId = tr.id; renderTravel(); } },
    h('div', { class: 'trip-emoji' }, '🧳'),
    h('div', {},
      h('strong', {}, tr.destination.label),
      h('div', { class: 'muted' }, `${fmtDate(tr.startDate)} – ${fmtDate(tr.endDate)} · ${tr.days.length} days · ${tr.packedIds.length} pieces`)))));
}

function newTrip() {
  if (!state.items.length) { toast('Add some clothes to your wardrobe first'); return; }
  const today = new Date();
  const start = new Date(today); start.setDate(start.getDate() + 3);
  const end = new Date(start); end.setDate(end.getDate() + 4);
  const draft = { destination: null, startDate: iso(start), endDate: iso(end), activities: ['sightseeing', 'casual'], laundry: false };

  const destBtn = h('button', { type: 'button', class: 'input-like' }, 'Choose destination…');
  destBtn.onclick = () => pickLocation((loc) => { draft.destination = loc; destBtn.textContent = loc.label; setTimeout(() => newTripSheet(), 50); }, { allowCurrent: false });

  const newTripSheet = () => openSheet('New trip', h('div', {},
    h('div', { class: 'field' }, h('span', {}, 'Destination'), destBtn),
    h('div', { class: 'row2' },
      h('label', { class: 'field' }, h('span', {}, 'From'), h('input', { type: 'date', value: draft.startDate, min: iso(today), onchange: (e) => { draft.startDate = e.target.value; } })),
      h('label', { class: 'field' }, h('span', {}, 'To'), h('input', { type: 'date', value: draft.endDate, min: iso(today), onchange: (e) => { draft.endDate = e.target.value; } }))),
    h('div', { class: 'field' }, h('span', {}, 'What will you be doing?'),
      h('div', { class: 'chip-grid' }, TRIP_ACTIVITIES.map((a) => h('button', {
        type: 'button', class: 'chip' + (draft.activities.includes(a) ? ' on' : ''),
        onclick: (e) => { draft.activities = draft.activities.includes(a) ? draft.activities.filter((x) => x !== a) : [...draft.activities, a]; e.currentTarget.classList.toggle('on'); },
      }, `${OCCASIONS[a].icon} ${OCCASIONS[a].label}`)))),
    h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: draft.laundry, onchange: (e) => { draft.laundry = e.target.checked; } }), h('span', {}, 'I can do laundry there')),
    h('p', { class: 'muted tiny' }, 'Forecast is used for trips within 16 days; further out, I use last year’s weather on the same dates as a guide.'),
    h('button', { class: 'btn primary wide', onclick: async (e) => {
      if (!draft.destination) { toast('Choose a destination'); return; }
      if (draft.endDate < draft.startDate) { toast('End date is before start date'); return; }
      if (dateRange(draft.startDate, draft.endDate).length > 30) { toast('Trips up to 30 days, please'); return; }
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'Planning…';
      try {
        const trip = await buildTrip({ id: uid(), ...draft, checked: {}, createdAt: Date.now() });
        await db.put('trips', trip);
        closeSheet();
        state.openTripId = trip.id;
        renderTravel();
      } catch (err) {
        toast(err.message, 4000);
        e.currentTarget.disabled = false; e.currentTarget.textContent = 'Plan my trip';
      }
    } }, 'Plan my trip')));
  newTripSheet();
}

/** Fetch weather, make a schedule (or keep the user's edits) and plan outfits. */
async function buildTrip(trip, keepSchedule = false) {
  const dates = dateRange(trip.startDate, trip.endDate);
  let weather = trip.weather;
  if (!weather || !keepSchedule) {
    weather = await tripConditions({ lat: trip.destination.lat, lon: trip.destination.lon, startDate: trip.startDate, endDate: trip.endDate });
  }
  const schedule = keepSchedule && trip.schedule ? trip.schedule : defaultSchedule(dates, trip.activities);
  const days = schedule.map((s, i) => ({ ...s, weather: weather[i] }));
  const plan = planTrip(state.items, days, { laundry: trip.laundry });
  return {
    ...trip,
    weather,
    schedule,
    // Store only ids so edits to items show up in the plan.
    days: plan.days.map((d) => ({
      date: d.date,
      looks: d.looks.map((l) => ({
        occasion: l.occasion, place: l.place,
        ids: l.outfit ? piecesOf(l.outfit).map((p) => p.id) : [],
        score: l.outfit ? l.outfit.score : null,
        tips: l.outfit ? l.outfit.tips : [],
      })),
    })),
    packedIds: plan.packedIds,
    aiTips: keepSchedule ? trip.aiTips : null,
  };
}

async function renderTrip(id) {
  const trip = await db.get('trips', id);
  if (!trip) { state.openTripId = null; return renderTravel(); }
  const map = byId();
  const u = state.unit;
  titleEl.textContent = trip.destination.name || 'Trip';
  actionEl.replaceChildren(h('button', { class: 'btn small', onclick: () => { state.openTripId = null; renderTravel(); } }, '‹ Trips'));

  const days = trip.days.map((d, i) => ({ ...d, weather: trip.weather[i] }));
  const packedItems = trip.packedIds.map((pid) => map.get(pid)).filter(Boolean);
  const save = async () => { await db.put('trips', trip); };
  const replan = async () => {
    view.prepend(spinner('Re-planning…'));
    const fresh = await buildTrip(trip, true);
    Object.assign(trip, fresh);
    await save();
    renderTrip(id);
  };

  const typical = trip.weather.some((w) => w.source === 'typical');
  const header = h('section', { class: 'card' },
    h('h3', {}, trip.destination.label),
    h('p', { class: 'muted' }, `${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)} · ${days.length} days${trip.laundry ? ' · laundry ✓' : ''}`),
    h('div', { class: 'stats' },
      stat(packedItems.length, 'pieces to pack'),
      stat(days.reduce((a, d) => a + d.looks.length, 0), 'outfits planned'),
      stat(fmtTemp(Math.min(...trip.weather.map((w) => w.tempMin)), u) + '–' + fmtTemp(Math.max(...trip.weather.map((w) => w.tempMax)), u), 'temperature')),
    typical ? h('p', { class: 'muted tiny' }, 'ℹ️ Trip is beyond the 16-day forecast — weather shown is last year’s on the same dates. Re-plan closer to departure for a real forecast.') : null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', onclick: async () => {
        view.prepend(spinner('Refreshing forecast…'));
        try { Object.assign(trip, await buildTrip({ ...trip, weather: null }, true)); await save(); } catch (e) { toast(e.message); }
        renderTrip(id);
      } }, '🔄 Refresh weather'),
      h('button', { class: 'btn small', onclick: () => tripTips(trip, days, packedItems, save, id) }, '🤖 AI travel tips')),
  );

  const tipsCard = trip.aiTips && trip.aiTips.length ? h('section', { class: 'card ai' },
    h('h4', {}, '🤖 Tips for ' + (trip.destination.name || 'your trip')),
    h('ul', { class: 'tips' }, trip.aiTips.map((t) => h('li', {}, t)))) : null;

  // Day by day
  const dayCards = days.map((d, di) => h('section', { class: 'card day' },
    h('div', { class: 'day-head' },
      h('div', {}, h('strong', {}, `Day ${di + 1}`), h('span', { class: 'muted' }, ' · ' + fmtDate(d.date))),
      d.weather ? h('div', { class: 'day-wx' }, `${d.weather.icon} ${fmtTemp(d.weather.tempMin, u)}–${fmtTemp(d.weather.tempMax, u)}${d.weather.rain ? ' 💧' : ''}`) : null),
    d.looks.map((l, li) => h('div', { class: 'look' },
      h('div', { class: 'look-head' },
        h('select', { class: 'mini-select', onchange: async (e) => { trip.schedule[di].looks[li].occasion = e.target.value; await replan(); } },
          Object.keys(OCCASIONS).map((k) => h('option', { value: k, selected: k === l.occasion }, occasionLabel(k)))),
        li > 0 || d.looks.length > 1 ? h('button', { class: 'link', onclick: async () => { trip.schedule[di].looks.splice(li, 1); await replan(); } }, 'Remove') : null),
      l.ids.length
        ? h('div', { class: 'pieces small' }, l.ids.map((pid) => map.get(pid)).filter(Boolean).map((p) => h('div', { class: 'piece' }, thumb(p), h('span', {}, p.name || p.type))))
        : h('p', { class: 'muted' }, 'No suitable outfit in your wardrobe for this.'),
      l.tips && l.tips.length ? h('ul', { class: 'tips' }, l.tips.map((t) => h('li', {}, t))) : null)),
    h('button', { class: 'link', onclick: async () => { trip.schedule[di].looks.push({ occasion: 'date', place: 'indoor' }); await replan(); } }, '+ Add evening look')));

  // Packing list
  const checked = trip.checked || (trip.checked = {});
  const checkRow = (key, label, sub, thumbEl) => h('label', { class: 'check-row' + (checked[key] ? ' done' : '') },
    h('input', { type: 'checkbox', checked: !!checked[key], onchange: async (e) => { checked[key] = e.target.checked; e.target.closest('.check-row').classList.toggle('done', e.target.checked); await save(); updateProgress(); } }),
    thumbEl || null,
    h('span', {}, label, sub ? h('small', { class: 'muted' }, ' ' + sub) : null));
  const timesWorn = (pid) => trip.days.reduce((a, d) => a + d.looks.filter((l) => l.ids.includes(pid)).length, 0);
  const ess = essentials(trip, days, packedItems);
  const total = packedItems.length + ess.length;
  const progress = h('div', { class: 'progress' }, h('div', { class: 'bar' }));
  const progressLabel = h('span', { class: 'muted tiny' });
  const updateProgress = () => {
    const done = packedItems.filter((p) => checked['i:' + p.id]).length + ess.filter((e) => checked['e:' + e]).length;
    progress.firstChild.style.width = `${total ? (done / total) * 100 : 0}%`;
    progressLabel.textContent = `${done}/${total} packed`;
  };

  const packing = h('section', { class: 'card' },
    h('div', { class: 'section-head' }, h('h3', {}, '🧳 Packing list'), progressLabel),
    progress,
    CATEGORY_ORDER.filter((c) => packedItems.some((p) => p.category === c)).map((c) => h('div', { class: 'pack-group' },
      h('h5', {}, CATEGORIES[c].label),
      packedItems.filter((p) => p.category === c).map((p) => checkRow('i:' + p.id, p.name || p.type, `· ${timesWorn(p.id)}×`, thumb(p, 'xs'))))),
    h('div', { class: 'pack-group' }, h('h5', {}, 'Essentials'), ess.map((e) => checkRow('e:' + e, e))),
  );
  updateProgress();

  const danger = h('div', { class: 'btn-col' },
    h('button', { class: 'btn', onclick: async () => { trip.schedule = defaultSchedule(dateRange(trip.startDate, trip.endDate), trip.activities); await replan(); } }, '↺ Reset day plan'),
    h('button', { class: 'btn danger', onclick: async () => {
      if (!confirm('Delete this trip?')) return;
      await db.del('trips', id); state.openTripId = null; renderTravel();
    } }, 'Delete trip'));

  view.replaceChildren(header, tipsCard || '', packing, h('h3', { class: 'section-title' }, '📅 Day by day'), ...dayCards, danger);
}

async function tripTips(trip, days, packedItems, save, id) {
  if (!(await hasKey())) { toast('Add your Anthropic API key in Settings first'); return; }
  toast('Asking the AI stylist…', 8000);
  try {
    trip.aiTips = await aiTripTips({ trip, days: days.map((d) => ({ ...d })), packedItems, unit: state.unit });
    await save();
    renderTrip(id);
  } catch (e) { toast(e.message, 4000); }
}

const stat = (v, l) => h('div', { class: 'stat' }, h('strong', {}, String(v)), h('span', {}, l));

// =====================================================================
// SETTINGS
// =====================================================================
async function renderSettings() {
  titleEl.textContent = 'Settings';
  const key = await settings.get('apiKey', '');
  const keyInput = h('input', { type: 'password', placeholder: 'sk-ant-…', value: key, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const isStandalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;

  const history = (await db.all('history')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const map = byId();

  view.replaceChildren(
    !isStandalone ? h('section', { class: 'card install' },
      h('h3', {}, '📲 Install on your iPhone'),
      h('ol', {},
        h('li', {}, 'Open this page in Safari'),
        h('li', {}, 'Tap the Share button ', h('b', {}, '⬆︎')),
        h('li', {}, 'Choose ', h('b', {}, 'Add to Home Screen'))),
      h('p', { class: 'muted tiny' }, 'It then opens full-screen like a normal app, works offline, and keeps your wardrobe safe on the device.')) : null,

    h('section', { class: 'card' },
      h('h3', {}, 'Units'),
      segmented([['C', '°C'], ['F', '°F']], state.unit, async (v) => { state.unit = v; await settings.set('unit', v); toast(`Showing temperatures in °${v}`); })),

    h('section', { class: 'card' },
      h('h3', {}, '🤖 AI stylist (optional)'),
      h('p', { class: 'muted' }, 'The app works fully offline with its built-in rules. Add an Anthropic API key to unlock the AI stylist, photo auto-tagging and destination tips. The key is stored only on this phone and sent only to Anthropic.'),
      keyInput,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small primary', onclick: async () => { await settings.set('apiKey', keyInput.value.trim()); toast(keyInput.value.trim() ? 'API key saved' : 'API key removed'); } }, 'Save key'),
        h('a', { class: 'btn small', href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener' }, 'Get a key'))),

    history.length ? h('section', { class: 'card' },
      h('h3', {}, '🗓️ Recently worn'),
      history.map((r) => h('div', { class: 'hist-row' },
        h('span', { class: 'muted tiny' }, new Date(r.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })),
        h('div', { class: 'pieces xs' }, r.ids.map((i) => map.get(i)).filter(Boolean).map((p) => thumb(p, 'xs')))))) : null,

    h('section', { class: 'card' },
      h('h3', {}, '💾 Backup'),
      h('p', { class: 'muted' }, 'Your wardrobe lives on this device. Export a backup now and then (saves to Files / iCloud Drive).'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: doExport }, 'Export backup'),
        h('label', { class: 'btn small' }, 'Import backup', h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: doImport })))),

    h('section', { class: 'card' },
      h('h3', {}, 'Data'),
      h('div', { class: 'btn-col' },
        h('button', { class: 'btn', onclick: loadSample }, 'Add sample wardrobe'),
        state.items.some((i) => i.sample) ? h('button', { class: 'btn', onclick: async () => {
          for (const i of state.items.filter((x) => x.sample)) await db.del('items', i.id);
          state.items = await db.all('items'); toast('Sample items removed'); renderSettings();
        } }, 'Remove sample items') : null,
        h('button', { class: 'btn danger', onclick: async () => {
          if (!confirm('Erase your whole wardrobe, trips and history from this device?')) return;
          for (const s of ['items', 'trips', 'history']) await db.clear(s);
          state.items = []; toast('All data erased'); renderSettings();
        } }, 'Erase all data'))),

    h('p', { class: 'muted tiny center' }, 'Outfitly · weather by Open-Meteo · AI by Claude'),
  );
}

async function doExport() {
  const data = await exportAll();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = `outfitly-backup-${iso(new Date())}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  // iOS: share sheet lets you save to Files; fall back to a download link.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Outfitly backup' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
}

async function doImport(e) {
  const file = e.target.files[0]; if (!file) return;
  try {
    await importAll(JSON.parse(await file.text()));
    state.items = await db.all('items');
    toast('Backup restored');
    renderSettings();
  } catch (err) { toast(err.message); }
}

boot();
