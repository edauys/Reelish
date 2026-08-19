import type { VisualCookingCue, VisualIngredientHint } from "@/lib/reconstruction/types";

export interface CookingFrameAnalysis {
  /** On-screen text merged across frames — supporting evidence, not ground truth. */
  overlayText: string;
  ingredientHints: VisualIngredientHint[];
  cookingCues: VisualCookingCue[];
}

function toImageUrlPart(b64OrDataUrl: string): { type: "image_url"; image_url: { url: string } } {
  const t = b64OrDataUrl.trim();
  if (t.startsWith("data:image")) {
    return { type: "image_url", image_url: { url: t } };
  }
  return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${t}` } };
}

function safeParseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Single vision+JSON call for OCR text + structured hints from still frames.
 * Conservative prompts — frames are supporting evidence for reconstruction, not authoritative recipes.
 */
export async function analyzeCookingFramesWithOpenAI(
  imageBase64Parts: string[]
): Promise<CookingFrameAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const parts = imageBase64Parts.map((p) => toImageUrlPart(p)).slice(0, 6);

  const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";

  const system = `You analyze short cooking video still frames for the Reelish recipe app.
Return ONLY valid JSON with keys:
- overlayText: string — ALL clearly readable on-screen text (subtitles, ingredient lists, recipe cards, burned-in captions). Preserve line breaks when text appears as separate lines (bulleted or numbered lists). Merge frames in logical reading order; empty string if none; never invent text.
- ingredientHints: array of { "label": string, "confidence": number 0-1 } for foods or packaged ingredients you clearly see (include visible brand/item text when it helps).
- cookingCues: array of { "label": string, "confidence": number 0-1 } for visible actions (chop, boil, fry, bake, whisk, simmer) or cookware/plating clues.
Prioritize overlayText quality: structured lists with measurements are high-value for downstream parsing.
Be conservative: lower confidence when unsure. Do not invent ingredients not visible.`;

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: "Frames may be blurry or partial. Extract only what is reasonably visible.",
    },
    ...parts,
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    if (process.env.REELISH_DEBUG_EXTRACTION === "1") {
      const errText = await res.text();
      console.error("[reelish:vision]", res.status, errText.slice(0, 400));
    }
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = safeParseJsonObject(content);
  if (!parsed) return null;

  const overlayText = typeof parsed.overlayText === "string" ? parsed.overlayText.trim() : "";

  const ingredientHints: VisualIngredientHint[] = [];
  if (Array.isArray(parsed.ingredientHints)) {
    for (const row of parsed.ingredientHints) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim() : "";
      if (!label) continue;
      const confidence =
        typeof o.confidence === "number" && !Number.isNaN(o.confidence) ? o.confidence : undefined;
      ingredientHints.push({ label, confidence });
    }
  }

  const cookingCues: VisualCookingCue[] = [];
  if (Array.isArray(parsed.cookingCues)) {
    for (const row of parsed.cookingCues) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim() : "";
      if (!label) continue;
      const confidence =
        typeof o.confidence === "number" && !Number.isNaN(o.confidence) ? o.confidence : undefined;
      cookingCues.push({ label, confidence });
    }
  }

  if (!overlayText && ingredientHints.length === 0 && cookingCues.length === 0) {
    return null;
  }

  return { overlayText, ingredientHints, cookingCues };
}
