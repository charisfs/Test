# Outfitly: AI outfit planner for iPhone

Outfitly suggests outfits **from clothes you already own**. It takes into account the **weather**, the **event** (work, wedding, date, interview, gym…) and the **place** (indoors or outdoors, temple, rooftop bar…). A **Travel** mode plans an outfit for every day of a trip and builds a compact packing list.

It's an installable web app (PWA), so it runs on your **iPhone 13** like a native app. You don't need the App Store or a Mac.

## Features

| | |
|---|---|
| 👕 **Wardrobe database** | Photograph each item with the camera or pick it from your library. Set the category, type, colour, pattern, warmth (1–5), formality (1–5) and tags (waterproof, sporty, modest, delicate…). Favourites, wear count, and an "away" status for laundry or lent-out items. |
| ✨ **Outfit suggestions** | Pick a day (up to 16 days ahead), a time of day, a location, an occasion and a setting. The engine scores every combination for dress code, warmth vs. feels-like temperature, rain/snow/wind/UV, colour harmony and how recently each piece was worn. It returns your 3 best looks plus matching accessories, a bag and practical tips. |
| 🤖 **AI stylist** (optional) | Claude picks outfits from your wardrobe item IDs and explains why. It also uses your free-text place and notes, for example "lots of walking" or "outdoor rooftop". |
| 📸 **AI photo auto-fill** (optional) | Snap a garment and the AI fills in the category, type, colour, warmth, formality and tags. |
| 🧳 **Travel planner** | Enter a destination, dates, activities and whether you can do laundry. It uses the real forecast for trips within 16 days, or last year's weather for the same dates. You get a day-by-day plan (travel days, evening events, editable per day) that re-uses pieces so the suitcase stays small, and a packing checklist with essentials. |
| 🌍 **AI travel tips** (optional) | Local dress norms (religious sites, restaurants), weather prep and missing items. |
| ✅ **Wear log** | Tap "Wear this" and those pieces rest for a few days in future suggestions. |
| 💾 **Private & offline** | Everything is stored on the phone (IndexedDB). You can export or import a backup to Files or iCloud Drive. |

The built-in engine works **without any AI key or account**. Weather comes from [Open-Meteo](https://open-meteo.com), which is free and needs no key.

## Put it on your iPhone 13

1. Host the folder over HTTPS. The easiest way is **GitHub Pages**: in the repo go to *Settings → Pages → Source: GitHub Actions*. The included workflow (`.github/workflows/pages.yml`) deploys on every push. (A private repo needs a paid GitHub plan for Pages. You can also drag the folder into Netlify Drop or Cloudflare Pages.)
2. Open the URL in **Safari** on your iPhone.
3. Tap **Share ⬆︎ → Add to Home Screen**.
4. Launch **Outfitly** from the home screen. Allow location for local weather, or pick a city instead.

Then:
- **Wardrobe** tab → **+ Add** → 📷 Camera. Or tap *Load sample wardrobe* to try the app first.
- **Outfit** tab → pick an occasion → **✨ Suggest outfits**.
- **Travel** tab → **Plan a trip**.

### Enabling the AI features
Create an API key at <https://console.anthropic.com/settings/keys> and paste it in **Settings → AI stylist**. The key stays on your phone and is sent only to Anthropic. The AI calls use the official Anthropic JS SDK with model `claude-opus-5-5`, structured JSON output, and only your wardrobe's text attributes (photos are sent only when you tap *Auto-fill with AI*).

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

No build step and no dependencies: plain HTML, CSS and ES modules.

## How the recommendation engine scores outfits

`js/engine.js` builds every combination of (top + bottom | one-piece) × shoes × (no outerwear | outerwear) from a shortlist. It then scores each one out of 100:

- **Dress code (30%)**: each piece's formality against the occasion's range.
- **Warmth (30%)**: layered warmth against the feels-like temperature. Indoor time is judged without the coat and outdoor time with it, weighted by the setting.
- **Colour harmony (20%)**: neutrals, monochrome, analogous and complementary schemes; avoids pattern-on-pattern and too many bright colours.
- **Weather fit (15%)**: waterproof layers in rain, boots in snow, no heavy coat in heat, no sandals or shorts in the cold.
- **Occasion tags (15%)**: e.g. modest cover at places of worship, no white at weddings, dark tones for funerals and interviews, activewear for the gym.
- **Freshness (10%)**: pieces worn in the last few days are pushed down.

The travel planner runs the same engine day by day. It adds a strong bonus for items already in the suitcase and caps re-wears per category (higher when laundry is available).

## Files

```
index.html            app shell + tab bar
manifest.webmanifest  install metadata (home-screen app)
sw.js                 offline cache
css/app.css           iPhone-first styles, light/dark mode, safe-area aware
js/app.js             screens: Outfit, Wardrobe, Travel, Settings
js/engine.js          outfit scoring engine
js/travel.js          trip schedule, capsule planner, packing essentials
js/weather.js         Open-Meteo forecast / history / city search
js/ai.js              optional Claude integration
js/db.js              IndexedDB storage, backup export/import
js/data.js            categories, colours, occasions, tags
js/sample.js          demo wardrobe
```
