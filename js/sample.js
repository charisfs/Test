// A starter wardrobe so you can try the app before photographing your own clothes.
const S = (name, category, type, color, warmth, formality, tags = [], pattern = 'solid') =>
  ({ name, category, type, color, warmth, formality, tags, pattern });

export const SAMPLE_WARDROBE = [
  S('White oxford shirt', 'top', 'Shirt', 'white', 2, 4, ['packable']),
  S('Light blue shirt', 'top', 'Shirt', 'lightblue', 2, 4),
  S('Black crew tee', 'top', 'T-shirt', 'black', 1, 1, ['breathable']),
  S('White tee', 'top', 'T-shirt', 'white', 1, 1, ['breathable']),
  S('Striped breton top', 'top', 'T-shirt', 'navy', 2, 2, [], 'pattern'),
  S('Grey merino sweater', 'top', 'Sweater', 'grey', 4, 3, ['packable']),
  S('Cream cable knit', 'top', 'Sweater', 'cream', 5, 2),
  S('Burgundy silk blouse', 'top', 'Blouse', 'burgundy', 1, 4, ['delicate', 'statement']),
  S('Olive linen shirt', 'top', 'Shirt', 'olive', 1, 2, ['breathable']),
  S('Running top', 'top', 'Sport top', 'teal', 1, 1, ['sporty', 'breathable']),
  S('Grey hoodie', 'top', 'Hoodie', 'grey', 3, 1, ['sporty']),

  S('Dark wash jeans', 'bottom', 'Jeans', 'denim', 3, 2),
  S('Beige chinos', 'bottom', 'Chinos', 'beige', 2, 3),
  S('Navy tailored trousers', 'bottom', 'Dress pants', 'navy', 2, 4, ['packable']),
  S('Black trousers', 'bottom', 'Trousers', 'black', 3, 4),
  S('Khaki shorts', 'bottom', 'Shorts', 'khaki', 1, 1, ['breathable']),
  S('Black midi skirt', 'bottom', 'Skirt', 'black', 2, 3, ['modest']),
  S('Running leggings', 'bottom', 'Leggings', 'black', 2, 1, ['sporty']),

  S('Little black dress', 'dress', 'Cocktail dress', 'black', 1, 4, ['statement', 'packable']),
  S('Floral sundress', 'dress', 'Casual dress', 'multicolor', 1, 2, ['breathable'], 'pattern'),
  S('Charcoal suit', 'dress', 'Suit (2-piece)', 'grey', 3, 5),
  S('Swimsuit', 'dress', 'Swimsuit', 'blue', 1, 1, ['swim']),

  S('Navy blazer', 'outerwear', 'Blazer', 'navy', 2, 4),
  S('Denim jacket', 'outerwear', 'Denim jacket', 'denim', 2, 2),
  S('Camel wool coat', 'outerwear', 'Wool coat', 'beige', 5, 4),
  S('Black rain jacket', 'outerwear', 'Rain jacket', 'black', 2, 2, ['waterproof', 'packable']),
  S('Puffer jacket', 'outerwear', 'Puffer', 'olive', 5, 1, ['waterproof']),

  S('White sneakers', 'shoes', 'Sneakers', 'white', 2, 2),
  S('Running shoes', 'shoes', 'Running shoes', 'grey', 2, 1, ['sporty', 'breathable']),
  S('Brown loafers', 'shoes', 'Loafers', 'brown', 2, 4),
  S('Black oxfords', 'shoes', 'Oxfords', 'black', 2, 5),
  S('Black heels', 'shoes', 'Heels', 'black', 1, 4),
  S('Chelsea boots', 'shoes', 'Boots', 'brown', 3, 3, ['waterproof']),
  S('Sandals', 'shoes', 'Sandals', 'beige', 1, 1, ['breathable']),

  S('Silver watch', 'accessory', 'Watch', 'grey', 1, 4),
  S('Brown leather belt', 'accessory', 'Belt', 'brown', 1, 3),
  S('Sunglasses', 'accessory', 'Sunglasses', 'black', 1, 2),
  S('Wool scarf', 'accessory', 'Scarf', 'burgundy', 4, 3),
  S('Compact umbrella', 'accessory', 'Umbrella', 'black', 1, 2),

  S('Black leather tote', 'bag', 'Tote', 'black', 1, 4),
  S('Canvas backpack', 'bag', 'Backpack', 'olive', 1, 1),
];
