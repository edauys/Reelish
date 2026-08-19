import { normalizeIngredientList, normalizeStepList } from "@/lib/ingredient-format";

/** Renders ingredient lines from string[] or structured objects (safe for AI JSON). */
export function RecipeIngredientList({
  ingredients,
  className = "mt-2 list-disc space-y-1.5 pl-5 text-sm text-reelish-cream/95",
}: {
  ingredients: unknown;
  className?: string;
}) {
  const lines = normalizeIngredientList(Array.isArray(ingredients) ? ingredients : []);
  return (
    <ul className={className}>
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}

/** Renders step lines from string[] or structured objects. */
export function RecipeStepsList({
  steps,
  className = "mt-2 list-decimal space-y-1.5 pl-5 text-sm text-reelish-cream/95",
}: {
  steps: unknown;
  className?: string;
}) {
  const lines = normalizeStepList(Array.isArray(steps) ? steps : []);
  return (
    <ol className={className}>
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ol>
  );
}
