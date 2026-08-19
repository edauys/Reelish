/**
 * Normalize AI/extracted ingredient and step lines so UI never shows "[object Object]".
 * Supports plain strings plus common structured shapes from JSON mode models.
 */

import type { PersonalizedRecipe, RecipePayload } from "@/types/recipe";

function joinParts(parts: Array<string | undefined | null>): string {
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turn one ingredient value (string or object) into a single readable line.
 */
export function formatIngredientLine(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const t = raw.trim();
    return t;
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;

    if (typeof o.line === "string" && o.line.trim()) return o.line.trim();
    if (typeof o.text === "string" && o.text.trim()) return o.text.trim();

    const item = [o.item, o.name, o.ingredient, o.label]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .find((s) => s.length > 0) ?? "";

    const amount =
      o.amount !== undefined && o.amount !== null
        ? String(o.amount).trim()
        : o.quantity !== undefined && o.quantity !== null
          ? String(o.quantity).trim()
          : "";

    const unit = typeof o.unit === "string" ? o.unit.trim() : "";
    const prep =
      (typeof o.preparation === "string" && o.preparation.trim()) ||
      (typeof o.note === "string" && o.note.trim()) ||
      (typeof o.notes === "string" && o.notes.trim()) ||
      "";

    const core = joinParts([amount, unit, item]);
    if (prep) {
      return joinParts([core, prep.startsWith("(") ? prep : `(${prep})`]);
    }
    if (core) return core;

    const fromValues = Object.values(o)
      .filter((v) => typeof v === "string" || typeof v === "number")
      .map((v) => String(v).trim())
      .filter(Boolean);
    if (fromValues.length) return fromValues.join(" ");
  }

  return "";
}

export function formatStepLine(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const k of ["text", "step", "instruction", "content", "description", "line"] as const) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    const parts = Object.values(o)
      .filter((v) => typeof v === "string" || typeof v === "number")
      .map((v) => String(v).trim())
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return String(raw).trim();
}

export function normalizeIngredientList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(formatIngredientLine).filter(Boolean);
}

export function normalizeStepList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(formatStepLine).filter(Boolean);
}

/** Coerce stored/extracted recipe lines to string[] for personalization and display. */
export function normalizedRecipePayload(original: RecipePayload): RecipePayload {
  return {
    ...original,
    ingredients: normalizeIngredientList(original.ingredients as unknown),
    steps: normalizeStepList(original.steps as unknown),
  };
}

export function normalizedPersonalizedRecipe(p: PersonalizedRecipe): PersonalizedRecipe {
  return {
    ...p,
    ingredients: normalizeIngredientList(p.ingredients as unknown),
    steps: normalizeStepList(p.steps as unknown),
  };
}
