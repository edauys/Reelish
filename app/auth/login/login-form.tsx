"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) {
        setError(signErr.message);
        setLoading(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-card border border-reelish-border bg-reelish-surface p-8 shadow-soft">
      <h1 className="font-serif text-3xl font-semibold text-reelish-cream">Welcome back</h1>
      <p className="mt-2 text-sm text-reelish-muted">Log in to save recipes and open your dashboard.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
            autoComplete="current-password"
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
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-reelish-muted">
        No account?{" "}
        <Link href="/auth/sign-up" className="text-reelish-gold hover:underline">
          Sign up
        </Link>
      </p>
      <p className="mt-4 text-center text-sm">
        <Link href="/demo" className="text-reelish-muted hover:text-reelish-cream">
          Try the demo first
        </Link>
      </p>
    </div>
  );
}
