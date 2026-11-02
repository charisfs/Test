// Optional AI layer powered by Claude. Uses the user's own Anthropic API key,
// stored only on this device. The app works fully without it (rule-based engine).
import { CATEGORIES, COLORS, TAGS, OCCASIONS, PLACES } from './data.js';
import { settings } from './db.js';

const SDK_URL = 'https://esm.sh/@anthropic-ai/sdk@0.135.0';
const MODEL = 'claude-opus-5-5';

let clientPromise = null;
let clientKey = null;

export async function hasKey() {
  return !!(await settings.get('apiKey', ''));
}

async function client() {
  const apiKey = await settings.get('apiKey', '');
  if (!apiKey) throw new Error('Add your Anthropic API key in Settings to use AI features.');
  if (!clientPromise || clientKey !== apiKey) {
    clientKey = apiKey;
    clientPromise = import(SDK_URL).then(({ default: Anthropic }) =>
      // The key never leaves this phone except to call Anthropic directly.
      new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    );
  }
  return clientPromise;
}

/** One structured-output call. Returns the parsed JSON object. */
async function ask({ system, content, schema, effort = 'low', maxTokens = 16000 }) {
  const c = await client();
  let res;
  try {
    res = await c.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort, format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    const status = err && err.status;
    if (status === 401) throw new Error('Your API key was rejected. Check it in Settings.');
    if (status === 429) throw new Error('Rate limited by the AI service — try again in a minute.');
    if (status >= 500) throw new Error('The AI service is having trouble — try again shortly.');
    throw new Error(err && err.message ? err.message : 'AI request failed (are you online?)');
  }
  if (res.stop_reason === 'refusal') throw new Error('The AI declined this request.');
  if (res.stop_reason === 'max_tokens') throw new Error('The AI response was cut off — try again.');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Could not read the AI response.');
  }
}

// ---------- wardrobe serialisation ----------
function wardrobeLines(items) {
  return items
    .filter((i) => !i.archived)
    .map((i) => {
      const worn = i.lastWorn ? Math.round((Date.now() - new Date(i.lastWorn)) / 86400000) + 'd ago' : 'never';
      return [i.id, i.category, i.type || '', i.name || '', i.color, i.pattern || 'solid',
        `warmth ${i.warmth}/5`, `formality ${i.formality}/5`, (i.tags || []).join(',') || '-', `last worn ${worn}`,
        i.favorite ? 'favourite' : ''].join(' | ');
    })
    .join('\n');
}

function weatherLine(w, unit) {
  if (!w) return 'Weather unknown.';
  const t = (c) => (unit === 'F' ? Math.round(c * 9 / 5 + 32) + '°F' : Math.round(c) + '°C');
  return `${w.label}; ${t(w.tempMin)}–${t(w.tempMax)} (feels ${t(w.feelsMin)}–${t(w.feelsMax)}); ` +
    `rain chance ${Math.round(w.precipProb)}%, ${w.precipSum.toFixed(1)}mm; wind ${Math.round(w.wind)} km/h; UV ${Math.round(w.uv ?? 0)}` +
    (w.source === 'typical' ? ' (typical for this time of year, not a forecast)' : '');
}

const STYLIST_SYSTEM = `You are a warm, practical personal stylist inside an outfit-planning iPhone app.
You may ONLY use clothing the user owns, referenced by the exact item id from their wardrobe list. Never invent items.
A complete outfit is (top + bottom) or a one-piece (dress / jumpsuit / suit), plus shoes; add outerwear when the weather or commute needs it; add accessories or a bag if they genuinely help.
Respect the dress code of the occasion and the norms of the place (e.g. modest cover at places of worship, no white at weddings, comfortable shoes for walking-heavy days).
Dress for the weather the person will actually be exposed to, considering indoor/outdoor time.
Prefer items not worn in the last few days. Keep explanations short, specific and friendly.`;

