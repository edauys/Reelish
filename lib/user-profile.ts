import type {
  Allergy,
  DietPreference,
  DietaryPattern,
  NutritionGoal,
  PreferredLanguage,
  UserProfile,
} from "@/types/recipe";

/** Row shape for `user_profiles` selects used by `fromDbProfile`. */
export type RawUserProfile = {
  dietary_pattern: DietaryPattern | null;
  restrictions: DietPreference[] | null;
  allergies: Allergy[] | null;
  disliked_ingredients: string[] | null;
  goals: NutritionGoal[] | null;
  preferred_language: PreferredLanguage | null;
  onboarding_completed: boolean | null;
};

export const DEFAULT_USER_PROFILE: UserProfile = {
  dietaryPattern: "omnivore",
  restrictions: [],
  allergies: [],
  dislikedIngredients: [],
  goals: [],
  preferredLanguage: "en",
  onboardingCompleted: false,
};

export function fromDbProfile(row: RawUserProfile | null | undefined): UserProfile {
  if (!row) return DEFAULT_USER_PROFILE;
  return {
    dietaryPattern: row.dietary_pattern ?? "omnivore",
    restrictions: row.restrictions ?? [],
    allergies: row.allergies ?? [],
    dislikedIngredients: row.disliked_ingredients ?? [],
    goals: row.goals ?? [],
    preferredLanguage: row.preferred_language ?? "en",
    onboardingCompleted: !!row.onboarding_completed,
  };
}

export function toDbProfile(profile: UserProfile) {
  return {
    dietary_pattern: profile.dietaryPattern,
    restrictions: profile.restrictions,
    allergies: profile.allergies,
    disliked_ingredients: profile.dislikedIngredients.map((v) => v.trim()).filter(Boolean),
    goals: profile.goals,
    preferred_language: profile.preferredLanguage ?? "en",
    onboarding_completed: profile.onboardingCompleted ?? true,
  };
}

export function profileToPreferences(profile: UserProfile): {
  preferences: DietPreference[];
  goals: NutritionGoal[];
} {
  const prefs = new Set<DietPreference>(profile.restrictions);
  if (profile.dietaryPattern === "vegan") prefs.add("vegan");
  if (profile.dietaryPattern === "vegetarian") prefs.add("vegetarian");
  return { preferences: [...prefs], goals: profile.goals };
}

