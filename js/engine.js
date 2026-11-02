// Rule-based outfit engine. Works offline, no AI needed.
// Scores every sensible combination from the wardrobe against occasion, place and weather.
import { COLORS, OCCASIONS, PLACES, DARK_COLORS } from './data.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const INDOOR_TEMP = 21;
const ACTIVE = ['gym', 'hiking', 'beach'];

// ---------- single-item helpers ----------
export function formalityFit(item, [lo, hi]) {
  const f = item.formality ?? 3;
  if (f >= lo && f <= hi) return 1;
  const off = f < lo ? lo - f : f - hi;
  return off === 1 ? 0.45 : 0;
}

const hasTag = (item, tag) => (item.tags || []).includes(tag);

export function colorHarmony(a, b) {
  const ca = COLORS[a.color], cb = COLORS[b.color];
  if (!ca || !cb) return 0.7;
  if (ca.multi && cb.multi) return 0.15;
  if (ca.multi || cb.multi) return (ca.hue == null && !ca.multi) || (cb.hue == null && !cb.multi) ? 0.9 : 0.4;
  let s;
  if (ca.hue == null || cb.hue == null) s = 1; // neutrals go with everything
  else {
    let d = Math.abs(ca.hue - cb.hue); d = Math.min(d, 360 - d);
    if (d <= 15) s = 0.8;               // monochrome
    else if (d <= 50) s = 0.85;         // analogous
    else if (d >= 150) s = 0.7;         // complementary
    else s = 0.35;                      // clashing-ish
    if (ca.softNeutral || cb.softNeutral) s = Math.max(s, 0.75);
  }
  // Classic iffy pairs
  const pair = [a.color, b.color].sort().join('+');
  if (pair === 'black+navy' || pair === 'black+brown') s -= 0.15;
  if (a.pattern === 'pattern' && b.pattern === 'pattern') s -= 0.35;
  return clamp(s, 0, 1);
}

function freshness(item, today = Date.now()) {
  if (!item.lastWorn) return 1;
  const days = (today - new Date(item.lastWorn).getTime()) / 86400000;
  if (days < 1) return 0.2;
  if (days < 3) return 0.6;
  if (days < 7) return 0.85;
  return 1;
}

// Warmth fit: 1 when within ±0.5 of target, falling off linearly.
const fit = (x, t) => clamp(1 - Math.max(0, Math.abs(x - t) - 0.5) / 3, 0, 1);
const tempToWarmth = (t, max) => clamp((30 - t) / 5, 1, max);

function baseWarmth(o) {
  if (o.dress) return o.dress.warmth ?? 2;
  return (o.top.warmth ?? 2) * 0.6 + (o.bottom.warmth ?? 2) * 0.4;
}
function totalWarmth(o) {
  return baseWarmth(o) + (o.outerwear ? (o.outerwear.warmth ?? 3) * 0.7 : 0);
}

/** Build the scoring context from user inputs. */
export function makeContext({ occasion = 'casual', place = 'mixed', weather = null, placeNote = '' }) {
  const occ = OCCASIONS[occasion] || OCCASIONS.casual;
  const exposure = (PLACES[place] || PLACES.mixed).exposure;
  const outsideTemp = weather ? weather.dressTemp : 20;
  return {
    occasion, occ, place, placeNote, weather, exposure,
    outsideTemp,
    indoorTarget: tempToWarmth(INDOOR_TEMP, 5),
    outdoorTarget: tempToWarmth(outsideTemp, 7.5),
    hot: outsideTemp >= 26 && exposure >= 0.5,
    cold: outsideTemp <= 8,
    rain: !!(weather && weather.rain) && exposure > 0.2,
    snow: !!(weather && weather.snow),
    uvHigh: !!(weather && weather.uv >= 6) && exposure >= 0.5,
  };
}

/** Is this item allowed at all for this context? */
function allowed(item, ctx) {
  if (item.archived) return false;
  if (hasTag(item, 'swim') && ctx.occasion !== 'beach') return false;
  if (formalityFit(item, ctx.occ.formality) === 0 && !['accessory', 'bag'].includes(item.category)) return false;
  return true;
}

