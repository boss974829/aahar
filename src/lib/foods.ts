export type Food = {
  id: string;
  name: string;
  hi: string;
  aliases: string[];
  /** Per 100 g. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  piece?: number;
  defaultGrams: number;
  katori?: number;
  plate?: number;
  glass?: number;
};

function food(
  id: string,
  name: string,
  hi: string,
  aliases: string[],
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  extra: { piece?: number; defaultGrams: number; katori?: number; plate?: number; glass?: number },
): Food {
  const all = new Set([name.toLowerCase(), hi.toLowerCase(), ...aliases.map((a) => a.toLowerCase())]);
  return { id, name, hi, aliases: [...all], kcal, protein, carbs, fat, ...extra };
}

export const FOODS: Food[] = [
  food("roti", "Roti", "रोटी", ["chapati", "phulka", "चपाती", "फुल्का"], 297, 9, 46, 8, { piece: 35, defaultGrams: 35 }),
  food("naan", "Naan", "नान", ["नान"], 290, 9, 50, 6, { piece: 90, defaultGrams: 90 }),
  food("paratha", "Paratha", "पराठा", ["parantha", "पराठा"], 326, 7, 42, 14, { piece: 80, defaultGrams: 80 }),
  food("rice", "Cooked rice", "चावल", ["rice", "chawal", "bhaat", "भात"], 130, 2.7, 28, 0.3, { defaultGrams: 150, katori: 150 }),
  food("fried-rice", "Fried rice", "फ्राइड राइस", ["fried rice"], 186, 4, 28, 6, { defaultGrams: 250, plate: 280 }),
  food("biryani", "Biryani", "बिरयानी", ["biryani", "chicken biryani", "veg biryani", "चिकन बिरयानी"], 180, 6.5, 24, 6, { defaultGrams: 300, plate: 320 }),
  food("dal", "Dal", "दाल", ["daal", "lentil", "lentils"], 118, 7, 16, 3.2, { defaultGrams: 150, katori: 150 }),
  food("dal-tadka", "Dal tadka", "दाल तड़का", ["dal tadka", "tadka dal", "तड़का"], 148, 7, 14, 6, { defaultGrams: 180, katori: 180 }),
  food("rajma", "Rajma", "राजमा", ["kidney beans"], 140, 8, 20, 3, { defaultGrams: 180, katori: 180 }),
  food("chole", "Chole", "छोले", ["chana", "chana masala", "chickpea", "chickpeas"], 164, 8, 22, 5, { defaultGrams: 180, katori: 180 }),
  food("khichdi", "Khichdi", "खिचड़ी", ["khichri"], 142, 5, 22, 4, { defaultGrams: 250, katori: 180 }),
  food("poha", "Poha", "पोहा", [], 150, 3, 27, 4, { defaultGrams: 200 }),
  food("upma", "Upma", "उपमा", [], 163, 4, 24, 5, { defaultGrams: 200 }),
  food("idli", "Idli", "इडली", ["idly"], 146, 4, 28, 1.6, { piece: 40, defaultGrams: 80 }),
  food("dosa", "Dosa", "डोसा", ["dosai"], 168, 4, 26, 6, { piece: 100, defaultGrams: 100 }),
  food("uttapam", "Uttapam", "उत्तपम", [], 176, 5, 28, 5, { piece: 120, defaultGrams: 120 }),
  food("vada", "Medu vada", "वड़ा", ["vada", "wada"], 232, 6, 26, 11, { piece: 50, defaultGrams: 50 }),
  food("sambar", "Sambar", "सांभर", ["sambhar"], 78, 4, 10, 2.4, { defaultGrams: 150, katori: 150 }),
  food("paneer", "Paneer", "पनीर", [], 265, 18, 4, 20, { defaultGrams: 80 }),
  food("palak-paneer", "Palak paneer", "पालक पनीर", ["palak paneer", "saag paneer"], 162, 8, 6, 12, { defaultGrams: 180 }),
  food("chicken-curry", "Chicken curry", "चिकन करी", ["chicken curry", "murg curry"], 184, 16, 5, 11, { defaultGrams: 180, katori: 180 }),
  food("chicken", "Chicken", "चिकन", ["murg", "murgi", "मुर्गी"], 190, 27, 0, 8, { defaultGrams: 120 }),
  food("egg", "Egg", "अंडा", ["eggs", "anda", "अण्डा", "omelette", "omelet"], 155, 13, 1.1, 11, { piece: 50, defaultGrams: 50 }),
  food("fish", "Fish", "मछली", ["machli", "machhi"], 148, 22, 0, 6, { defaultGrams: 120 }),
  food("salmon", "Salmon", "सैल्मन", [], 208, 20, 0, 13, { defaultGrams: 120 }),
  food("prawn", "Prawns", "झींगा", ["prawn", "shrimp", "jhinga"], 99, 24, 0.2, 0.3, { defaultGrams: 120 }),
  food("mutton", "Mutton curry", "मटन", ["mutton", "gosht", "गोश्त"], 204, 16, 4, 14, { defaultGrams: 180 }),
  food("beef", "Beef", "बीफ", [], 217, 26, 0, 12, { defaultGrams: 120 }),
  food("aloo", "Aloo sabzi", "आलू", ["aloo", "aloo sabzi", "potato", "alu"], 112, 2, 16, 4, { defaultGrams: 150 }),
  food("sabzi", "Mixed vegetables", "सब्जी", ["sabzi", "vegetable", "vegetables", "mix veg", "mixed veg"], 92, 3, 10, 4, { defaultGrams: 150 }),
  food("spinach", "Spinach", "पालक", ["palak", "saag"], 28, 2.8, 3.4, 0.4, { defaultGrams: 100 }),
  food("salad", "Salad", "सलाद", ["kachumber", "katchumber"], 36, 1.4, 6, 0.8, { defaultGrams: 100 }),
  food("broccoli", "Broccoli", "ब्रोकली", [], 35, 2.4, 7, 0.4, { defaultGrams: 100 }),
  food("corn", "Corn", "मक्का", ["bhutta", "भुट्टा"], 96, 3.4, 21, 1.5, { piece: 150, defaultGrams: 150 }),
  food("curd", "Curd", "दही", ["dahi", "yogurt", "yoghurt", "raita", "रायता"], 61, 3.5, 4.7, 3.3, { defaultGrams: 150, katori: 150 }),
  food("greek-yogurt", "Greek yogurt", "ग्रीक दही", ["greek yogurt", "greek yoghurt"], 97, 9, 3.6, 5, { defaultGrams: 150 }),
  food("milk", "Milk", "दूध", ["doodh"], 61, 3.2, 4.8, 3.3, { defaultGrams: 200, glass: 200 }),
  food("chai", "Chai", "चाय", ["tea"], 42, 1.1, 6, 1.4, { defaultGrams: 150, glass: 150 }),
  food("coffee", "Coffee", "कॉफी", [], 28, 0.8, 3.5, 1, { defaultGrams: 150, glass: 180 }),
  food("lassi", "Lassi", "लस्सी", [], 86, 3, 13, 2.2, { defaultGrams: 250, glass: 250 }),
  food("buttermilk", "Buttermilk", "छाछ", ["chaas", "chaach"], 24, 1.6, 3, 0.7, { defaultGrams: 200, glass: 200 }),
  food("juice", "Fruit juice", "जूस", ["juice"], 46, 0.4, 11, 0.1, { defaultGrams: 200, glass: 200 }),
  food("banana", "Banana", "केला", ["kela"], 89, 1.1, 23, 0.3, { piece: 118, defaultGrams: 118 }),
  food("apple", "Apple", "सेब", ["seb"], 52, 0.3, 14, 0.2, { piece: 180, defaultGrams: 180 }),
  food("orange", "Orange", "संतरा", ["santra"], 47, 0.9, 12, 0.1, { piece: 130, defaultGrams: 130 }),
  food("mango", "Mango", "आम", ["aam"], 60, 0.8, 15, 0.4, { piece: 180, defaultGrams: 180 }),
  food("watermelon", "Watermelon", "तरबूज", [], 30, 0.6, 8, 0.2, { defaultGrams: 200 }),
  food("grapes", "Grapes", "अंगूर", ["angoor"], 69, 0.7, 18, 0.2, { defaultGrams: 100 }),
  food("oats", "Oats", "ओट्स", ["oatmeal", "porridge"], 148, 5, 25, 3, { defaultGrams: 220 }),
  food("bread", "Bread", "ब्रेड", ["toast", "slice"], 265, 9, 49, 3.2, { piece: 30, defaultGrams: 30 }),
  food("peanut-butter", "Peanut butter", "पीनट बटर", ["peanut butter"], 588, 25, 20, 50, { defaultGrams: 20 }),
  food("peanuts", "Peanuts", "मूंगफली", ["peanut", "moongphali"], 567, 26, 16, 49, { defaultGrams: 28 }),
  food("almonds", "Almonds", "बादाम", ["almond", "badam"], 579, 21, 22, 50, { defaultGrams: 15 }),
  food("samosa", "Samosa", "समोसा", [], 308, 5, 32, 17, { piece: 60, defaultGrams: 60 }),
  food("pakora", "Pakora", "पकोड़ा", ["pakoda", "bhajiya", "pakore"], 299, 6, 26, 18, { piece: 30, defaultGrams: 60 }),
  food("pav-bhaji", "Pav bhaji", "पाव भाजी", ["pav bhaji"], 186, 5, 24, 8, { defaultGrams: 300, plate: 320 }),
  food("misal", "Misal", "मिसळ", ["misal pav"], 168, 7, 18, 7, { defaultGrams: 280 }),
  food("momos", "Momos", "मोमो", ["momo", "momos"], 186, 7, 24, 6, { piece: 40, defaultGrams: 160 }),
  food("pizza", "Pizza", "पिज़्ज़ा", ["pizza slice"], 266, 11, 33, 10, { piece: 110, defaultGrams: 110 }),
  food("burger", "Burger", "बर्गर", [], 254, 13, 24, 12, { piece: 180, defaultGrams: 180 }),
  food("pasta", "Pasta", "पास्ता", [], 157, 5.5, 27, 3.2, { defaultGrams: 250 }),
  food("maggi", "Instant noodles", "मैगी", ["maggi", "instant noodles"], 145, 4, 21, 5, { defaultGrams: 250 }),
  food("sandwich", "Sandwich", "सैंडविच", [], 232, 9, 28, 9, { piece: 130, defaultGrams: 130 }),
  food("tofu", "Tofu", "टोफू", [], 76, 8, 1.9, 4.8, { defaultGrams: 100 }),
  food("sprouts", "Sprouts", "अंकुरित", ["sprout"], 86, 6, 13, 1, { defaultGrams: 100 }),
  food("soup", "Soup", "सूप", [], 48, 2.2, 6, 1.4, { defaultGrams: 250 }),
  food("quinoa", "Quinoa", "क्विनोआ", [], 120, 4.4, 21, 1.9, { defaultGrams: 160 }),
  food("sweet-potato", "Sweet potato", "शकरकंद", ["sweet potato", "shakarkandi"], 90, 1.6, 21, 0.1, { piece: 130, defaultGrams: 130 }),
  food("avocado", "Avocado", "एवोकाडो", [], 160, 2, 9, 15, { piece: 150, defaultGrams: 70 }),
  food("chocolate", "Chocolate", "चॉकलेट", [], 546, 5, 60, 31, { defaultGrams: 20 }),
  food("ice-cream", "Ice cream", "आइसक्रीम", ["ice cream", "icecream"], 207, 3.5, 24, 11, { defaultGrams: 90 }),
  food("biscuit", "Biscuit", "बिस्कुट", ["cookie", "cookies"], 460, 6, 66, 18, { piece: 12, defaultGrams: 24 }),
  food("chilla", "Chilla", "चीला", ["cheela", "besan chilla"], 186, 8, 18, 8, { piece: 80, defaultGrams: 80 }),
  food("vermicelli", "Vermicelli", "सेवइयां", ["sewai", "seviyan", "sevai"], 154, 4, 27, 3.4, { defaultGrams: 200 }),
  food("chutney", "Chutney", "चटनी", ["coconut chutney"], 188, 2, 8, 16, { defaultGrams: 30 }),
  food("pickle", "Pickle", "अचार", ["achar"], 128, 1, 10, 9, { defaultGrams: 15 }),
  food("papad", "Papad", "पापड़", ["papadum"], 371, 19, 60, 3, { piece: 12, defaultGrams: 12 }),
  food("gulab-jamun", "Gulab jamun", "गुलाब जामुन", ["gulab jamun"], 348, 4, 52, 14, { piece: 40, defaultGrams: 40 }),
  food("butter", "Butter", "मक्खन", ["makhan"], 717, 0.9, 0.1, 81, { defaultGrams: 10 }),
];

export const QUICK_IDS = ["roti", "rice", "dal", "egg", "curd", "banana", "salad", "paneer"] as const;

export function foodById(id: string): Food | undefined {
  return FOODS.find((f) => f.id === id);
}

export function searchFoods(query: string): Food[] {
  const n = query.trim().toLowerCase();
  if (n.length < 1) return [];
  return FOODS.map((item) => {
    let score = 0;
    for (const name of item.aliases) {
      if (name === n) score = Math.max(score, 100);
      else if (name.startsWith(n)) score = Math.max(score, 70 + Math.min(name.length, 20));
      else if (name.includes(n)) score = Math.max(score, 40);
    }
    return { item, score };
  })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, 6)
    .map((row) => row.item);
}
