import type { Allergy, DietPreference, DietaryPattern, NutritionGoal } from "@/types/recipe";

const PREF_LABELS: Record<DietPreference, string> = {
  gluten_free: "Gluten free",
  dairy_free: "Dairy free",
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  low_sodium: "Low sodium",
  low_fodmap: "Low FODMAP",
  nightshade_free: "Nightshade free",
  nut_free: "Nut free",
  soy_free: "Soy free",
  egg_free: "Egg free",
  halal_friendly: "Halal friendly",
  kosher_friendly: "Kosher friendly",
};

const GOAL_LABELS: Record<NutritionGoal, string> = {
  high_protein: "High protein",
  keto: "Keto",
  low_carb: "Low carb",
  weight_loss: "Weight loss",
  muscle_gain: "Muscle gain",
  balanced_meals: "Balanced meals",
  anti_inflammatory: "Anti-inflammatory",
  blood_sugar_friendly: "Blood sugar friendly",
};

const DIETARY_PATTERN_LABELS: Record<DietaryPattern, string> = {
  omnivore: "Omnivore",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  pescatarian: "Pescatarian",
};

const ALLERGY_LABELS: Record<Allergy, string> = {
  peanuts: "Peanuts",
  tree_nuts: "Tree nuts",
  shellfish: "Shellfish",
  fish: "Fish",
  milk: "Milk",
  eggs: "Eggs",
  soy: "Soy",
  sesame: "Sesame",
  wheat: "Wheat",
};

export function formatPreferenceLabels(prefs: DietPreference[]): string[] {
  return prefs.map((p) => PREF_LABELS[p]);
}

export function formatGoalLabels(goals: NutritionGoal[]): string[] {
  return goals.map((g) => GOAL_LABELS[g]);
}

export function formatDietaryPatternLabel(pattern: DietaryPattern): string {
  return DIETARY_PATTERN_LABELS[pattern];
}

export function formatAllergyLabels(allergies: Allergy[]): string[] {
  return allergies.map((a) => ALLERGY_LABELS[a]);
}

export const DIETARY_PATTERNS: { id: DietaryPattern; label: string }[] = [
  { id: "omnivore", label: "Omnivore" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "pescatarian", label: "Pescatarian" },
];

export const RESTRICTIONS: { id: DietPreference; label: string }[] = Object.entries(PREF_LABELS).map(
  ([id, label]) => ({ id: id as DietPreference, label })
);

export const GOALS: { id: NutritionGoal; label: string }[] = Object.entries(GOAL_LABELS).map(([id, label]) => ({
  id: id as NutritionGoal,
  label,
}));

export const ALLERGIES: { id: Allergy; label: string }[] = Object.entries(ALLERGY_LABELS).map(([id, label]) => ({
  id: id as Allergy,
  label,
}));

/** @deprecated Import `getRecipeOutputLanguageLabel` from `@/lib/languages` instead. */
export { getRecipeOutputLanguageLabel as formatPreferredLanguageLabel } from "@/lib/languages";
