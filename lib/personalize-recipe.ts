import type {
  Allergy,
  ConversionContext,
  DietPreference,
  DietaryPattern,
  NutritionGoal,
  PersonalizedRecipe,
  RecipePayload,
  SubstitutionEntry,
} from "@/types/recipe";
import { enrichRecipePayloadWithStructuredIngredients } from "@/lib/ingredients/enrich-payload";
import { formatIngredientLine, normalizedRecipePayload } from "@/lib/ingredient-format";
import { applyIngredientRules, stepAdjustments } from "@/lib/substitutions";

const PREF_LABELS: Record<DietPreference, string> = {
  gluten_free: "Gluten Free",
  dairy_free: "Dairy Free",
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  low_sodium: "Low Sodium",
  low_fodmap: "Low FODMAP",
  nightshade_free: "Nightshade Free",
  nut_free: "Nut Free",
  soy_free: "Soy Free",
  egg_free: "Egg Free",
  halal_friendly: "Halal Friendly",
  kosher_friendly: "Kosher Friendly",
};

const GOAL_LABELS: Record<NutritionGoal, string> = {
  high_protein: "High Protein",
  keto: "Keto",
  low_carb: "Low Carb",
  weight_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  balanced_meals: "Balanced Meals",
  anti_inflammatory: "Anti-inflammatory",
  blood_sugar_friendly: "Blood Sugar Friendly",
};

/**
 * MVP personalization: deterministic rules in `substitutions.ts`.
 * Future: call OpenAI with structured JSON schema; map into PersonalizedRecipe.
 */
export function personalizeRecipe(
  original: RecipePayload,
  prefs: DietPreference[],
  goals: NutritionGoal[]
): PersonalizedRecipe {
  return personalizeRecipeWithContext(original, {
    preferences: prefs,
    goals,
  });
}

export function personalizeRecipeWithContext(
  original: RecipePayload,
  context: ConversionContext
): PersonalizedRecipe {
  const structured =
    original.ingredientsStructured && original.ingredientsStructured.length > 0
      ? original
      : enrichRecipePayloadWithStructuredIngredients(original);
  const base = normalizedRecipePayload(structured);
  const prefs = context.preferences;
  const goals = context.goals;
  const allergies = context.allergies ?? [];
  const dislikes = context.dislikedIngredients ?? [];
  const dietaryPattern = context.dietaryPattern;
  const allSubs: SubstitutionEntry[] = [];

  const newIngredients = base.ingredients
    .map((line) => {
      let working = line;
      const highestPriority = applySafetyConstraints(working, allergies, prefs, dislikes, dietaryPattern);
      working = highestPriority.line;
      allSubs.push(...highestPriority.subs);
      const { line: updated, subs } = applyIngredientRules(working, prefs, goals, dietaryPattern);
      allSubs.push(...subs);
      return formatIngredientLine(updated);
    })
    .filter(Boolean);

  const { steps: newStepsRaw, notes } = stepAdjustments(base.steps, prefs, goals, dietaryPattern);
  const newSteps = newStepsRaw.map((s) => sanitizeStepForSafety(s, allergies, prefs, dislikes));

  const labelParts = [
    ...prefs.map((p) => PREF_LABELS[p]),
    ...goals.map((g) => GOAL_LABELS[g]),
  ];
  const suffix = labelParts.length ? ` — ${labelParts.join(", ")}` : "";

  const rationaleParts: string[] = [];
  if (prefs.length || goals.length) {
    rationaleParts.push(
      `Adjusted for ${labelParts.join(", ") || "your profile"} while keeping the dish satisfying.`
    );
  }
  if (allergies.length || dislikes.length) {
    rationaleParts.push(
      "Safety-first conversion applied: allergy/restriction/dislike conflicts were replaced before goal optimizations."
    );
  }
  if (notes.length) rationaleParts.push(...notes);
  if (allSubs.length) {
    rationaleParts.push(
      `Key swaps: ${allSubs
        .slice(0, 5)
        .map((s) => s.reason)
        .filter(Boolean)
        .join(" · ")}`
    );
  }
  const hasEstimatedLines =
    (base.ingredientsStructured?.some((l) => l.estimated || (l.parseConfidence ?? 1) < 0.6) ?? false) ||
    (base.extractionWarnings?.some((w) => /estimated|inferred|partial/i.test(w)) ?? false);
  if ((prefs.length || goals.length || allergies.length || dislikes.length) && hasEstimatedLines) {
    rationaleParts.push(
      "Some ingredient lines were ambiguous in the source; swaps prioritize safety and your goals, but review amounts."
    );
  }
  if (!rationaleParts.length) {
    rationaleParts.push("No specific preferences selected — showing the recipe as extracted.");
  }

  return {
    title: `${base.title}${suffix}`,
    ingredients: newIngredients,
    steps: newSteps,
    substitutions: dedupeSubs(allSubs),
    rationale: rationaleParts.join(" "),
  };
}

