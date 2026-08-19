"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Must match Swift `ShareInboxUploader` / Capacitor Preferences key prefix. */
const TOKEN_KEY = "reelish_supabase_access_token";

/**
 * Persists Supabase access token to `@capacitor/preferences` so native `URLSession` uploads
 * can send `Authorization: Bearer` (WKWebView cookies are not shared with `URLSession`).
 */
export function AuthTokenSync() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let subscription: { unsubscribe: () => void } | undefined;

    void (async () => {
      const { Preferences } = await import("@capacitor/preferences");
      const supabase = createClient();

      const sync = async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          await Preferences.set({ key: TOKEN_KEY, value: session.access_token });
        } else {
          await Preferences.remove({ key: TOKEN_KEY });
        }
      };

      await sync();
      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange(() => {
        void sync();
      });
      subscription = sub;
    })();

    return () => subscription?.unsubscribe();
  }, []);

  return null;
}