/** Per-item score used to shortlist candidates before combining. */
function itemScore(item, ctx) {
  let s = formalityFit(item, ctx.occ.formality) * 3;
  for (const t of ctx.occ.preferTags || []) if (hasTag(item, t)) s += 0.6;
  for (const t of ctx.occ.avoidTags || []) if (hasTag(item, t)) s -= 1.2;
  for (const t of ctx.occ.requireTags || []) if (!hasTag(item, t) && ['top', 'bottom', 'shoes'].includes(item.category)) s -= 1.5;
  if ((ctx.occ.avoidColors || []).includes(item.color)) s -= 2;
  // Athletic pieces look out of place outside active occasions.
  if (hasTag(item, 'sporty') && !ACTIVE.includes(ctx.occasion) && item.category !== 'outerwear') s -= 0.9;
  if (ctx.occ.preferDark && DARK_COLORS.includes(item.color)) s += 0.5;
  if (ctx.hot && (item.warmth ?? 2) >= 4 && item.category !== 'outerwear') s -= 1.5;
  if (ctx.hot && hasTag(item, 'breathable')) s += 0.5;
  if (ctx.cold && (item.warmth ?? 2) <= 1 && ['top', 'bottom', 'dress'].includes(item.category)) s -= 0.8;
  if (ctx.rain && hasTag(item, 'delicate')) s -= 1;
  if (ctx.rain && hasTag(item, 'waterproof') && ['outerwear', 'shoes'].includes(item.category)) s += 1;
  if (ctx.snow && item.category === 'shoes' && /boot/i.test(item.type || '')) s += 1.2;
  if (ctx.hot && item.category === 'shoes' && /sandal|slide/i.test(item.type || '')) s += 0.4;
  if (!ctx.hot && ctx.outsideTemp < 18 && ctx.exposure >= 0.25 && item.category === 'shoes' && /sandal|slide/i.test(item.type || '')) s -= 1.5;
  if (ctx.outsideTemp < 17 && ctx.exposure >= 0.25 && item.category === 'bottom' && /short/i.test(item.type || '')) s -= 1.2;
  if (ctx.rain && ctx.exposure >= 0.25 && item.category === 'shoes' && /sandal|slide/i.test(item.type || '')) s -= 1;
  s += freshness(item) * 0.6;
  if (item.favorite) s += 0.2;
  return s;
}

