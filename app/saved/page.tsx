import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SavedLibrary, type SavedRow } from "@/components/saved-library";
import { formatSavedAtUtc } from "@/lib/format-saved-date";
import { createClient } from "@/lib/supabase/server";

export default async function SavedRecipesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("saved_recipes")
    .select("*")
    .order("created_at", { ascending: false });

  const rows = ((data ?? []) as SavedRow[]).map((r) => ({
    ...r,
    /** Preformatted on the server so client hydration matches (no locale-dependent toLocaleString in the browser). */
    created_at_display: formatSavedAtUtc(r.created_at),
  }));

  return (
    <div className="min-h-screen">
      <SiteHeader email={user.email ?? null} />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8">
        <h1 className="font-serif text-3xl font-semibold text-reelish-cream">Saved recipes</h1>
        <p className="mt-1 text-sm text-reelish-muted">
          Your cookbook — original imports plus your Reelish versions.
        </p>

        {error ? (
          <p className="mt-8 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
            {error.message}
          </p>
        ) : null}

        {!error && rows.length === 0 ? (
          <div className="mt-12 rounded-card border border-dashed border-reelish-border bg-reelish-surface/50 px-6 py-16 text-center">
            <p className="font-serif text-xl text-reelish-cream">Nothing saved yet</p>
            <p className="mt-2 text-sm text-reelish-muted">
              Import a recipe on your dashboard, personalize it, then tap Save.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-block rounded-xl bg-reelish-accent px-6 py-3 font-semibold text-white hover:bg-reelish-accentHover"
            >
              Go to dashboard
            </Link>
          </div>
        ) : null}

        {!error && rows.length > 0 ? <SavedLibrary rows={rows} /> : null}
      </main>
    </div>
  );
}
