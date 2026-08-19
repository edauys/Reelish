import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ProfileSurvey } from "@/components/profile-survey";
import { createClient } from "@/lib/supabase/server";
import { fromDbProfile, type RawUserProfile } from "@/lib/user-profile";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/profile");

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

  return (
    <div className="min-h-screen">
      <SiteHeader email={user.email ?? null} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-serif text-3xl text-reelish-cream">Profile settings</h1>
        <p className="mt-2 text-sm text-reelish-muted">
          Update your preferred recipe language, diet profile, and goals used for extraction and conversion.
        </p>
        <div className="mt-6">
          <ProfileSurvey initial={profile} mode="settings" />
        </div>
      </main>
    </div>
  );
}

