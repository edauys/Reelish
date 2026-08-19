import { SiteHeader } from "@/components/site-header";
import { RecipeWorkflow } from "@/components/recipe-workflow";
import { createClient } from "@/lib/supabase/server";
import { fromDbProfile, type RawUserProfile } from "@/lib/user-profile";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sp = await searchParams;
  let profileRow: RawUserProfile | null = null;
  try {
    const result = await supabase
      .from("user_profiles")
      .select("dietary_pattern, restrictions, allergies, disliked_ingredients, goals, preferred_language, onboarding_completed")
      .eq("user_id", user?.id ?? "")
      .maybeSingle();
    profileRow = result.data as RawUserProfile | null;
  } catch {
    profileRow = null;
  }
  const profile = fromDbProfile(profileRow);

  return (
    <div className="min-h-screen">
      <SiteHeader email={user?.email ?? null} />
      <RecipeWorkflow
        mode="app"
        userEmail={user?.email ?? null}
        initialSearchParams={sp}
        profile={profile}
      />
    </div>
  );
}
