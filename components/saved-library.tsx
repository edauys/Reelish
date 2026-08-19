"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  convertSavedRecipeAction,
  deleteRecipeAction,
  toggleFavoriteRecipeAction,
} from "@/app/actions/recipe-actions";
import { formatIngredientLine, formatStepLine } from "@/lib/ingredient-format";
import { formatSavedAtUtc } from "@/lib/format-saved-date";
import { GOALS, RESTRICTIONS, formatGoalLabels, formatPreferenceLabels } from "@/lib/labels";
import type { DietPreference, NutritionGoal, RecipePayload } from "@/types/recipe";

export type SavedRow = {
  id: string;
  title: string;
  source_url: string | null;
  source_platform?: string | null;
  creator_handle?: string | null;
  created_at: string;
  /** Set by server parent for stable SSR/client date text; optional for older callers. */
  created_at_display?: string;
  converted_at?: string | null;
  is_favorite?: boolean;
  selected_preferences: DietPreference[];
  selected_goals: NutritionGoal[];
  original_recipe_json: RecipePayload;
  personalized_recipe_json?: { title: string; ingredients: string[]; steps: string[]; rationale?: string } | null;
};

export function SavedLibrary({ rows }: { rows: SavedRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [prefFilter, setPrefFilter] = useState<DietPreference | "all">("all");
  const [goalFilter, setGoalFilter] = useState<NutritionGoal | "all">("all");
  const [versionFilter, setVersionFilter] = useState<"all" | "converted" | "original">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        const text = `${r.title} ${r.creator_handle ?? ""}`.toLowerCase();
        if (q && !text.includes(q)) return false;
        if (prefFilter !== "all" && !r.selected_preferences.includes(prefFilter)) return false;
        if (goalFilter !== "all" && !r.selected_goals.includes(goalFilter)) return false;
        if (versionFilter === "converted" && !r.personalized_recipe_json) return false;
        if (versionFilter === "original" && !!r.personalized_recipe_json) return false;
        return true;
      })
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [rows, query, prefFilter, goalFilter, versionFilter]);

  function confirmDelete(id: string) {
    if (!window.confirm("Delete this saved recipe? This cannot be undone.")) return;
    setBusyId(id);
    startTransition(async () => {
      await deleteRecipeAction(id);
      setBusyId(null);
      router.refresh();
    });
  }

  function convertNow(id: string) {
    setBusyId(id);
    startTransition(async () => {
      await convertSavedRecipeAction(id);
      setBusyId(null);
      router.refresh();
    });
  }

  function toggleFavorite(id: string, next: boolean) {
    setBusyId(id);
    startTransition(async () => {
      await toggleFavoriteRecipeAction(id, next);
      setBusyId(null);
      router.refresh();
    });
  }

  const preview = (r: SavedRow) => {
    const recipe = r.personalized_recipe_json ?? r.original_recipe_json;
    const firstIng = formatIngredientLine(recipe.ingredients?.[0]);
    const firstStep = formatStepLine(recipe.steps?.[0]);
    const line = firstIng || firstStep || "Open recipe for full details.";
    return line.length > 120 ? `${line.slice(0, 117)}...` : line;
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-card border border-reelish-border bg-reelish-surface p-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or creator"
          className="w-full rounded-xl border border-reelish-border bg-reelish-bg px-3 py-2 text-sm"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select
            value={prefFilter}
            onChange={(e) => setPrefFilter(e.target.value as DietPreference | "all")}
            className="rounded-xl border border-reelish-border bg-reelish-bg px-3 py-2 text-sm"
          >
            <option value="all">All restriction categories</option>
            {RESTRICTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            value={goalFilter}
            onChange={(e) => setGoalFilter(e.target.value as NutritionGoal | "all")}
            className="rounded-xl border border-reelish-border bg-reelish-bg px-3 py-2 text-sm"
          >
            <option value="all">All goals</option>
            {GOALS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          <select
            value={versionFilter}
            onChange={(e) => setVersionFilter(e.target.value as "all" | "converted" | "original")}
            className="rounded-xl border border-reelish-border bg-reelish-bg px-3 py-2 text-sm"
          >
            <option value="all">All versions</option>
            <option value="converted">Converted only</option>
            <option value="original">Original only</option>
          </select>
        </div>
      </div>

      <ul className="space-y-4">
        {list.map((r) => {
          const tags = [...formatPreferenceLabels(r.selected_preferences), ...formatGoalLabels(r.selected_goals)];
          const isBusy = isPending && busyId === r.id;
          const converted = !!r.personalized_recipe_json;
          return (
            <li key={r.id} className="rounded-card border border-reelish-border bg-reelish-surface p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-xl text-reelish-cream">{r.title}</h2>
                  <p className="mt-1 text-xs text-reelish-muted">
                    {r.created_at_display ?? formatSavedAtUtc(r.created_at)}
                  </p>
                  <p className="mt-1 text-xs text-reelish-muted">
                    {r.source_platform ?? "manual"} {r.creator_handle ? `· ${r.creator_handle}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFavorite(r.id, !r.is_favorite)}
                    className="rounded-xl border border-reelish-border px-3 py-1.5 text-xs"
                  >
                    {r.is_favorite ? "Unfavorite" : "Favorite"}
                  </button>
                  <Link
                    href={`/recipe/${r.id}`}
                    className="rounded-xl bg-reelish-accent px-4 py-2 text-sm font-semibold text-white"
                  >
                    Open
                  </Link>
                </div>
              </div>

              {tags.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <span key={t} className="rounded-full bg-reelish-elevated px-2.5 py-0.5 text-xs">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 text-sm text-reelish-muted">{preview(r)}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => convertNow(r.id)}
                  className="rounded-xl border border-reelish-gold/50 bg-reelish-gold/10 px-4 py-2 text-sm"
                >
                  {converted ? "Reconvert recipe" : "Convert recipe"}
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => confirmDelete(r.id)}
                  className="rounded-xl border border-red-500/40 px-4 py-2 text-sm text-red-300"
                >
                  Delete
                </button>
                {r.source_url ? (
                  <a href={r.source_url} target="_blank" rel="noreferrer" className="rounded-xl border border-reelish-border px-4 py-2 text-sm">
                    View original video
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

