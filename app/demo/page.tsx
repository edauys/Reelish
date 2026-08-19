import { SiteHeader } from "@/components/site-header";
import { RecipeWorkflow } from "@/components/recipe-workflow";
import { DEFAULT_USER_PROFILE } from "@/lib/user-profile";

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  return (
    <div className="min-h-screen">
      <SiteHeader email={null} isDemo />
      <RecipeWorkflow
        mode="demo"
        userEmail={null}
        initialSearchParams={sp}
        profile={DEFAULT_USER_PROFILE}
      />
    </div>
  );
}
