"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toDbProfile } from "@/lib/user-profile";
import type { UserProfile } from "@/types/recipe";

export async function upsertUserProfileAction(profile: UserProfile): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: user.id, ...toDbProfile(profile) }, { onConflict: "user_id" });
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/saved");
  revalidatePath("/profile");
  revalidatePath("/onboarding");
  return {};
}