const SAFETY_RULES: Array<{
  token: RegExp;
  replacement: string;
  reason: string;
  appliesWhen: (active: Set<string>) => boolean;
}> = [
  { token: /\bpeanut(s| butter)?\b/i, replacement: "sunflower seed butter", reason: "Allergy-safe peanut swap", appliesWhen: (a) => a.has("peanuts") || a.has("nut_free") },
  { token: /\balmond(s| flour| milk)?\b|\bcashew(s| cream)?\b|\bwalnut(s)?\b|\bpistachio(s)?\b/i, replacement: "toasted pumpkin seeds", reason: "Allergy-safe tree nut swap", appliesWhen: (a) => a.has("tree_nuts") || a.has("nut_free") },
  { token: /\bshrimp\b|\bcrab\b|\blobster\b|\bshellfish\b/i, replacement: "hearts of palm", reason: "Shellfish-safe swap", appliesWhen: (a) => a.has("shellfish") },
  { token: /\bsalmon\b|\btuna\b|\bfish\b/i, replacement: "tofu or chickpeas", reason: "Fish-safe swap", appliesWhen: (a) => a.has("fish") || a.has("vegetarian") || a.has("vegan") },
  { token: /\bmilk\b|\bcream\b|\bcheese\b|\bbutter\b|\byogurt\b/i, replacement: "dairy-free alternative", reason: "Dairy-safe swap", appliesWhen: (a) => a.has("milk") || a.has("dairy_free") || a.has("vegan") },
  { token: /\begg(s)?\b/i, replacement: "flax egg", reason: "Egg-safe swap", appliesWhen: (a) => a.has("eggs") || a.has("egg_free") || a.has("vegan") },
  { token: /\bsoy sauce\b|\btofu\b|\bsoy\b/i, replacement: "coconut aminos or chickpeas", reason: "Soy-safe swap", appliesWhen: (a) => a.has("soy") || a.has("soy_free") },
  { token: /\bsesame\b|\btahini\b|\bsesame oil\b/i, replacement: "olive oil or sunflower seed paste", reason: "Sesame-safe swap", appliesWhen: (a) => a.has("sesame") },
  { token: /\bwheat\b|\bflour\b|\bpasta\b|\bbread\b/i, replacement: "gluten-free alternative", reason: "Wheat-safe swap", appliesWhen: (a) => a.has("wheat") || a.has("gluten_free") },
];

function applySafetyConstraints(
  line: string,
  allergies: Allergy[],
  preferences: DietPreference[],
  dislikes: string[],
  dietaryPattern?: DietaryPattern
): { line: string; subs: SubstitutionEntry[] } {
  const subs: SubstitutionEntry[] = [];
  let out = line;
  const active = new Set<string>([...allergies, ...preferences]);
  if (dietaryPattern === "vegan") active.add("vegan");
  if (dietaryPattern === "vegetarian") active.add("vegetarian");
  if (dietaryPattern === "pescatarian") active.add("pescatarian");
  for (const r of SAFETY_RULES) {
    if (!r.appliesWhen(active)) continue;
    if (!r.token.test(out)) continue;
    const before = out;
    out = out.replace(r.token, r.replacement);
    if (before !== out) {
      subs.push({ from: before, to: out, reason: r.reason });
    }
  }

  for (const disliked of dislikes) {
    const d = disliked.trim().toLowerCase();
    if (!d) continue;
    const rx = new RegExp(`\\b${escapeRegExp(d)}\\b`, "i");
    if (!rx.test(out)) continue;
    const before = out;
    out = out.replace(rx, "an alternative ingredient");
    subs.push({ from: before, to: out, reason: `Removed disliked ingredient: ${disliked}` });
  }

  if ((active.has("vegan") || active.has("vegetarian")) && /\bchicken|beef|pork|turkey|meat\b/i.test(out)) {
    const before = out;
    out = out.replace(/\bchicken|beef|pork|turkey|meat\b/gi, "tofu or legumes");
    subs.push({
      from: before,
      to: out,
      reason: active.has("vegan") ? "Vegan-friendly protein swap" : "Vegetarian protein swap",
    });
  }

  if (active.has("pescatarian") && /\bchicken|beef|pork|turkey|meat\b/i.test(out)) {
    const before = out;
    out = out.replace(/\bchicken|beef|pork|turkey|meat\b/gi, "fish or tofu");
    subs.push({ from: before, to: out, reason: "Pescatarian protein swap" });
  }

  return { line: out, subs };
}

function sanitizeStepForSafety(
  step: string,
  allergies: Allergy[],
  preferences: DietPreference[],
  dislikes: string[]
) {
  let out = step;
  if (allergies.length || preferences.includes("gluten_free")) {
    out = out.replace(/\bpeanuts?\b/gi, "seed topping");
    out = out.replace(/\bsoy sauce\b/gi, "coconut aminos");
    out = out.replace(/\bwheat pasta\b/gi, "gluten-free pasta");
  }
  for (const disliked of dislikes) {
    const rx = new RegExp(`\\b${escapeRegExp(disliked.trim())}\\b`, "i");
    out = out.replace(rx, "your preferred ingredient");
  }
  return out;
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeSubs(subs: SubstitutionEntry[]): SubstitutionEntry[] {
  const seen = new Set<string>();
  return subs.filter((s) => {
    const k = s.from + "|" + s.to;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
