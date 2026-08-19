import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ProfileSurvey } from "@/components/profile-survey";
import { createClient } from "@/lib/supabase/server";
import { fromDbProfile, type RawUserProfile } from "@/lib/user-profile";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/onboarding");

  let data: RawUserProfile | null = null;
  try {
    const result = await supabase
      .from("user_profiles")
      .select("dietary_pattern, restrictions, allergies, disliked_ingredients, goals, preferred_language, onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle();
    data = result.data as RawUserProfile | null;
  } catch {
    data = null;
  }
  const profile = fromDbProfile(data);

  if (profile.onboardingCompleted) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen">
      <SiteHeader email={user.email ?? null} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-serif text-3xl text-reelish-cream">Set up your food profile</h1>
        <p className="mt-2 text-sm text-reelish-muted">
          Start with your recipe language, then your diet — we’ll apply these when you import and convert recipes.
        </p>
        <div className="mt-6">
          <ProfileSurvey initial={profile} mode="onboarding" />
        </div>
      </main>
    </div>
  );
}

