import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  let user: User | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Avoid failing the whole request (unstyled HTML / 500) if auth is temporarily unreachable.
    user = null;
  }

  const path = request.nextUrl.pathname;
  const isProtected =
    path.startsWith("/dashboard") ||
    path.startsWith("/saved") ||
    path.startsWith("/recipe/") ||
    path.startsWith("/profile") ||
    path.startsWith("/onboarding");

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (path.startsWith("/dashboard") || path.startsWith("/saved") || path.startsWith("/recipe/"))) {
    try {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.onboarding_completed) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/onboarding";
        return NextResponse.redirect(redirectUrl);
      }
    } catch {
      // If schema isn't migrated yet, don't block existing MVP routes.
    }
  }

  return supabaseResponse;
}
