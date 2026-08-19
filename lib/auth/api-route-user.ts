import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

/**
 * Authenticated user for API routes: cookie session first, then `Authorization: Bearer <jwt>`.
 * Bearer is required for native iOS uploads (`URLSession`) where WKWebView cookies are not present.
 */
export async function getAuthenticatedUserForApiRoute(request: NextRequest): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* Server Component refresh — ignore */
        }
      },
    },
  });

  const {
    data: { user: cookieUser },
  } = await supabase.auth.getUser();
  if (cookieUser) return cookieUser;

  const auth = request.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  const jwt = auth.slice(7).trim();
  if (!jwt) return null;

  const {
    data: { user: bearerUser },
    error,
  } = await supabase.auth.getUser(jwt);
  if (error || !bearerUser) return null;
  return bearerUser;
}
