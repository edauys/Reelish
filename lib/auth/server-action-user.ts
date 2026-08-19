import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";

/** Best-effort client IP for rate limiting (behind proxies). */
export async function getClientIpFromHeaders(): Promise<string> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]?.trim() || "unknown";
    return h.get("x-real-ip")?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