/** AI outfit suggestions. Returns [{ ids:[], title, why, tip }] plus gaps. */
export async function aiRecommend({ items, ctx, unit, notes = '' }) {
  const ids = new Set(items.map((i) => i.id));
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['outfits', 'wardrobe_gaps'],
    properties: {
      outfits: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['item_ids', 'title', 'why', 'styling_tip'],
          properties: {
            item_ids: { type: 'array', items: { type: 'string' } },
            title: { type: 'string' },
            why: { type: 'string' },
            styling_tip: { type: 'string' },
          },
        },
      },
      wardrobe_gaps: { type: 'array', items: { type: 'string' } },
    },
  };
  const prompt = `Occasion: ${ctx.occ.label}
Setting: ${PLACES[ctx.place].label}${ctx.placeNote ? ` — place: ${ctx.placeNote}` : ''}
Weather: ${weatherLine(ctx.weather, unit)}
${notes ? `Extra notes from me: ${notes}\n` : ''}
My wardrobe (id | category | type | name | colour | pattern | warmth | formality | tags | last worn | fav):
${wardrobeLines(items)}

Suggest up to 3 distinct complete outfits from my wardrobe, best first. If something important is missing for this occasion/weather, list it in wardrobe_gaps (short phrases, max 3).`;

  const out = await ask({ system: STYLIST_SYSTEM, content: prompt, schema, effort: 'medium' });
  const outfits = (out.outfits || [])
    .map((o) => ({ ids: (o.item_ids || []).filter((id) => ids.has(id)), title: o.title, why: o.why, tip: o.styling_tip }))
    .filter((o) => o.ids.length >= 2)
    .slice(0, 3);
  return { outfits, gaps: (out.wardrobe_gaps || []).slice(0, 3) };
}

/** Look at a photo of a garment and fill in the wardrobe form. */
export async function aiTagPhoto(dataUrl) {
  const [, mediaType, b64] = dataUrl.match(/^data:(image\/[a-z]+);base64,(.*)$/) || [];
  if (!b64) throw new Error('Unsupported image');
  const allTypes = [...new Set(Object.values(CATEGORIES).flatMap((c) => c.types))];
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'category', 'type', 'color', 'pattern', 'warmth', 'formality', 'tags'],
    properties: {
      name: { type: 'string', description: 'Short descriptive name, e.g. "Navy linen shirt"' },
      category: { type: 'string', enum: Object.keys(CATEGORIES) },
      type: { type: 'string', enum: allTypes },
      color: { type: 'string', enum: Object.keys(COLORS) },
      pattern: { type: 'string', enum: ['solid', 'pattern'] },
      warmth: { type: 'integer', description: '1 = very light/summer … 5 = very warm/winter' },
      formality: { type: 'integer', description: '1 = very casual/athletic … 5 = black tie' },
      tags: { type: 'array', items: { type: 'string', enum: TAGS.map((t) => t.id) } },
    },
  };
  const out = await ask({
    system: 'You catalogue clothing for a wardrobe app. Describe the single main garment in the photo.',
    content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
      { type: 'text', text: 'Classify this item for my wardrobe.' },
    ],
    schema,
    effort: 'low',
  });
  out.warmth = Math.max(1, Math.min(5, Math.round(out.warmth || 3)));
  out.formality = Math.max(1, Math.min(5, Math.round(out.formality || 3)));
  return out;
}

/** Destination-aware packing advice for a trip plan. */
export async function aiTripTips({ trip, days, packedItems, unit }) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['tips'],
    properties: { tips: { type: 'array', items: { type: 'string' } } },
  };
  const dayLines = days.map((d) => `${d.date}: ${d.looks.map((l) => OCCASIONS[l.occasion].label).join(' + ')}; ${weatherLine(d.weather, unit)}`).join('\n');
  const prompt = `I'm travelling to ${trip.destination.label} from ${trip.startDate} to ${trip.endDate}. Laundry available: ${trip.laundry ? 'yes' : 'no'}.
Day plan and weather:
${dayLines}

What I'm packing:
${wardrobeLines(packedItems)}

Give 4–7 short, specific tips for this trip: local dress norms or etiquette at ${trip.destination.label} (e.g. religious sites, restaurants), weather prep, anything important missing from my suitcase, and smart re-wear/packing tricks. One sentence each.`;
  const out = await ask({ system: STYLIST_SYSTEM, content: prompt, schema, effort: 'medium' });
  return (out.tips || []).slice(0, 8);
}
