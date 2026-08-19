"use server";

import { revalidatePath } from "next/cache";
import { normalizedPersonalizedRecipe, normalizedRecipePayload } from "@/lib/ingredient-format";
import { personalizeRecipeWithContext } from "@/lib/personalize-recipe";
import { createClient } from "@/lib/supabase/server";
import { fromDbProfile, profileToPreferences } from "@/lib/user-profile";
import type {
  DietPreference,
  NutritionGoal,
  PersonalizedRecipe,
  RecipePayload,
  SubstitutionEntry,
} from "@/types/recipe";

type SavePayload = {
  title: string;
  sourceUrl: string | null;
  sourcePlatform?: string | null;
  creatorHandle?: string | null;
  original: RecipePayload;
  personalized?: PersonalizedRecipe | null;
  preferences: DietPreference[];
  goals: NutritionGoal[];
  substitutions: SubstitutionEntry[];
};

export async function saveRecipeAction(payload: SavePayload): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to save recipes." };

  const { error, data } = await supabase
    .from("saved_recipes")
    .insert({
      user_id: user.id,
      title: payload.title,
      source_url: payload.sourceUrl,
      source_platform: payload.sourcePlatform ?? payload.original.sourceType ?? null,
      creator_handle: payload.creatorHandle ?? payload.original.creatorHandle ?? null,
      original_recipe_json: normalizedRecipePayload(payload.original) as unknown as Record<string, unknown>,
      personalized_recipe_json: payload.personalized
        ? (normalizedPersonalizedRecipe(payload.personalized) as unknown as Record<string, unknown>)
        : null,
      selected_preferences: payload.preferences,
      selected_goals: payload.goals,
      substitutions: payload.substitutions,
      converted_at: payload.personalized ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/saved");
  revalidatePath(`/recipe/${data.id}`);
  return { id: data.id };
}

export async function deleteRecipeAction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("saved_recipes").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/saved");
  revalidatePath(`/recipe/${id}`);
  return {};
}

export async function toggleFavoriteRecipeAction(id: string, isFavorite: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("saved_recipes")
    .update({ is_favorite: isFavorite })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/saved");
  revalidatePath(`/recipe/${id}`);
  return {};
}

export async function convertSavedRecipeAction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: row, error: rowErr } = await supabase
    .from("saved_recipes")
    .select("id, original_recipe_json")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (rowErr || !row) return { error: rowErr?.message ?? "Recipe not found." };

  const { data: profileRow } = await supabase
    .from("user_profiles")
    .select("dietary_pattern, restrictions, allergies, disliked_ingredients, goals, preferred_language, onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = fromDbProfile(profileRow);
  const { preferences, goals } = profileToPreferences(profile);
  const original = row.original_recipe_json as unknown as RecipePayload;
  const converted = personalizeRecipeWithContext(original, {
    preferences,
    goals,
    allergies: profile.allergies,
    dietaryPattern: profile.dietaryPattern,
    dislikedIngredients: profile.dislikedIngredients,
  });

  const { error } = await supabase
    .from("saved_recipes")
    .update({
      title: converted.title,
      personalized_recipe_json: converted as unknown as Record<string, unknown>,
      substitutions: converted.substitutions,
      selected_preferences: preferences,
      selected_goals: goals,
      converted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/saved");
  revalidatePath(`/recipe/${id}`);
  return {};
}

export async function duplicateRecipeAction(id: string): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: row, error: rowErr } = await supabase.from("saved_recipes").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (rowErr || !row) return { error: rowErr?.message ?? "Recipe not found." };

  const { data, error } = await supabase
    .from("saved_recipes")
    .insert({
      user_id: user.id,
      title: `${row.title} (Copy)`,
      source_url: row.source_url,
      source_platform: row.source_platform,
      creator_handle: row.creator_handle,
      original_recipe_json: row.original_recipe_json,
      personalized_recipe_json: row.personalized_recipe_json,
      selected_preferences: row.selected_preferences ?? [],
      selected_goals: row.selected_goals ?? [],
      substitutions: row.substitutions ?? [],
      converted_at: row.converted_at,
      is_favorite: false,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/saved");
  return { id: data.id };
}

