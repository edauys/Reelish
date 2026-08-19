import type {
  DietPreference,
  DietaryPattern,
  NutritionGoal,
  SubstitutionEntry,
} from "@/types/recipe";

/**
 * Rule-based substitution tables for personalization.
 * Patterns include common English plus Korean/Turkish tokens so multilingual extractions still match.
 */

export interface SubstitutionRule {
  match: RegExp;
  replace: string;
  reason: (tag: string) => string;
  tags: Set<string>;
}

const tag = (s: string) => s;

/** Order matters: earlier rules run first; we re-scan the line until no rule applies (multi-pass). */
const rules: SubstitutionRule[] = [
  // --- Starch / sugar (keto, low carb, weight loss) before gluten-free pasta swaps ---
  {
    match: /\b(sugar|brown sugar|granulated sugar|설탕|şeker)\b/gi,
    replace: "monk fruit or erythritol (half the volume, taste and adjust)",
    reason: () => tag("Lower sugar: reduced-calorie sweetener"),
    tags: new Set(["keto", "low_carb", "weight_loss", "anti_inflammatory"]),
  },
  {
    match: /\b(white rice|jasmine rice|쌀밥|pilav|pirinç pilavı)\b/gi,
    replace: "riced cauliflower or half rice / half cauliflower",
    reason: () => tag("Low carb / weight loss: reduce refined starch"),
    tags: new Set(["keto", "low_carb", "weight_loss"]),
  },
  {
    match: /\b(bread|potatoes?|potato|toast)\b/gi,
    replace: "extra non-starchy vegetables or a small portion of roasted sweet potato",
    reason: () => tag("Low carb / weight loss: lighten starch"),
    tags: new Set(["keto", "low_carb", "weight_loss"]),
  },
  {
    match: /\b(penne|spaghetti|linguine|fettuccine|fusilli|macaroni|noodles?|pasta|국수|면)\b/gi,
    replace: "shirataki noodles, zucchini noodles, or gluten-free chickpea pasta (pick by carb goal)",
    reason: () => tag("Carb-aware: pasta → lower-carb or GF noodles"),
    tags: new Set(["keto", "low_carb", "weight_loss", "gluten_free"]),
  },
  {
    match: /\b(tortilla|wraps?|lavash)\b/gi,
    replace: "lettuce cups or gluten-free tortillas",
    reason: () => tag("Lower carb / gluten aware: lighter wrap"),
    tags: new Set(["gluten_free", "low_carb", "keto", "weight_loss"]),
  },
  // --- Gluten ---
  {
    match: /\ball[- ]purpose flour\b|\bap flour\b|\bflour\b/gi,
    replace: "gluten-free 1:1 baking flour",
    reason: () => tag("Gluten free: wheat flour → GF blend"),
    tags: new Set(["gluten_free"]),
  },
  {
    match: /\bbreadcrumbs?\b|\bpanko\b/gi,
    replace: "crushed gluten-free crackers or almond meal",
    reason: () => tag("Gluten free: wheat crumbs → GF crumbs"),
    tags: new Set(["gluten_free"]),
  },
  {
    match: /\bsoy sauce\b/gi,
    replace: "gluten-free tamari or coconut aminos",
    reason: () => tag("Gluten free: avoid wheat in soy sauce"),
    tags: new Set(["gluten_free"]),
  },
  // --- Cooking fats (anti-inflammatory, dairy-free) ---
  {
    match: /\b(vegetable oil|canola oil|corn oil|식용유|ayıcı yağı)\b/gi,
    replace: "extra-virgin olive oil or avocado oil",
    reason: () => tag("Anti-inflammatory: prefer olive/avocado fat"),
    tags: new Set(["anti_inflammatory", "balanced_meals"]),
  },
  {
    match: /\b(butter|margarine|버터|마가린|tereyağı|tereyagi)\b/gi,
    replace: "olive oil or dairy-free buttery spread",
    reason: () => tag("Dairy free / AI: butter → plant fat"),
    tags: new Set(["dairy_free", "vegan", "anti_inflammatory"]),
  },
  {
    match: /\b(heavy cream|double cream|whipping cream|sour cream|cream cheese|mascarpone|ricotta|크림|kaymak|krema)\b/gi,
    replace: "full-fat coconut cream or unsweetened cashew cream",
    reason: () => tag("Dairy free: rich cream → plant cream"),
    tags: new Set(["dairy_free", "vegan"]),
  },
  {
    match: /\b(milk|whole milk|skim milk|buttermilk|우유|süt)\b/gi,
    replace: "unsweetened oat or almond milk",
    reason: () => tag("Dairy free: milk → plant milk"),
    tags: new Set(["dairy_free", "vegan"]),
  },
  {
    match: /\b(parmesan|cheddar|mozzarella|feta|cheese|치즈|peynir)\b/gi,
    replace: "nutritional yeast or dairy-free cheese shreds",
    reason: () => tag("Dairy free: cheese → plant-based alternative"),
    tags: new Set(["dairy_free", "vegan"]),
  },
  {
    match: /\b(yogurt|yoghurt|Greek yogurt|요거트|yoğurt)\b/gi,
    replace: "unsweetened coconut or soy yogurt",
    reason: () => tag("Dairy free: yogurt → plant yogurt"),
    tags: new Set(["dairy_free", "vegan"]),
  },
  {
    match: /\b(ice cream)\b/gi,
    replace: "unsweetened coconut-milk frozen dessert (small portion)",
    reason: () => tag("Dairy free: ice cream → non-dairy frozen treat"),
    tags: new Set(["dairy_free", "vegan", "weight_loss"]),
  },
  // --- Vegan / vegetarian proteins ---
  {
    match: /\b(chicken breast|chicken thighs?|chicken)\b|\bbeef\b|\bpork\b|\bground turkey\b|\blamb\b|\bmeat\b/gi,
    replace: "firm tofu or tempeh, well seasoned",
    reason: () => tag("Vegan: animal protein → soy"),
    tags: new Set(["vegan"]),
  },
  {
    match: /\bsalmon\b|\bfish\b|\btuna\b|\bshrimp\b/gi,
    replace: "marinated tofu or hearts of palm (fish-style)",
    reason: () => tag("Vegan: seafood → plant alternative"),
    tags: new Set(["vegan"]),
  },
  {
    match: /\begg(s)?\b/gi,
    replace: "flax egg (1 tbsp ground flax + 3 tbsp water per egg) or aquafaba",
    reason: () => tag("Vegan: eggs → plant binder"),
    tags: new Set(["vegan"]),
  },
  {
    match: /\bhoney\b/gi,
    replace: "maple syrup (vegan)",
    reason: () => tag("Vegan: honey → plant sweetener"),
    tags: new Set(["vegan"]),
  },
  {
    match: /\bgelatin\b/gi,
    replace: "agar powder",
    reason: () => tag("Vegan: gelatin → agar"),
    tags: new Set(["vegan"]),
  },
  {
    match: /\b(salmon|chicken|beef|pork|ground turkey|fish|meat|lamb)\b/gi,
    replace: "beans, lentils, paneer (if vegetarian), or extra vegetables",
    reason: () => tag("Vegetarian: meat/fish → plant proteins"),
    tags: new Set(["vegetarian"]),
  },
  // --- Sodium ---
  {
    match: /\bsoy sauce\b/gi,
    replace: "low-sodium tamari (half volume, add water)",
    reason: () => tag("Low sodium: cut salty condiments"),
    tags: new Set(["low_sodium"]),
  },
  {
    match: /\bsalt\b/gi,
    replace: "half the salt; finish with lemon, herbs, or pepper",
    reason: () => tag("Low sodium: reduce salt, boost flavor"),
    tags: new Set(["low_sodium"]),
  },
  // --- High protein (narrow replaces to avoid mangling lines) ---
  {
    match: /\b(lentils?|black beans?|chickpeas?)\b/gi,
    replace: "a larger portion of the same legumes (~¼ cup more)",
    reason: () => tag("High protein: larger legume portion"),
    tags: new Set(["high_protein", "muscle_gain"]),
  },
  {
    match: /\bquinoa\b|\bbrown rice\b/gi,
    replace: "the same grain (add 1 tbsp hemp or pumpkin seeds on top)",
    reason: () => tag("High protein: add seeds for amino acids"),
    tags: new Set(["high_protein", "muscle_gain"]),
  },
  // --- Balanced / blood sugar ---
  {
    match: /\b(white bread|white rice|instant rice)\b/gi,
    replace: "whole-grain bread or brown rice (smaller portion)",
    reason: () => tag("Balanced meals: prefer whole grains"),
    tags: new Set(["balanced_meals", "blood_sugar_friendly"]),
  },
  {
    match: /\b(all[- ]purpose flour|cake flour|pastry flour)\b/gi,
    replace: "whole wheat pastry flour or almond flour (use less liquid if batter loosens)",
    reason: () => tag("Blood sugar friendly: reduce refined flour"),
    tags: new Set(["blood_sugar_friendly"]),
  },
  {
    match: /\b(corn syrup|high fructose)\b/gi,
    replace: "a small amount of maple syrup or omit",
    reason: () => tag("Blood sugar friendly: avoid liquid sugars"),
    tags: new Set(["blood_sugar_friendly"]),
  },
  {
    match: /\b(shortening|lard)\b/gi,
    replace: "extra-virgin olive oil (smaller amount)",
    reason: () => tag("Anti-inflammatory: avoid industrial fats"),
    tags: new Set(["anti_inflammatory"]),
  },
  {
    match: /\b(mayonnaise|mayo)\b/gi,
    replace: "Greek yogurt (half volume) or avocado",
    reason: () => tag("Balanced / weight goals: lighter creamy texture"),
    tags: new Set(["balanced_meals", "weight_loss", "anti_inflammatory"]),
  },
];

