import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Refreshes Supabase auth session on each request; protects app routes.
 * Public: /, /demo, /auth/*, static, /api/share-target, manifest, sw
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Skip static assets, Next internals, and API routes so middleware cannot break CSS/JS chunk responses.
     * @see https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
     */
    "/((?!_next/static|_next/image|_next/webpack|favicon.ico|manifest.json|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