function shortlist(items, cat, ctx, n, extra = () => 0) {
  return items
    .filter((i) => i.category === cat && allowed(i, ctx))
    .map((i) => ({ i, s: itemScore(i, ctx) + extra(i) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.i);
}

/** Score a full outfit. Returns { score 0–100, reasons[] } */
function scoreOutfit(o, ctx, reuse) {
  const pieces = [o.top, o.bottom, o.dress, o.outerwear, o.shoes].filter(Boolean);
  const reasons = [];

  // Formality
  const form = pieces.reduce((a, p) => a + formalityFit(p, ctx.occ.formality), 0) / pieces.length;

  // Warmth: indoor portion judged without outerwear, outdoor portion with it.
  const base = baseWarmth(o), total = totalWarmth(o);
  const e = ctx.exposure;
  let warm = (1 - e) * fit(base, ctx.indoorTarget) + e * fit(total, ctx.outdoorTarget);
  // Indoors-heavy events in the cold still need something for the commute.
  if (!o.outerwear && ctx.outsideTemp < 12) warm -= 0.35;
  warm = clamp(warm, 0, 1);

  // Colour harmony across every pair of visible pieces
  let pairs = 0, harm = 0;
  for (let a = 0; a < pieces.length; a++) for (let b = a + 1; b < pieces.length; b++) { harm += colorHarmony(pieces[a], pieces[b]); pairs++; }
  harm = pairs ? harm / pairs : 1;
  const nonNeutral = pieces.filter((p) => COLORS[p.color] && COLORS[p.color].hue != null && !COLORS[p.color].softNeutral).length;
  if (nonNeutral >= 3) harm -= 0.2;

  // Weather-specific
  let wx = 1;
  if (ctx.rain) {
    if (o.outerwear && hasTag(o.outerwear, 'waterproof')) { wx += 0.3; reasons.push('Waterproof layer for the rain'); }
    else if (o.outerwear) wx -= 0.1;
    if (hasTag(o.shoes, 'waterproof')) wx += 0.2;
    if (pieces.some((p) => hasTag(p, 'delicate'))) wx -= 0.5;
  }
  if (ctx.snow && /boot/i.test(o.shoes.type || '')) { wx += 0.3; reasons.push('Boots for snow'); }
  if (ctx.weather && ctx.weather.windy && o.outerwear && e >= 0.5) wx += 0.1;
  if (ctx.hot && o.outerwear && e >= 0.5) wx -= 0.5;
  wx = clamp(wx / 1.3, 0, 1);

  // Occasion tags
  let tagS = 0.6;
  for (const p of pieces) {
    for (const t of ctx.occ.preferTags || []) if (hasTag(p, t)) tagS += 0.12;
    for (const t of ctx.occ.avoidTags || []) if (hasTag(p, t)) tagS -= 0.3;
    if ((ctx.occ.avoidColors || []).includes(p.color)) tagS -= 0.4;
    if (hasTag(p, 'sporty') && !ACTIVE.includes(ctx.occasion) && p.category !== 'outerwear') tagS -= 0.15;
  }
  if (ctx.occ.requireTags) {
    const main = [o.top, o.bottom, o.dress, o.shoes].filter(Boolean);
    const ok = main.filter((p) => ctx.occ.requireTags.every((t) => hasTag(p, t))).length / main.length;
    tagS = tagS * 0.4 + ok * 0.6;
  }
  if (ctx.occ.preferDark) tagS += pieces.filter((p) => DARK_COLORS.includes(p.color)).length / pieces.length * 0.3 - 0.1;
  tagS = clamp(tagS, 0, 1);

  const fresh = pieces.reduce((a, p) => a + freshness(p), 0) / pieces.length;
  const fav = pieces.some((p) => p.favorite) ? 1 : 0;

  let score = form * 3 + warm * 3 + clamp(harm, 0, 1) * 2 + wx * 1.5 + tagS * 1.5 + fresh * 1 + fav * 0.3;
  let max = 3 + 3 + 2 + 1.5 + 1.5 + 1 + 0.3;

  // Travel capsule: strongly prefer items already in the suitcase.
  if (reuse) {
    const newOnes = pieces.filter((p) => !reuse.packed.has(p.id));
    score += (pieces.length - newOnes.length) / pieces.length * reuse.weight;
    max += reuse.weight;
  }

  // Human-readable reasons
  if (form >= 0.95) reasons.unshift(`Right dress level for ${ctx.occ.label.toLowerCase()}`);
  else if (form < 0.7) reasons.push('Slightly off the usual dress code — your closest match');
  if (ctx.weather) {
    if (warm >= 0.8) reasons.push(`Warmth suits ~${Math.round(ctx.outsideTemp)}° feels-like`);
    else if (total < ctx.outdoorTarget - 1) reasons.push('May feel cool — add a layer if you have one');
    else if (total > ctx.outdoorTarget + 1.2) reasons.push('On the warm side — wear breathable layers');
  }
  if (harm >= 0.85) reasons.push('Colours work well together');
  if (fresh < 0.7) reasons.push('Some pieces were worn very recently');
  if (fav) reasons.push('Includes a favourite');

  return { score: Math.round((score / max) * 100), reasons };
}

/** Optional accessory/bag picks + practical tips based on the weather. */
function extras(items, o, ctx) {
  const picks = [];
  const tips = [];
  const owned = (re) => items.filter((i) => !i.archived && i.category === 'accessory' && re.test(i.type || i.name || ''));
  const want = (re, tip) => { const got = owned(re)[0]; if (got) picks.push(got); else if (tip) tips.push(tip); };

  if (ctx.rain) want(/umbrella/i, 'Bring an umbrella ☔');
  if (ctx.uvHigh) want(/sunglass/i, 'Sunglasses + sunscreen — UV is high 😎');
  if (ctx.uvHigh && ctx.occ.formality[1] <= 2) want(/hat|cap/i, null);
  if (ctx.outsideTemp <= 5 && ctx.exposure >= 0.25) { want(/scarf/i, 'A scarf would help in this cold 🧣'); want(/glove/i, null); }
  if (['business', 'interview', 'wedding', 'formal_dinner', 'funeral'].includes(ctx.occasion)) want(/tie|watch/i, null);
  if (o.bottom && /trouser|chino|dress pants|jean/i.test(o.bottom.type || '') && ctx.occ.formality[0] >= 3) want(/belt/i, null);

  // Bag: best formality + colour match
  const pieces = [o.top, o.bottom, o.dress, o.outerwear, o.shoes].filter(Boolean);
  const bag = items
    .filter((i) => !i.archived && i.category === 'bag')
    .map((b) => ({ b, s: formalityFit(b, ctx.occ.formality) * 2 + pieces.reduce((a, p) => a + colorHarmony(b, p), 0) / pieces.length }))
    .sort((a, b) => b.s - a.s)[0];
  if (bag && bag.s > 1.5) picks.push(bag.b);

  if (ctx.weather && ctx.weather.swing >= 10 && ctx.exposure >= 0.5) tips.push('Big temperature swing today — layer up so you can peel off');
  if (ctx.rain && !(o.outerwear && hasTag(o.outerwear, 'waterproof')) && !picks.some((p) => /umbrella/i.test(p.type || ''))) tips.push('No waterproof jacket picked — check your rain options');
  if (ctx.snow) tips.push('Watch for slippery pavements — grippy soles help');
  return { accessories: [...new Map(picks.map((p) => [p.id, p])).values()], tips };
}

/**
 * Main entry: build and rank outfits.
 * opts.reuse: { packed:Set<id>, weight:number, wearCount:Map<id,n>, maxWear:{category:n} } for travel capsules
 * opts.exclude: Set of ids not allowed (e.g. over-worn on a trip)
 */
export function recommend(items, ctx, opts = {}) {
  const { count = 3, jitter = 0, reuse = null, exclude = new Set() } = opts;
  const pool = items.filter((i) => !exclude.has(i.id));
  const bonus = reuse ? (i) => (reuse.packed.has(i.id) ? 1.5 : 0) : () => 0;

  const tops = shortlist(pool, 'top', ctx, 12, bonus);
  const bottoms = shortlist(pool, 'bottom', ctx, 12, bonus);
  const dresses = shortlist(pool, 'dress', ctx, 8, bonus);
  const shoes = shortlist(pool, 'shoes', ctx, 6, bonus);
  const outers = [null, ...shortlist(pool, 'outerwear', ctx, 5, bonus)];

  const bases = [];
  for (const t of tops) for (const b of bottoms) bases.push({ top: t, bottom: b });
  for (const d of dresses) bases.push({ dress: d });

  if (!bases.length || !shoes.length) return { outfits: [], missing: missingFor(pool, ctx) };

  const all = [];
  for (const base of bases) for (const s of shoes) for (const ow of outers) {
    const o = { ...base, shoes: s, outerwear: ow };
    const r = scoreOutfit(o, ctx, reuse);
    all.push({ ...o, score: r.score + (jitter ? (Math.random() - 0.5) * jitter : 0), reasons: r.reasons });
  }
  all.sort((a, b) => b.score - a.score);

  // Pick diverse results: avoid repeating the same top/bottom/dress across suggestions.
  const chosen = [];
  const used = new Set();
  for (const o of all) {
    const keys = [o.top, o.bottom, o.dress].filter(Boolean).map((p) => p.id);
    if (chosen.length && keys.some((k) => used.has(k))) continue;
    chosen.push(o); keys.forEach((k) => used.add(k));
    if (chosen.length >= count) break;
  }
  // Not enough variety in the wardrobe? fill with next best regardless.
  for (const o of all) { if (chosen.length >= count) break; if (!chosen.includes(o)) chosen.push(o); }

  const outfits = chosen.map((o) => {
    const ex = extras(pool, o, ctx);
    return { ...o, score: Math.round(clamp(o.score, 0, 100)), accessories: ex.accessories, tips: ex.tips };
  });
  return { outfits, missing: missingFor(pool, ctx) };
}

/** Suggest wardrobe gaps for this context. */
function missingFor(items, ctx) {
  const ok = (cat, pred = () => true) => items.some((i) => i.category === cat && allowed(i, ctx) && pred(i));
  const out = [];
  if (!ok('top') && !ok('dress')) out.push(`a ${ctx.occ.label.toLowerCase()}-appropriate top or dress`);
  if (!ok('bottom') && !ok('dress')) out.push(`${ctx.occ.label.toLowerCase()}-appropriate trousers/skirt`);
  if (!ok('shoes')) out.push(`shoes suitable for ${ctx.occ.label.toLowerCase()}`);
  if (ctx.rain && !items.some((i) => i.category === 'outerwear' && hasTag(i, 'waterproof'))) out.push('a waterproof jacket');
  if (ctx.outsideTemp <= 5 && !items.some((i) => i.category === 'outerwear' && (i.warmth ?? 0) >= 4)) out.push('a warm coat');
  if (ctx.occ.requireTags && !items.some((i) => ctx.occ.requireTags.every((t) => hasTag(i, t)))) out.push('activewear');
  if (ctx.occasion === 'beach' && !items.some((i) => hasTag(i, 'swim'))) out.push('swimwear');
  return out;
}

export const piecesOf = (o) => [o.outerwear, o.top, o.dress, o.bottom, o.shoes, ...(o.accessories || [])].filter(Boolean);
