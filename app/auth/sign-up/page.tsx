"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
        },
      });
      if (signErr) {
        setError(signErr.message);
        setLoading(false);
        return;
      }
      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-16">
      <div className="mx-auto max-w-md rounded-card border border-reelish-border bg-reelish-surface p-8 shadow-soft">
        <h1 className="font-serif text-3xl font-semibold text-reelish-cream">Create your account</h1>
        <p className="mt-2 text-sm text-reelish-muted">Save personalized recipes and sync them to your profile.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="text-sm font-medium text-reelish-cream">Display name (optional)</label>
            <input
              type="text"
              autoComplete="name"
              className="mt-1 w-full rounded-xl border border-reelish-border bg-reelish-bg px-4 py-3 text-reelish-cream"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-reelish-cream">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-reelish-border bg-reelish-bg px-4 py-3 text-reelish-cream"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-reelish-cream">Password</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-reelish-border bg-reelish-bg px-4 py-3 text-reelish-cream"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-reelish-accent py-3 font-semibold text-white hover:bg-reelish-accentHover disabled:opacity-50"
          >
            {loading ? "Creating…" : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-reelish-muted">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-reelish-gold hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
