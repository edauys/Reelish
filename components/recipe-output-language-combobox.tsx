"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  RECIPE_OUTPUT_LANGUAGES,
  getRecipeOutputLanguageLabel,
  type RecipeOutputLanguageCode,
} from "@/lib/languages";

type Props = {
  value: RecipeOutputLanguageCode;
  onChange: (code: RecipeOutputLanguageCode) => void;
  id?: string;
};

/**
 * Searchable single-select for recipe output language (curated list).
 * Listbox pattern: button trigger + popover with filter input + options.
 */
export function RecipeOutputLanguageCombobox({ value, onChange, id: idProp }: Props) {
  const reactId = useId();
  const baseId = idProp ?? `recipe-lang-${reactId}`;
  const listboxId = `${baseId}-listbox`;
  const searchId = `${baseId}-search`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...RECIPE_OUTPUT_LANGUAGES];
    return RECIPE_OUTPUT_LANGUAGES.filter(
      (l) => l.label.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function select(code: RecipeOutputLanguageCode) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={baseId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-h-[44px] items-center justify-between gap-2 rounded-xl border border-reelish-border bg-reelish-bg px-3 py-2.5 text-left text-sm text-reelish-cream hover:border-reelish-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-reelish-accent"
      >
        <span>
          {getRecipeOutputLanguageLabel(value)}{" "}
          <span className="text-xs text-reelish-muted">({value})</span>
        </span>
        <span className="text-reelish-muted" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-xl border border-reelish-border bg-reelish-bg shadow-soft"
          role="presentation"
        >
          <label htmlFor={searchId} className="sr-only">
            Search languages
          </label>
          <input
            id={searchId}
            type="search"
            autoComplete="off"
            placeholder="Search languages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border-b border-reelish-border bg-reelish-bg px-3 py-2.5 text-sm text-reelish-cream placeholder:text-reelish-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-reelish-accent"
            autoFocus
          />
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Output languages"
            className="max-h-[min(280px,50vh)] overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-reelish-muted" role="presentation">
                No matches
              </li>
            ) : (
              filtered.map((lang) => (
                <li key={lang.code} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={lang.code === value}
                    className={`flex w-full min-h-[44px] items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-reelish-elevated ${
                      lang.code === value ? "bg-reelish-accent/15 text-reelish-cream" : "text-reelish-cream"
                    }`}
                    onClick={() => select(lang.code as RecipeOutputLanguageCode)}
                  >
                    <span>{lang.label}</span>
                    <span className="text-xs text-reelish-muted">{lang.code}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
