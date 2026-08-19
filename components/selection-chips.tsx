"use client";

import type { DietPreference, NutritionGoal } from "@/types/recipe";

const PREFS: { id: DietPreference; label: string }[] = [
  { id: "gluten_free", label: "Gluten free" },
  { id: "dairy_free", label: "Dairy free" },
  { id: "vegan", label: "Vegan" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "low_sodium", label: "Low sodium" },
  { id: "low_fodmap", label: "Low FODMAP" },
  { id: "nightshade_free", label: "Nightshade free" },
  { id: "nut_free", label: "Nut free" },
  { id: "soy_free", label: "Soy free" },
  { id: "egg_free", label: "Egg free" },
  { id: "halal_friendly", label: "Halal friendly" },
  { id: "kosher_friendly", label: "Kosher friendly" },
];

const GOALS: { id: NutritionGoal; label: string }[] = [
  { id: "high_protein", label: "High protein" },
  { id: "keto", label: "Keto" },
  { id: "low_carb", label: "Low carb" },
  { id: "weight_loss", label: "Weight loss" },
  { id: "muscle_gain", label: "Muscle gain" },
  { id: "balanced_meals", label: "Balanced meals" },
  { id: "anti_inflammatory", label: "Anti-inflammatory" },
  { id: "blood_sugar_friendly", label: "Blood sugar friendly" },
];

export function SelectionChips({
  preferences,
  goals,
  onTogglePreference,
  onToggleGoal,
}: {
  preferences: DietPreference[];
  goals: NutritionGoal[];
  onTogglePreference: (p: DietPreference) => void;
  onToggleGoal: (g: NutritionGoal) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-reelish-muted">Dietary preferences</p>
        <div className="flex flex-wrap gap-2">
          {PREFS.map((p) => {
            const on = preferences.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onTogglePreference(p.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  on
                    ? "border-reelish-accent bg-reelish-accent/20 text-reelish-cream"
                    : "border-reelish-border text-reelish-muted hover:border-reelish-muted"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-reelish-muted">Nutrition goals</p>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => {
            const on = goals.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onToggleGoal(g.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  on
                    ? "border-reelish-gold/80 bg-reelish-gold/10 text-reelish-cream"
                    : "border-reelish-border text-reelish-muted hover:border-reelish-muted"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
