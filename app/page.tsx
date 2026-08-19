import Link from "next/link";

const examples = [
  "Gluten free",
  "Dairy free",
  "High protein",
  "Keto",
  "Vegan",
  "Low carb",
  "Weight loss",
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-reelish-border/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="font-serif text-2xl font-semibold text-reelish-cream">Reelish</span>
          <nav className="flex gap-3 text-sm">
            <Link href="/auth/login" className="text-reelish-muted hover:text-reelish-cream">
              Log in
            </Link>
            <Link
              href="/auth/sign-up"
              className="rounded-full bg-reelish-accent px-4 py-2 font-medium text-white hover:bg-reelish-accentHover"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 pb-20 pt-14 text-center md:pt-20">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-reelish-gold/90">
            AI-powered recipe companion
          </p>
          <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight text-reelish-cream md:text-6xl md:leading-[1.05]">
            Save a viral recipe.
            <br />
            Make it fit you.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-reelish-muted">
            Turn viral recipes into meals that match your diet, goals, and taste — starting from a reel, a link, or
            plain text.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/auth/sign-up"
              className="w-full rounded-2xl bg-reelish-accent px-8 py-4 text-center font-semibold text-white shadow-glow hover:bg-reelish-accentHover sm:w-auto"
            >
              Sign up
            </Link>
            <Link
              href="/demo"
              className="w-full rounded-2xl border border-reelish-border px-8 py-4 text-center font-semibold text-reelish-cream hover:bg-reelish-surface sm:w-auto"
            >
              Try demo
            </Link>
          </div>
        </section>

        <section className="border-t border-reelish-border/40 bg-reelish-surface/30 py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-center font-serif text-3xl text-reelish-cream">How it works</h2>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {[
                {
                  step: "1",
                  title: "Save from social",
                  body: "Paste a TikTok, Instagram, or Facebook link — or share straight to Reelish from your phone.",
                },
                {
                  step: "2",
                  title: "Extract & tune",
                  body: "We structure the recipe, then you pick dietary needs and nutrition goals.",
                },
                {
                  step: "3",
                  title: "Cook your version",
                  body: "Get a personalized recipe with substitutions and a clear “why” behind each swap.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="rounded-card border border-reelish-border bg-reelish-bg/60 p-6 text-left shadow-soft"
                >
                  <span className="text-sm font-bold text-reelish-accent">{item.step}</span>
                  <h3 className="mt-2 font-serif text-xl text-reelish-cream">{item.title}</h3>
                  <p className="mt-2 text-sm text-reelish-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-center font-serif text-3xl text-reelish-cream">Built for real goals</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-reelish-muted">
              Tag-driven personalization today — structured for richer AI models tomorrow.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              {examples.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-reelish-border bg-reelish-surface px-4 py-2 text-sm text-reelish-cream"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-reelish-border/40 bg-reelish-elevated/20 py-16">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="font-serif text-3xl text-reelish-cream">Install Reelish on your phone</h2>
            <p className="mt-3 text-reelish-muted">
              Add to Home Screen for a focused cooking flow. On Android Chrome, sharing a recipe URL can open Reelish
              directly once installed — see the README for platform notes.
            </p>
            <Link
              href="/auth/sign-up"
              className="mt-6 inline-block rounded-2xl bg-reelish-accent px-8 py-3 font-semibold text-white hover:bg-reelish-accentHover"
            >
              Get started
            </Link>
          </div>
        </section>

        <footer className="border-t border-reelish-border py-8 text-center text-xs text-reelish-muted">
          Reelish · MVP · Mock extraction & personalization for demo purposes
        </footer>
      </main>
    </div>
  );
}
