"use server";

import { extractRequiresAuth } from "@/lib/auth/env-flags";
import { getClientIpFromHeaders, getSessionUser } from "@/lib/auth/server-action-user";
import { runExtraction } from "@/lib/extraction";
import { isSafeMediaAssetId } from "@/lib/media/paths";
import { checkAnonExtractRateLimit, checkExtractRateLimit } from "@/lib/rate-limit/in-memory";
import type { RecipeMediaHints } from "@/lib/reconstruction/types";
import type { ShareIntakePayload } from "@/lib/share/types";
import type { PreferredLanguage } from "@/types/recipe";
import type { RecipePayload } from "@/types/recipe";

export type ExtractRecipeActionResult =
  | { ok: true; recipe: RecipePayload; usedDemoFallback: boolean }
  | { ok: false; error: string; code?: "UNAUTHORIZED" | "RATE_LIMITED" };

const MAX_BASE64_CHARS = 14_000_000;
const MAX_MEDIA_IDS = 8;

function sanitizeMediaHints(hints?: RecipeMediaHints): RecipeMediaHints | undefined {
  if (!hints) return undefined;
  const audio = hints.audioBase64?.trim();
  if (audio && audio.length > MAX_BASE64_CHARS) {
    throw new Error("Attached audio is too large for extraction (max ~10MB).");
  }
  const images = hints.imageBase64Parts?.filter(Boolean) ?? [];
  for (const img of images) {
    if (img.length > MAX_BASE64_CHARS) {
      throw new Error("An attached image is too large for extraction (max ~10MB per image).");
    }
  }
  const idSet = new Set<string>();
  for (const id of hints.mediaAssetIds ?? []) {
    const t = id?.trim();
    if (!t || !isSafeMediaAssetId(t)) continue;
    idSet.add(t);
    if (idSet.size >= MAX_MEDIA_IDS) break;
  }
  const legacy = hints.mediaAssetId?.trim();
  if (legacy && isSafeMediaAssetId(legacy)) idSet.add(legacy);

  const mediaAssetIds = idSet.size ? [...idSet] : undefined;

  if (!audio && images.length === 0 && !mediaAssetIds?.length) return undefined;
  return {
    ...hints,
    audioBase64: audio,
    imageBase64Parts: images.length ? images : undefined,
    mediaAssetIds,
    mediaAssetId: undefined,
  };
}

export async function extractRecipeAction(input: {
  url?: string;
  text?: string;
  shareTextAtOpen?: string;
  shareTitleAtOpen?: string;
  preferredLanguage: PreferredLanguage;
  mediaHints?: RecipeMediaHints;
  shareIntake?: ShareIntakePayload;
}): Promise<ExtractRecipeActionResult> {
  try {
    const sessionUser = await getSessionUser();

    if (extractRequiresAuth()) {
      if (!sessionUser) {
        return { ok: false, error: "Sign in to extract recipes.", code: "UNAUTHORIZED" };
      }
      const rl = checkExtractRateLimit(sessionUser.id);
      if (!rl.ok) {
        return {
          ok: false,
          error: "Too many extractions. Try again in a few minutes.",
          code: "RATE_LIMITED",
        };
      }
    } else if (sessionUser) {
      const rl = checkExtractRateLimit(sessionUser.id);
      if (!rl.ok) {
        return {
          ok: false,
          error: "Too many extractions. Try again in a few minutes.",
          code: "RATE_LIMITED",
        };
      }
    } else {
      const ip = await getClientIpFromHeaders();
      const rl = checkAnonExtractRateLimit(ip);
      if (!rl.ok) {
        return {
          ok: false,
          error: "Too many extractions from this network. Sign in or try again later.",
          code: "RATE_LIMITED",
        };
      }
    }

    const mediaHints = sanitizeMediaHints(input.mediaHints);
    const { recipe, usedDemoFallback } = await runExtraction({
      url: input.url,
      text: input.text,
      shareTextAtOpen: input.shareTextAtOpen,
      shareTitleAtOpen: input.shareTitleAtOpen,
      preferredLanguage: input.preferredLanguage,
      mediaHints,
      shareIntake: input.shareIntake,
      actorUserId: sessionUser?.id,
    });
    return { ok: true, recipe, usedDemoFallback };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Extraction failed.";
    return { ok: false, error: message };
  }
}
