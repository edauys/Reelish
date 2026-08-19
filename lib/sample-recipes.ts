import type { RecipePayload, RecipeSource } from "@/types/recipe";

/** Demo & URL-mock templates — swap for API/OpenAI responses later. */
export const SAMPLE_PASTA: RecipePayload = {
  title: "Creamy Tuscan Chicken Pasta",
  ingredients: [
    "1 lb chicken breast, diced",
    "12 oz penne pasta",
    "2 tbsp butter",
    "1 cup heavy cream",
    "1/2 cup parmesan cheese",
    "2 cloves garlic, minced",
    "1 cup sun-dried tomatoes, chopped",
    "2 cups fresh spinach",
    "1/2 cup white wine",
    "2 tbsp all-purpose flour",
    "Salt and pepper to taste",
  ],
  steps: [
    "Cook pasta according to package directions; reserve 1/2 cup pasta water.",
    "Season chicken and sear in butter until golden; set aside.",
    "Sauté garlic, then deglaze with wine. Whisk in flour, then cream.",
    "Stir in parmesan until smooth; fold in tomatoes and spinach.",
    "Return chicken and pasta; toss, adding pasta water as needed.",
    "Season and serve with extra parmesan.",
  ],
  sourceType: "manual",
};

export const SAMPLE_DESSERT: RecipePayload = {
  title: "Fudgy Brownie Bites",
  ingredients: [
    "1/2 cup butter",
    "1 cup granulated sugar",
    "2 large eggs",
    "1 tsp vanilla extract",
    "1/3 cup all-purpose flour",
    "1/2 cup cocoa powder",
    "1/4 tsp salt",
    "1/2 cup chocolate chips",
  ],
  steps: [
    "Melt butter and whisk with sugar until glossy.",
    "Beat in eggs and vanilla.",
    "Fold in flour, cocoa, and salt until just combined.",
    "Stir in chocolate chips.",
    "Bake at 350°F (175°C) in a lined 8-inch pan for 22–25 minutes.",
    "Cool before slicing into bites.",
  ],
  sourceType: "manual",
};

export const SAMPLE_BOWL: RecipePayload = {
  title: "Teriyaki Salmon Rice Bowl",
  ingredients: [
    "2 salmon fillets (6 oz each)",
    "2 cups cooked jasmine rice",
    "1/4 cup soy sauce",
    "2 tbsp honey",
    "1 tbsp cornstarch",
    "1 tbsp sesame oil",
    "1 cup edamame, shelled",
    "1 avocado, sliced",
    "Pickled ginger for serving",
  ],
  steps: [
    "Whisk soy sauce, honey, cornstarch, and a splash of water for teriyaki glaze.",
    "Pan-sear salmon; brush with glaze until glossy.",
    "Steam edamame briefly.",
    "Divide rice into bowls; top with salmon, edamame, and avocado.",
    "Drizzle remaining glaze and serve with ginger.",
  ],
  sourceType: "manual",
};

function detectSource(url: string): RecipeSource {
  const u = url.toLowerCase();
  if (u.includes("instagram.com") || u.includes("instagr.am")) return "instagram";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "facebook";
  return "unknown";
}

/** Rotate mock recipes by URL hash so different links feel different in demos. */
export function pickMockRecipeForUrl(url: string): RecipePayload {
  const source = detectSource(url);
  const hash = url.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 3;
  const base = [SAMPLE_PASTA, SAMPLE_DESSERT, SAMPLE_BOWL][hash] ?? SAMPLE_PASTA;
  const mockHandles: Record<RecipeSource, string> = {
    instagram: "@wellnessbyria",
    tiktok: "@highproteinchef",
    facebook: "@homekitchen.daily",
    manual: "@manual",
    unknown: "@creator",
  };
  return {
    ...base,
    title: `${base.title}`,
    sourceUrl: url,
    sourceType: source,
    sourcePlatform: source,
    creatorHandle: mockHandles[source],
  };
}
