"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SiteHeader({
  email,
  isDemo,
}: {
  email?: string | null;
  isDemo?: boolean;
}) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-reelish-border/80 bg-reelish-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-serif text-xl font-semibold tracking-tight text-reelish-cream">
          Reelish
        </Link>
        <nav className="flex items-center gap-3 text-sm text-reelish-muted">
          {!isDemo && (
            <>
              <Link href="/dashboard" className="hover:text-reelish-cream transition-colors">
                Dashboard
              </Link>
              <Link href="/saved" className="hover:text-reelish-cream transition-colors">
                Saved
              </Link>
              <Link href="/profile" className="hover:text-reelish-cream transition-colors">
                Profile
              </Link>
            </>
          )}
          {isDemo && (
            <Link href="/auth/sign-up" className="hover:text-reelish-cream transition-colors">
              Sign up to save
            </Link>
          )}
          {email ? (
            <span className="hidden sm:inline truncate max-w-[140px]" title={email}>
              {email}
            </span>
          ) : null}
          {email ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-full border border-reelish-border px-3 py-1 text-reelish-cream hover:bg-reelish-surface transition-colors"
            >
              Log out
            </button>
          ) : !isDemo ? (
            <Link
              href="/auth/login"
              className="rounded-full bg-reelish-accent px-3 py-1 font-medium text-white hover:bg-reelish-accentHover transition-colors"
            >
              Log in
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
