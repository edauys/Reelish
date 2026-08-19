"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  convertSavedRecipeAction,
  duplicateRecipeAction,
  deleteRecipeAction,
  toggleFavoriteRecipeAction,
} from "@/app/actions/recipe-actions";

export function RecipeDetailActions({
  id,
  converted,
  isFavorite,
}: {
  id: string;
  converted: boolean;
  isFavorite: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function convert() {
    startTransition(async () => {
      await convertSavedRecipeAction(id);
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm("Delete this recipe from your library?")) return;
    startTransition(async () => {
      await deleteRecipeAction(id);
      router.push("/saved");
      router.refresh();
    });
  }

  function toggleFavorite() {
    startTransition(async () => {
      await toggleFavoriteRecipeAction(id, !isFavorite);
      router.refresh();
    });
  }

  function duplicate() {
    startTransition(async () => {
      const res = await duplicateRecipeAction(id);
      if (res.id) router.push(`/recipe/${res.id}`);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={convert}
        className="rounded-xl border border-reelish-gold/50 bg-reelish-gold/10 px-4 py-2 text-sm"
      >
        {converted ? "Reconvert" : "Convert recipe"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={duplicate}
        className="rounded-xl border border-reelish-border px-4 py-2 text-sm"
      >
        Save copy
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={toggleFavorite}
        className="rounded-xl border border-reelish-border px-4 py-2 text-sm"
      >
        {isFavorite ? "Unfavorite" : "Favorite"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={remove}
        className="rounded-xl border border-red-500/40 px-4 py-2 text-sm text-red-300"
      >
        Delete
      </button>
    </div>
  );
}

