/**
 * Central toggles for auth requirements (production vs local dev).
 * Set in `.env.local` — see `.env.example`.
 */

export function uploadRequiresAuth(): boolean {
  if (process.env.REELISH_UPLOAD_REQUIRE_AUTH === "0") return false;
  return true;
}

/** When true, extraction server action requires a signed-in user. */
export function extractRequiresAuth(): boolean {
  if (process.env.REELISH_EXTRACT_REQUIRE_AUTH === "0") return false;
  if (process.env.REELISH_EXTRACT_REQUIRE_AUTH === "1") return true;
  return process.env.NODE_ENV === "production";
}
