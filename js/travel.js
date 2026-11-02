// Trip planner: day-by-day outfits that re-use a small capsule + a packing list.
import { OCCASIONS } from './data.js';
import { makeContext, recommend, piecesOf } from './engine.js';

const DAYTIME = ['sightseeing', 'work', 'business', 'casual', 'beach', 'hiking', 'religious', 'gym'];
const EVENING = ['date', 'party', 'formal_dinner', 'wedding'];

/** Default occasions per day from the selected trip activities. */
export function defaultSchedule(dates, activities) {
  const day = activities.filter((a) => DAYTIME.includes(a));
  const eve = activities.filter((a) => EVENING.includes(a));
  if (!day.length) day.push('casual');
  const schedule = dates.map((date, i) => {
    const first = i === 0, last = i === dates.length - 1;
    const main = (first || last) && dates.length > 1 ? 'travel_day' : day[(i - 1 + day.length) % day.length];
    return { date, looks: [{ occasion: main, place: main === 'beach' || main === 'hiking' ? 'outdoor' : 'mixed' }] };
  });
  // Spread evening events over the middle days (or day 1 if the trip is a single day).
  const middle = schedule.length > 2 ? schedule.slice(1, -1) : schedule;
  eve.forEach((occ, k) => {
    const target = middle[Math.min(middle.length - 1, Math.floor(((k + 0.5) * middle.length) / eve.length))];
    target.looks.push({ occasion: occ, place: 'indoor' });
  });
  return schedule;
}

/**
 * Plan outfits for every look of every day, preferring re-use so the suitcase stays small.
 * days: [{ date, weather, looks:[{occasion, place}] }]
 */
export function planTrip(items, days, { laundry = false } = {}) {
  const packed = new Set();
  const wear = new Map();
  const nDays = days.length;
  const limit = {
    top: laundry ? 2 : nDays > 7 ? 2 : 1,
    bottom: laundry ? 4 : 3,
    dress: laundry ? 2 : 1,
    outerwear: 99, shoes: 99, accessory: 99, bag: 99,
  };

  const planned = days.map((d) => {
    const looks = d.looks.map((look) => {
      const ctx = makeContext({ occasion: look.occasion, place: look.place, weather: d.weather });
      const exclude = new Set(items.filter((i) => (wear.get(i.id) || 0) >= (limit[i.category] ?? 99)).map((i) => i.id));
      const reuse = { packed, weight: 2.5 };
      let { outfits } = recommend(items, ctx, { count: 1, reuse, exclude });
      if (!outfits.length) ({ outfits } = recommend(items, ctx, { count: 1, reuse })); // relax wear limits
      const outfit = outfits[0] || null;
      if (outfit) {
        for (const p of piecesOf(outfit)) {
          packed.add(p.id);
          // Evening looks on the same day count as a separate wear only for main garments.
          wear.set(p.id, (wear.get(p.id) || 0) + 1);
        }
      }
      return { ...look, outfit };
    });
    return { ...d, looks };
  });

  return { days: planned, packedIds: [...packed] };
}

/** Non-wardrobe essentials for the packing checklist. */
export function essentials(trip, days, packedItems) {
  const n = days.length;
  const laundryCap = trip.laundry ? Math.min(n + 1, 5) : n + 1;
  const occ = new Set(days.flatMap((d) => d.looks.map((l) => l.occasion)));
  const anyRain = days.some((d) => d.weather && d.weather.rain);
  const anyCold = days.some((d) => d.weather && d.weather.feelsMin <= 5);
  const anySun = days.some((d) => d.weather && d.weather.uv >= 6) || occ.has('beach');
  const has = (re) => packedItems.some((i) => re.test(i.type || '') || re.test(i.name || ''));

  const list = [
    `Underwear × ${laundryCap}`,
    `Socks × ${laundryCap}`,
    'Sleepwear',
    'Toiletries & skincare',
    'Phone + charger',
    'Passport / ID & travel documents',
    'Medications',
    'Plug adapter (if going abroad)',
  ];
  if (anyRain && !has(/umbrella/i)) list.push('Compact umbrella');
  if (anySun) list.push('Sunscreen', ...(has(/sunglass/i) ? [] : ['Sunglasses']));
  if (anyCold && !has(/glove/i)) list.push('Gloves & warm hat');
  if (occ.has('beach') && !has(/swim/i)) list.push('Swimwear');
  if (occ.has('beach')) list.push('Beach towel / sarong');
  if (occ.has('hiking')) list.push('Water bottle', 'Small daypack');
  if (occ.has('gym') && !packedItems.some((i) => (i.tags || []).includes('sporty'))) list.push('Workout clothes');
  if (occ.has('business') || occ.has('work')) list.push('Laptop + charger');
  if (n >= 4 && !trip.laundry) list.push('Laundry bag');
  return list;
}

export const occasionLabel = (k) => (OCCASIONS[k] ? `${OCCASIONS[k].icon} ${OCCASIONS[k].label}` : k);
