"use client";

import { useState } from "react";
import { extractRecipeAction } from "@/app/actions/extract-recipe-action";
import { ExtractionEvidencePanel } from "@/components/extraction-evidence-panel";
import { buildShareIntakePayload } from "@/lib/share/intake";
import type { RecipePayload } from "@/types/recipe";

export function DevMultimodalClient() {
  const [caption, setCaption] = useState("Quick pasta: garlic, olive oil, chili flakes, spaghetti. Boil pasta, sauté garlic in oil, toss.");
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<RecipePayload | null>(null);

  async function upload(files: FileList | null) {
    setErr(null);
    if (!files?.length) return;
    setBusy(true);
    try {
      const next: string[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/media/upload", { method: "POST", body: fd, credentials: "include" });
        const j = (await res.json()) as { mediaAssetId?: string; error?: string; code?: string };
        if (!res.ok) {
          setErr(j.code === "UNAUTHORIZED" ? "Sign in to upload media (dev page uses the same API)." : (j.error ?? "Upload failed"));
          continue;
        }
        if (j.mediaAssetId) next.push(j.mediaAssetId);
      }
      setIds((p) => [...new Set([...p, ...next])]);
    } finally {
      setBusy(false);
    }
  }

  async function runExtract() {
    setErr(null);
    setBusy(true);
    try {
      const res = await extractRecipeAction({
        text: caption.trim(),
        preferredLanguage: "en",
        mediaHints: ids.length ? { mediaAssetIds: ids } : undefined,
        shareIntake: buildShareIntakePayload({
          origin: "programmatic",
          text: caption.trim(),
          mediaAssetIds: ids.length ? ids : undefined,
        }),
      });
      if (!res.ok) {
        setRecipe(null);
        setErr(res.error);
        return;
      }
      setRecipe(res.recipe);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-card border border-reelish-border bg-reelish-surface p-5">
      <label className="block text-sm font-medium">Caption / recipe text</label>
      <textarea
        className="min-h-[100px] w-full rounded-xl border border-reelish-border bg-reelish-bg px-3 py-2 text-sm"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
      <div>
        <label className="block text-sm font-medium">Media</label>
        <input
          type="file"
          accept="audio/*,video/*,image/*"
          multiple
          disabled={busy}
          className="mt-1 block w-full text-sm file:mr-2 file:rounded-lg file:bg-reelish-elevated file:px-3 file:py-2"
          onChange={(e) => void upload(e.target.files)}
        />
        {ids.length ? (
          <p className="mt-2 font-mono text-xs text-reelish-muted">Ids: {ids.join(", ")}</p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void runExtract()}
        className="rounded-xl bg-reelish-accent px-5 py-2.5 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Working…" : "Run extraction"}
      </button>
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      {recipe ? (
        <div className="space-y-3 border-t border-reelish-border pt-4 text-sm">
          <p className="font-medium">{recipe.title}</p>
          <ExtractionEvidencePanel recipe={recipe} />
          <pre className="max-h-64 overflow-auto rounded-lg bg-reelish-bg p-3 text-xs text-reelish-muted">
            {JSON.stringify(recipe, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
