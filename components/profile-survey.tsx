"use client";

import { useMemo, useState, useTransition } from "react";
import { RecipeOutputLanguageCombobox } from "@/components/recipe-output-language-combobox";
import {
  ALLERGIES,
  DIETARY_PATTERNS,
  GOALS,
  RESTRICTIONS,
  formatDietaryPatternLabel,
} from "@/lib/labels";
import { getRecipeOutputLanguageLabel, normalizeRecipeOutputLanguageCode } from "@/lib/languages";
import { upsertUserProfileAction } from "@/app/actions/user-profile-actions";
import type {
  Allergy,
  DietPreference,
  DietaryPattern,
  NutritionGoal,
  PreferredLanguage,
  UserProfile,
} from "@/types/recipe";

function ToggleChips<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: { id: T; label: string }[];
  selected: T[];
  onToggle: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              on
                ? "border-reelish-accent bg-reelish-accent/20 text-reelish-cream"
                : "border-reelish-border text-reelish-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ProfileSurvey({
  initial,
  mode,
}: {
  initial: UserProfile;
  mode: "onboarding" | "settings";
}) {
  const [dietaryPattern, setDietaryPattern] = useState<DietaryPattern>(initial.dietaryPattern);
  const [restrictions, setRestrictions] = useState<DietPreference[]>(initial.restrictions);
  const [allergies, setAllergies] = useState<Allergy[]>(initial.allergies);
  const [goals, setGoals] = useState<NutritionGoal[]>(initial.goals);
  const [preferredLanguage, setPreferredLanguage] = useState<PreferredLanguage>(() =>
    normalizeRecipeOutputLanguageCode(initial.preferredLanguage)
  );
  const [dislikesInput, setDislikesInput] = useState(initial.dislikedIngredients.join(", "));
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const steps = useMemo(
    () => ["Language", "Dietary pattern", "Restrictions", "Allergies", "Dislikes", "Goals"],
    []
  );
  const isLast = step === steps.length - 1;

  const toggle = <T extends string,>(arr: T[], id: T) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  function submit() {
    setMessage(null);
    const dislikedIngredients = dislikesInput
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    startTransition(async () => {
      const res = await upsertUserProfileAction({
        dietaryPattern,
        restrictions,
        allergies,
        goals,
        preferredLanguage,
        dislikedIngredients,
        onboardingCompleted: true,
      });
      if (res.error) setMessage(res.error);
      else setMessage(mode === "onboarding" ? "Saved! Continue to your dashboard." : "Profile updated.");
    });
  }

  return (
    <div className="rounded-card border border-reelish-border bg-reelish-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-reelish-muted">
          {mode === "onboarding" ? "Quick setup (under 30 seconds)" : "Profile settings"}
        </p>
        <p className="text-xs text-reelish-muted">
          Step {step + 1} of {steps.length}
        </p>
      </div>
      <h2 className="font-serif text-2xl text-reelish-cream">{steps[step]}</h2>
      <div className="mt-4 space-y-4">
        {step === 0 ? (
          <div>
            <p className="text-sm text-reelish-muted">
              Recipes you import will be structured and shown in this language (including future AI extraction).
            </p>
            <label htmlFor="preferred-recipe-language" className="mt-4 block text-sm font-medium text-reelish-cream">
              Preferred recipe language
            </label>
            <p className="mt-1 text-xs text-reelish-muted">
              Curated list of output languages we can support well; search by name or code.
            </p>
            <div className="mt-2">
              <RecipeOutputLanguageCombobox
                id="preferred-recipe-language"
                value={preferredLanguage}
                onChange={setPreferredLanguage}
              />
            </div>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="flex flex-wrap gap-2">
            {DIETARY_PATTERNS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDietaryPattern(d.id)}
                className={`rounded-full border px-4 py-2 text-sm ${
                  dietaryPattern === d.id
                    ? "border-reelish-accent bg-reelish-accent/20 text-reelish-cream"
                    : "border-reelish-border text-reelish-muted"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        ) : null}
        {step === 2 ? (
          <ToggleChips
            options={RESTRICTIONS}
            selected={restrictions}
            onToggle={(id) => setRestrictions((prev) => toggle(prev, id))}
          />
        ) : null}
        {step === 3 ? (
          <ToggleChips
            options={ALLERGIES}
            selected={allergies}
            onToggle={(id) => setAllergies((prev) => toggle(prev, id))}
          />
        ) : null}
        {step === 4 ? (
          <div>
            <p className="text-sm text-reelish-muted">Comma-separated ingredients to avoid (e.g. mushrooms, cilantro)</p>
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-reelish-border bg-reelish-bg px-3 py-2"
              value={dislikesInput}
              onChange={(e) => setDislikesInput(e.target.value)}
            />
          </div>
        ) : null}
        {step === 5 ? (
          <ToggleChips
            options={GOALS}
            selected={goals}
            onToggle={(id) => setGoals((prev) => toggle(prev, id))}
          />
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="rounded-xl border border-reelish-border px-4 py-2 text-sm disabled:opacity-50"
        >
          Back
        </button>
        {!isLast ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
            className="rounded-xl bg-reelish-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="rounded-xl bg-reelish-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save profile"}
          </button>
        )}
        {mode === "onboarding" && message && !message.toLowerCase().includes("error") ? (
          <a href="/dashboard" className="text-sm text-reelish-gold hover:underline">
            Go to dashboard
          </a>
        ) : null}
      </div>

      {message ? <p className="mt-3 text-sm text-reelish-gold">{message}</p> : null}
      <p className="mt-4 text-xs text-reelish-muted">
        Language: <span className="text-reelish-cream">{getRecipeOutputLanguageLabel(preferredLanguage)}</span>
        {" · "}
        Pattern: <span className="text-reelish-cream">{formatDietaryPatternLabel(dietaryPattern)}</span>
      </p>
    </div>
  );
}

