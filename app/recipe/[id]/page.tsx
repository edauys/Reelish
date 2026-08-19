import Link from "next/link";
import { notFound } from "next/navigation";
import { ExtractionEvidencePanel } from "@/components/extraction-evidence-panel";
import { RecipeIngredientList, RecipeStepsList } from "@/components/recipe-ingredient-list";
import { SiteHeader } from "@/components/site-header";
import { RecipeDetailActions } from "@/components/recipe-detail-actions";
import { createClient } from "@/lib/supabase/server";
import { formatGoalLabels, formatPreferenceLabels } from "@/lib/labels";
import type {
  DietPreference,
  NutritionGoal,
  PersonalizedRecipe,
  RecipeIngestionSource,
  RecipePayload,
  SubstitutionEntry,
} from "@/types/recipe";

function ingestionLabel(s: RecipeIngestionSource | undefined): string | null {
  if (!s) return null;
  switch (s) {
    case "shared_text":
      return "Shared caption/text";
    case "shared_title":
      return "Shared title";
    case "shared_text_and_title":
      return "Shared caption + title";
    case "pasted_text":
      return "Pasted text";
    case "url_only_insufficient":
      return "Link only (no recipe extracted)";
    case "media_supplemented":
      return "Shared media (with or without caption)";
    case "url_retrieval_supplemented":
      return "Link + recovered source URL text";
    case "minimal_caption_hint":
      return "Short caption or dish name only";
    default:
      return null;
  }
}

type SavedRow = {
  id: string;
  title: string;
  source_url: string | null;
  source_platform?: string | null;
  creator_handle?: string | null;
  created_at: string;
  converted_at?: string | null;
  is_favorite?: boolean;
  selected_preferences: DietPreference[];
  selected_goals: NutritionGoal[];
  substitutions: SubstitutionEntry[];
  original_recipe_json: RecipePayload;
  personalized_recipe_json: PersonalizedRecipe | null;
};

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("saved_recipes")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const row = data as SavedRow;
  const original = row.original_recipe_json;
  const personalized = row.personalized_recipe_json ?? null;
  const tagList = [
    ...formatPreferenceLabels(row.selected_preferences),
    ...formatGoalLabels(row.selected_goals),
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader email={user.email ?? null} />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8">
        <Link href="/saved" className="text-sm text-reelish-gold hover:underline">
          ← Back to saved
        </Link>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-reelish-cream">
          {(personalized?.title ?? original.title)}
        </h1>
        <p className="mt-1 text-xs text-reelish-muted">
          Saved{" "}
          {new Date(row.created_at).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}
        </p>
        <p className="mt-1 text-xs text-reelish-muted">
          Source: {row.source_platform ?? original.sourceType ?? "manual"}{" "}
          {row.creator_handle ? `· ${row.creator_handle}` : ""}
        </p>
        {row.source_url ? (
          <a href={row.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-reelish-gold hover:underline">
            View original video
          </a>
        ) : null}
        {ingestionLabel(original.ingestionSource) ? (
          <p className="mt-1 text-xs text-reelish-muted">Imported from: {ingestionLabel(original.ingestionSource)}</p>
        ) : null}
        <div className="mt-2 max-w-2xl">
          <ExtractionEvidencePanel recipe={original} />
        </div>
        <RecipeDetailActions id={row.id} converted={!!personalized} isFavorite={!!row.is_favorite} />

        {tagList.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {tagList.map((t) => (
              <span key={t} className="rounded-full border border-reelish-border px-3 py-1 text-xs text-reelish-cream">
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <section className="mt-10 rounded-card border border-reelish-border bg-reelish-surface p-5">
          <h2 className="font-serif text-xl text-reelish-cream">Original</h2>
          <p className="mt-1 text-sm text-reelish-muted">{original.title}</p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-reelish-muted">Ingredients</h3>
              <RecipeIngredientList
                ingredients={original.ingredients}
                className="mt-2 list-disc space-y-1 pl-5 text-sm text-reelish-cream/95"
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-reelish-muted">Steps</h3>
              <RecipeStepsList
                steps={original.steps}
                className="mt-2 list-decimal space-y-1 pl-5 text-sm text-reelish-cream/95"
              />
            </div>
          </div>
        </section>

        {personalized ? (
          <section className="mt-6 rounded-card border border-reelish-accent/35 bg-reelish-elevated/40 p-5">
            <h2 className="font-serif text-xl text-reelish-cream">Your Reelish version</h2>
            {personalized.rationale ? <p className="mt-2 text-sm text-reelish-muted">{personalized.rationale}</p> : null}
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-reelish-muted">Ingredients</h3>
                <RecipeIngredientList
                  ingredients={personalized.ingredients}
                  className="mt-2 list-disc space-y-1 pl-5 text-sm text-reelish-cream/95"
                />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-reelish-muted">Steps</h3>
                <RecipeStepsList
                  steps={personalized.steps}
                  className="mt-2 list-decimal space-y-1 pl-5 text-sm text-reelish-cream/95"
                />
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-card border border-reelish-border bg-reelish-surface/60 p-5">
            <h2 className="font-serif text-xl text-reelish-cream">No conversion yet</h2>
            <p className="mt-2 text-sm text-reelish-muted">
              This recipe is saved as original. Tap <strong>Convert recipe</strong> to apply your profile.
            </p>
          </section>
        )}

        {row.substitutions?.length ? (
          <section className="mt-6 rounded-card border border-reelish-border bg-reelish-surface/80 p-5">
            <h2 className="font-serif text-xl text-reelish-cream">Substitutions</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {row.substitutions.map((s, i) => (
                <li key={i} className="text-reelish-muted">
                  <span className="text-reelish-cream">{s.from}</span> → <span className="text-reelish-cream">{s.to}</span>
                  <span className="mt-0.5 block text-xs">{s.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
