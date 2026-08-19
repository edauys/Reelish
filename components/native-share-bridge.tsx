"use client";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * iOS Share Extension opens the host app with `reelish://handoff?...` (see `ios/App/ShareExtension`).
 * `@capacitor/app` delivers the URL here; we map query keys to the same dashboard route as PWA share_target (`lib/share-target.ts`).
 */
function handoffUrlToDashboardPath(urlString: string): string | null {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "reelish:" || u.hostname !== "handoff") return null;
    const q = u.searchParams.toString();
    return q ? `/dashboard?${q}` : "/dashboard";
  } catch {
    return null;
  }
}

function bridgeLog(phase: string, detail?: Record<string, unknown>) {
  if (process.env.NEXT_PUBLIC_REELISH_NATIVE_BRIDGE_DEBUG !== "1") return;
  console.info(`[reelish:native-bridge] ${phase}`, detail ?? {});
}

function launchDebugLog(phase: string, detail?: Record<string, unknown>) {
  const on =
    process.env.NEXT_PUBLIC_REELISH_NATIVE_LAUNCH_DEBUG === "1" ||
    process.env.NEXT_PUBLIC_REELISH_NATIVE_BRIDGE_DEBUG === "1" ||
    process.env.NODE_ENV === "development";
  if (!on) return;
  console.info(`[reelish:native-launch] ${phase}`, detail ?? {});
}

export function NativeShareBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    launchDebugLog("native_shell_active", {
      href: typeof window !== "undefined" ? window.location.href : "",
      origin: typeof window !== "undefined" ? window.location.origin : "",
    });

    const navigate = (urlString: string, source: "launch" | "appUrlOpen") => {
      launchDebugLog("navigate_from_url", {
        source,
        urlLen: urlString.length,
        /** Host should expand `app_group_handoff` before JS sees the URL; if true, relay did not run. */
        rawAppGroupWake: urlString.includes("app_group_handoff=1"),
      });
      bridgeLog("handoff_received", { source, urlLen: urlString.length });
      const path = handoffUrlToDashboardPath(urlString);
      if (path) {
        bridgeLog("dashboard_route", { pathLen: path.length });
        router.replace(path);
        bridgeLog("router_replace_issued", { source });
      } else {
        bridgeLog("handoff_skipped_not_reelish_handoff", { source });
      }
    };

    let remove: (() => void) | undefined;

    void App.getLaunchUrl().then((res) => {
      launchDebugLog("getLaunchUrl_result", { hasUrl: Boolean(res?.url), urlLen: res?.url?.length ?? 0 });
      if (res?.url) navigate(res.url, "launch");
      else bridgeLog("getLaunchUrl_empty", {});
    });

    void App.addListener("appUrlOpen", ({ url }) => {
      launchDebugLog("appUrlOpen_fired", { urlLen: url?.length ?? 0 });
      navigate(url, "appUrlOpen");
    }).then((handle) => {
      launchDebugLog("appUrlOpen_listener_attached", {});
      remove = () => void handle.remove();
    });

    return () => remove?.();
  }, [router]);

  return null;
}
