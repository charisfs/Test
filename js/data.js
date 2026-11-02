// Reference data: categories, colours, occasions, places.

export const CATEGORIES = {
  top: { label: 'Tops', one: 'Top', types: ['T-shirt', 'Shirt', 'Blouse', 'Polo', 'Sweater', 'Hoodie', 'Tank top', 'Turtleneck', 'Cardigan', 'Sport top'] },
  bottom: { label: 'Bottoms', one: 'Bottom', types: ['Jeans', 'Chinos', 'Trousers', 'Dress pants', 'Shorts', 'Skirt', 'Leggings', 'Joggers'] },
  dress: { label: 'Dresses & one-pieces', one: 'Dress', types: ['Casual dress', 'Cocktail dress', 'Evening gown', 'Jumpsuit', 'Suit (2-piece)', 'Swimsuit'] },
  outerwear: { label: 'Outerwear', one: 'Outerwear', types: ['Blazer', 'Suit jacket', 'Denim jacket', 'Leather jacket', 'Bomber', 'Trench coat', 'Wool coat', 'Puffer', 'Rain jacket', 'Windbreaker'] },
  shoes: { label: 'Shoes', one: 'Shoes', types: ['Sneakers', 'Running shoes', 'Loafers', 'Oxfords', 'Heels', 'Flats', 'Sandals', 'Boots', 'Hiking boots', 'Slides'] },
  accessory: { label: 'Accessories', one: 'Accessory', types: ['Watch', 'Belt', 'Tie', 'Scarf', 'Hat', 'Cap', 'Sunglasses', 'Jewelry', 'Gloves', 'Umbrella'] },
  bag: { label: 'Bags', one: 'Bag', types: ['Backpack', 'Tote', 'Clutch', 'Crossbody', 'Briefcase', 'Duffel'] },
};
export const CATEGORY_ORDER = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory', 'bag'];

// hue: degrees on the colour wheel, null = neutral
export const COLORS = {
  black: { hex: '#1d1d1f', hue: null },
  white: { hex: '#f8f8f6', hue: null },
  cream: { hex: '#efe6d2', hue: null },
  grey: { hex: '#8e8e93', hue: null },
  navy: { hex: '#1f2a4d', hue: null },
  beige: { hex: '#d6c3a3', hue: null },
  khaki: { hex: '#b8a77a', hue: null },
  brown: { hex: '#6e4b32', hue: null },
  denim: { hex: '#4a6c94', hue: null },
  olive: { hex: '#6b6b3a', hue: 70, softNeutral: true },
  burgundy: { hex: '#6d1f2f', hue: 345, softNeutral: true },
  red: { hex: '#c9302c', hue: 0 },
  pink: { hex: '#e88fa8', hue: 335 },
  orange: { hex: '#e2792f', hue: 25 },
  yellow: { hex: '#e8c83a', hue: 50 },
  green: { hex: '#3f8f4f', hue: 130 },
  teal: { hex: '#2b8a8a', hue: 180 },
  blue: { hex: '#2f6fd1', hue: 215 },
  lightblue: { hex: '#9cc3e6', hue: 205 },
  purple: { hex: '#6f4aa8', hue: 270 },
  multicolor: { hex: 'conic-gradient(#c9302c,#e8c83a,#3f8f4f,#2f6fd1,#6f4aa8,#c9302c)', hue: null, multi: true },
};

export const TAGS = [
  { id: 'waterproof', label: 'Waterproof' },
  { id: 'sporty', label: 'Sporty / active' },
  { id: 'swim', label: 'Swimwear' },
  { id: 'breathable', label: 'Breathable / linen' },
  { id: 'modest', label: 'Modest cover' },
  { id: 'delicate', label: 'Delicate (no rain)' },
  { id: 'statement', label: 'Statement piece' },
  { id: 'packable', label: 'Packable / no-wrinkle' },
];

// formality 1 = very casual … 5 = black tie
export const OCCASIONS = {
  casual: { label: 'Casual day', icon: '☕', formality: [1, 2] },
  work: { label: 'Office / work', icon: '💼', formality: [3, 4], avoidTags: ['swim', 'sporty'] },
  business: { label: 'Business formal', icon: '👔', formality: [4, 5], avoidTags: ['swim', 'sporty'] },
  interview: { label: 'Job interview', icon: '🤝', formality: [4, 5], avoidTags: ['swim', 'sporty', 'statement'], preferDark: true },
  date: { label: 'Date night', icon: '🌹', formality: [2, 4], preferTags: ['statement'] },
  party: { label: 'Party / night out', icon: '🎉', formality: [2, 4], preferTags: ['statement'] },
  wedding: { label: 'Wedding guest', icon: '💍', formality: [4, 5], avoidColors: ['white', 'cream'], avoidTags: ['sporty', 'swim'] },
  formal_dinner: { label: 'Formal dinner / gala', icon: '🥂', formality: [4, 5], avoidTags: ['sporty', 'swim'] },
  religious: { label: 'Place of worship', icon: '🕊️', formality: [3, 4], preferTags: ['modest'], avoidTags: ['swim', 'sporty'] },
  funeral: { label: 'Funeral', icon: '🖤', formality: [4, 5], preferDark: true, avoidTags: ['statement', 'sporty', 'swim'] },
  gym: { label: 'Gym / workout', icon: '🏋️', formality: [1, 1], requireTags: ['sporty'] },
  hiking: { label: 'Hiking / outdoors', icon: '🥾', formality: [1, 2], preferTags: ['sporty', 'waterproof', 'breathable'], avoidTags: ['delicate'] },
  beach: { label: 'Beach / pool', icon: '🏖️', formality: [1, 1], preferTags: ['swim', 'breathable'], avoidTags: ['delicate'] },
  sightseeing: { label: 'Sightseeing', icon: '📸', formality: [1, 2], preferTags: ['breathable', 'packable'] },
  travel_day: { label: 'Travel day (flight/train)', icon: '✈️', formality: [1, 2], preferTags: ['packable'] },
};

export const PLACES = {
  indoor: { label: 'Indoors', exposure: 0.25 },
  mixed: { label: 'In & out', exposure: 0.6 },
  outdoor: { label: 'Outdoors', exposure: 1 },
};

export const TRIP_ACTIVITIES = ['sightseeing', 'work', 'business', 'casual', 'date', 'party', 'formal_dinner', 'wedding', 'beach', 'hiking', 'gym', 'religious'];

export const DARK_COLORS = ['black', 'navy', 'grey', 'burgundy', 'brown', 'olive'];
