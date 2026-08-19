import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen px-4 py-16">
      <Suspense
        fallback={
          <div className="mx-auto max-w-md rounded-card border border-reelish-border bg-reelish-surface p-8 animate-pulse">
            <div className="h-8 w-48 rounded bg-reelish-border" />
            <div className="mt-8 h-10 w-full rounded bg-reelish-border" />
            <div className="mt-4 h-10 w-full rounded bg-reelish-border" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
