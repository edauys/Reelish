/**
 * Recipe extraction — provider pipeline lives in `lib/extraction/`.
 *
 * - Server: call `runExtraction` from `@/lib/extraction` or `extractRecipeAction` from app actions.
 * - Client components must use the server action (API key stays server-side).
 */

export { runExtraction, parseRecipeText } from "@/lib/extraction";
export type { ExtractionInput, ExtractionResult } from "@/lib/extraction";
