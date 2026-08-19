import Link from "next/link";

export default function RecipeNotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-serif text-2xl text-reelish-cream">Recipe not found</h1>
      <p className="mt-2 text-sm text-reelish-muted">It may have been removed or you don’t have access.</p>
      <Link href="/saved" className="mt-6 inline-block text-reelish-gold hover:underline">
        Back to saved recipes
      </Link>
    </div>
  );
}