const activeTags = (
  prefs: DietPreference[],
  goals: NutritionGoal[],
  dietaryPattern?: DietaryPattern
): Set<string> => {
  const s = new Set<string>([...prefs, ...goals]);
  if (dietaryPattern) s.add(dietaryPattern);
  return s;
};

function reasonForRule(rule: SubstitutionRule, tags: Set<string>): string {
  const hit = [...rule.tags].filter((t) => tags.has(t as DietPreference | NutritionGoal));
  return rule.reason(hit.join(", "));
}

export function applyIngredientRules(
  line: string,
  prefs: DietPreference[],
  goals: NutritionGoal[],
  dietaryPattern?: DietaryPattern
): { line: string; subs: SubstitutionEntry[] } {
  const tags = activeTags(prefs, goals, dietaryPattern);
  const subs: SubstitutionEntry[] = [];
  let result = line;

  for (let pass = 0; pass < 16; pass++) {
    let changed = false;
    for (const rule of rules) {
      const applies = [...rule.tags].some((t) => tags.has(t as DietPreference | NutritionGoal));
      if (!applies) continue;
      if (rule.tags.has("vegetarian") && tags.has("vegan")) continue;
      if (rule.tags.has("vegetarian") && tags.has("pescatarian")) continue;
      if (!rule.match.test(result)) continue;
      const before = result;
      result = result.replace(rule.match, rule.replace);
      if (before !== result) {
        subs.push({
          from: before,
          to: result,
          reason: reasonForRule(rule, tags),
        });
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }

  return { line: result, subs };
}

export function stepAdjustments(
  steps: string[],
  prefs: DietPreference[],
  goals: NutritionGoal[],
  dietaryPattern?: DietaryPattern
): { steps: string[]; notes: string[] } {
  const tags = activeTags(prefs, goals, dietaryPattern);
  const notes: string[] = [];
  const out = steps.map((s) => {
    let t = s;

    if (tags.has("dairy_free") || tags.has("vegan")) {
      if (/\b(melt(ed|ing)?\s+butter|butter in|with butter|버터|tereyağı)\b/gi.test(t)) {
        notes.push("Dairy free: use olive oil or a neutral cooking oil where the step uses butter.");
        t = t.replace(/\bbutter\b/gi, "olive oil");
      }
    }

    if (tags.has("weight_loss") && /\b(fry|deep[- ]?fry|oil|sauté|saute)\b/gi.test(t)) {
      notes.push("Weight loss: prefer dry-heat, air-fry, or minimal oil; drain excess fat.");
      t = t.replace(/\b(\d+)\s*(tbsp|tablespoons?)\s+(of\s+)?(oil|olive oil)\b/gi, "1 tsp oil");
    }

    if (tags.has("anti_inflammatory")) {
      if (/\bdeep[- ]?fry|fried\b/gi.test(t)) {
        notes.push("Anti-inflammatory: bake, air-fry, or pan-sear with minimal oil instead of deep frying.");
      }
    }

    if (tags.has("balanced_meals")) {
      if (/\bserve\b/gi.test(t) && !/vegetable|salad|greens/i.test(t)) {
        t += " Add a generous side salad or steamed vegetables for balance.";
      }
    }

    if (tags.has("high_protein") && /\bserve|plate|garnish|top\b/gi.test(t)) {
      t += " Optional: add shelled edamame or extra grilled tofu on the side for more protein.";
    }

    return t;
  });

  return { steps: out, notes: [...new Set(notes)] };
}
