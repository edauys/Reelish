"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { extractRecipeAction } from "@/app/actions/extract-recipe-action";
import { hasAnyExtractableText } from "@/lib/extraction/ingestion";
import { personalizeRecipeWithContext } from "@/lib/personalize-recipe";
import { buildShareIntakePayload, getOrCreateShareSessionId } from "@/lib/share/intake";
import type { ShareIntakeOrigin } from "@/lib/share/types";
import { ShareArrivalStatus } from "@/components/share-arrival-status";
import { MAX_SHARE_TEXT_SEGMENTS, SHARE_QUERY, readShareFromSearchParams } from "@/lib/share-target";
import { saveRecipeAction } from "@/app/actions/recipe-actions";
import { profileToPreferences } from "@/lib/user-profile";
import { ExtractionEvidencePanel } from "@/components/extraction-evidence-panel";
import { RecipeIngredientList, RecipeStepsList } from "@/components/recipe-ingredient-list";
import { SelectionChips } from "@/components/selection-chips";
import type {
  DietPreference,
  NutritionGoal,
  PersonalizedRecipe,
  RecipeIngestionSource,
  RecipePayload,
  UserProfile,
} from "@/types/recipe";

function sourceLabel(source: RecipePayload["sourceType"]): string {
  switch (source) {
    case "instagram":
      return "Instagram";
    case "tiktok":
      return "TikTok";
    case "facebook":
      return "Facebook";
    default:
      return "Your paste";
  }
}

function EmptyRecipeIllustration() {
  return (
    <div className="rounded-card border border-dashed border-reelish-border bg-reelish-surface/50 px-6 py-12 text-center">
      <p className="font-serif text-lg text-reelish-cream">No recipe yet</p>
      <p className="mt-2 text-sm text-reelish-muted">
        Use <strong>Share → Reelish</strong> from Instagram, then <strong>Extract recipe</strong>. Reelish combines every text and
        media surface iOS sends — you only add more in the import fields if the share was link-only.
      </p>
    </div>
  );
}

function describeIngestionSource(source: RecipeIngestionSource | undefined): string | null {
  if (!source) return null;
  switch (source) {
    case "shared_text":
      return "Caption/text from share";
    case "shared_title":
      return "Title from share";
    case "shared_text_and_title":
      return "Shared caption + title";
    case "pasted_text":
      return "Pasted text";
    case "url_only_insufficient":
      return "Link only (add caption or media for a full recipe)";
    case "media_supplemented":
      return "Shared media + link (transcript/vision when processing succeeds)";
    case "url_retrieval_supplemented":
      return "Link + recovered public caption/metadata from source URL";
    case "minimal_caption_hint":
      return "Short caption or dish name only (low-confidence extraction)";
    default:
      return null;
  }
}

export function RecipeWorkflow(props: {
  mode: "demo" | "app";
  userEmail: string | null;
  initialSearchParams: Record<string, string | string[] | undefined>;
  profile: UserProfile;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-reelish-muted">
          Loading import…
        </div>
      }
    >
      <RecipeWorkflowInner {...props} />
    </Suspense>
  );
}

function RecipeWorkflowInner({
  mode,
  userEmail,
  initialSearchParams,
  profile,
}: {
  mode: "demo" | "app";
  userEmail: string | null;
  initialSearchParams: Record<string, string | string[] | undefined>;
  profile: UserProfile;
}) {
  const liveSearchParams = useSearchParams();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [extracted, setExtracted] = useState<RecipePayload | null>(null);
  const initialPrefGoal = useMemo(() => profileToPreferences(profile), [profile]);
  const [prefs, setPrefs] = useState<DietPreference[]>(initialPrefGoal.preferences);
  const [goals, setGoals] = useState<NutritionGoal[]>(initialPrefGoal.goals);
  const [personalized, setPersonalized] = useState<PersonalizedRecipe | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  /** Snapshot from Web Share Target (provenance for extraction priority). */
  const [shareSnapshots, setShareSnapshots] = useState<{ text: string; title: string } | null>(null);
  /** Server-side media asset ids (PWA share files + manual uploads). */
  const [stagedMediaIds, setStagedMediaIds] = useState<string[]>([]);
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  /** How the user entered this import flow (share redirect vs manual). */
  const [intakeOrigin, setIntakeOrigin] = useState<ShareIntakeOrigin>("manual_import");
  const [shareReceivedAt, setShareReceivedAt] = useState<string | null>(null);
  /** Optional: native / future deep-link source app metadata (`share_source_app` query). */
  const [shareSourceApp, setShareSourceApp] = useState<{ id: string; label: string } | null>(null);
  /** Set when native host uploaded App Group files (`share_native_staged=1`). */
  const [nativeStagedMediaFlag, setNativeStagedMediaFlag] = useState(false);
  /** Some native staged files failed; extraction may still run on successful uploads. */
  const [nativeUploadPartialFlag, setNativeUploadPartialFlag] = useState(false);
  /** Native host could not upload staged App Group files. */
  const [nativeUploadFailedFlag, setNativeUploadFailedFlag] = useState(false);
  /** `share_inbox` still in URL — waiting for native upload to finish (Capacitor will open again). */
  const [nativeMediaPreparing, setNativeMediaPreparing] = useState(false);
  /** Native iOS handoff diagnostics (query flags from host / extension). */
  const [nativeHandoffFlags, setNativeHandoffFlags] = useState({
    relay: false,
    simulator: false,
    manualResume: false,
  });
  /** Extension signaled iOS offered media but Personal Team build couldn’t stage files (no App Group). */
  const [noAppGroupStagingFlag, setNoAppGroupStagingFlag] = useState(false);
  const shareAutoExtractStarted = useRef(false);

  const sp = useMemo(() => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(initialSearchParams)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
      else u.set(k, v);
    }
    liveSearchParams.forEach((value, key) => {
      u.set(key, value);
    });
    return u;
  }, [initialSearchParams, liveSearchParams]);

  useEffect(() => {
    const {
      url: su,
      text: st,
      title,
      mediaAssetIds: shareMediaIds,
      shareReceivedAt: srvAt,
      fromShare,
      nativeIntake,
      nativeStagedMedia,
      uploadPartial,
      nativeUploadFailed,
      shareInboxPending,
      sourceAppId,
      sourceAppLabel,
      handoffFromAppGroupRelay,
      handoffSimulatorBuild,
      handoffManualResume,
      noAppGroupStaging,
    } = readShareFromSearchParams(sp);
    setNativeHandoffFlags({
      relay: handoffFromAppGroupRelay,
      simulator: handoffSimulatorBuild,
      manualResume: handoffManualResume,
    });
    setNoAppGroupStagingFlag(noAppGroupStaging);
    if (fromShare) {
      setIntakeOrigin(nativeIntake ? "native_share_extension" : "web_share_target");
      if (srvAt) setShareReceivedAt(srvAt);
      getOrCreateShareSessionId();
    }
    if (nativeStagedMedia) setNativeStagedMediaFlag(true);
    if (uploadPartial) setNativeUploadPartialFlag(true);
    setNativeUploadFailedFlag(nativeUploadFailed);
    setNativeMediaPreparing(
      Boolean(shareInboxPending && !nativeStagedMedia && !nativeUploadFailed)
    );
    if (sourceAppId.trim() || sourceAppLabel.trim()) {
      setShareSourceApp({ id: sourceAppId.trim(), label: sourceAppLabel.trim() });
    }
    if (fromShare && (st || title || shareMediaIds.length > 0)) {
      setShareSnapshots({ text: st, title: title || "" });
    }
    if (shareMediaIds.length) {
      setStagedMediaIds((prev) => [...new Set([...prev, ...shareMediaIds])]);
    }
    if (su) setUrl(su);
    if (st) setText(st);
    else if (title) setText((t) => t || title);
    // Clean long share params from the address bar after applying (MVP hygiene).
    // While `share_inbox` is present and upload not finished, keep the URL so a second Capacitor open can merge media ids.
    const waitingOnNativeInbox =
      Boolean(shareInboxPending && !nativeStagedMedia && !nativeUploadFailed);
    if (fromShare && (su || st || title || shareMediaIds.length > 0) && !waitingOnNativeInbox) {
      const clean = new URLSearchParams(sp.toString());
      clean.delete(SHARE_QUERY.flag);
      clean.delete(SHARE_QUERY.url);
      clean.delete(SHARE_QUERY.text);
      for (let seg = 2; seg <= MAX_SHARE_TEXT_SEGMENTS; seg++) {
        clean.delete(`${SHARE_QUERY.text}_${seg}`);
      }
      clean.delete(SHARE_QUERY.title);
      clean.delete(SHARE_QUERY.media);
      clean.delete(SHARE_QUERY.receivedAt);
      clean.delete(SHARE_QUERY.nativeIntake);
      clean.delete(SHARE_QUERY.nativeStagedMedia);
      clean.delete(SHARE_QUERY.uploadPartial);
      clean.delete(SHARE_QUERY.shareInbox);
      clean.delete(SHARE_QUERY.nativeUploadFailed);
      clean.delete(SHARE_QUERY.sourceApp);
      clean.delete(SHARE_QUERY.sourceAppLabel);
      clean.delete(SHARE_QUERY.handoffRelay);
      clean.delete(SHARE_QUERY.handoffSimulator);
      clean.delete(SHARE_QUERY.handoffManualResume);
      clean.delete(SHARE_QUERY.noAppGroupStaging);
      const q = clean.toString();
      window.history.replaceState({}, "", q ? `${window.location.pathname}?${q}` : window.location.pathname);
    }
  }, [sp]);

  const runExtract = useCallback(async () => {
    setSaveMsg(null);
    setSavedRecipeId(null);
    setPersonalized(null);
    setExtractError(null);
    setIsExtracting(true);
    try {
      const shareIntake = buildShareIntakePayload({
        origin: intakeOrigin,
        receivedAt: shareReceivedAt ?? undefined,
        sessionId: getOrCreateShareSessionId() || undefined,
        url: url.trim(),
        text: text.trim(),
        title: shareSnapshots?.title,
        mediaAssetIds: stagedMediaIds.length ? stagedMediaIds : undefined,
        sourceAppId: shareSourceApp?.id || undefined,
        sourceAppLabel: shareSourceApp?.label || undefined,
        nativeMediaUploadPartial: nativeUploadPartialFlag || undefined,
        nativeHandoffFromAppGroupRelay: nativeHandoffFlags.relay || undefined,
        nativeHandoffSimulatorBuild: nativeHandoffFlags.simulator || undefined,
        nativeHandoffManualResume: nativeHandoffFlags.manualResume || undefined,
        nativeNoAppGroupMediaBlocked: noAppGroupStagingFlag || undefined,
        combinedShareHandoff:
          intakeOrigin === "native_share_extension" || intakeOrigin === "web_share_target" ? true : undefined,
      });

      const res = await extractRecipeAction({
        url: url.trim(),
        text: text.trim(),
        shareTextAtOpen: shareSnapshots?.text ?? "",
        shareTitleAtOpen: shareSnapshots?.title ?? "",
        preferredLanguage: profile.preferredLanguage ?? "en",
        mediaHints: stagedMediaIds.length ? { mediaAssetIds: stagedMediaIds } : undefined,
        shareIntake,
      });
      if (!res.ok) {
        const msg =
          res.code === "UNAUTHORIZED"
            ? `${res.error} Sign in from the header menu, then try again.`
            : res.code === "RATE_LIMITED"
              ? res.error
              : res.error;
        setExtractError(msg);
        setExtracted(null);
        return;
      }
      setExtracted(res.recipe);
    } finally {
      setIsExtracting(false);
    }
  }, [
    url,
    text,
    shareSnapshots,
    stagedMediaIds,
    profile.preferredLanguage,
    intakeOrigin,
    shareReceivedAt,
    shareSourceApp,
    nativeUploadPartialFlag,
    nativeHandoffFlags,
    noAppGroupStagingFlag,
  ]);

  /** After share-target redirect, auto-run extraction when shared text and/or media warrant it. */
  useEffect(() => {
    if (shareAutoExtractStarted.current) return;
    if (!shareSnapshots) return;
    const body = text.trim();
    const hasMedia = stagedMediaIds.length > 0;
    const extractable = hasAnyExtractableText(body);
    if (nativeMediaPreparing && !extractable && !hasMedia) return;
    if (!hasMedia && !extractable) return;
    shareAutoExtractStarted.current = true;
    void runExtract();
  }, [shareSnapshots, url, text, stagedMediaIds, runExtract, nativeMediaPreparing]);

  async function handleMediaFilesSelected(files: FileList | null) {
    setMediaUploadError(null);
    if (!files?.length) return;
    setIsUploadingMedia(true);
    try {
      const next: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/media/upload", { method: "POST", body: fd, credentials: "include" });
        const data = (await res.json()) as { mediaAssetId?: string; error?: string; code?: string };
        if (!res.ok) {
          const err =
            data.code === "UNAUTHORIZED"
              ? "Sign in to attach media files."
              : data.code === "RATE_LIMITED"
                ? data.error ?? "Too many uploads. Try again shortly."
                : data.error ?? "Upload failed.";
          setMediaUploadError(err);
          continue;
        }
        if (data.mediaAssetId) next.push(data.mediaAssetId);
      }
      if (next.length) {
        setStagedMediaIds((prev) => [...new Set([...prev, ...next])]);
      }
    } finally {
      setIsUploadingMedia(false);
    }
  }

  const togglePref = useCallback((p: DietPreference) => {
    setPrefs((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }, []);

  const toggleGoal = useCallback((g: NutritionGoal) => {
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }, []);

  function handleExtract() {
    void runExtract();
  }

  function handlePersonalize() {
    if (!extracted || extracted.ingestionSource === "url_only_insufficient") return;
    setSaveMsg(null);
    setSavedRecipeId(null);
    const next = personalizeRecipeWithContext(extracted, {
      preferences: prefs,
      goals,
      allergies: profile.allergies,
      dietaryPattern: profile.dietaryPattern,
      dislikedIngredients: profile.dislikedIngredients,
    });
    setPersonalized(next);
  }

  function handleSave(saveAsOriginalOnly = false) {
    if (!extracted || mode !== "app") return;
    if (extracted.ingestionSource === "url_only_insufficient") return;
    if (!saveAsOriginalOnly && !personalized) return;
    setSaveMsg(null);
    startTransition(async () => {
      const finalPersonalized = saveAsOriginalOnly ? null : personalized;
      const res = await saveRecipeAction({
        title: finalPersonalized?.title ?? extracted.title,
        sourceUrl: extracted.sourceUrl ?? null,
        sourcePlatform: extracted.sourcePlatform ?? extracted.sourceType,
        creatorHandle: extracted.creatorHandle ?? null,
        original: extracted,
        personalized: finalPersonalized,
        preferences: prefs,
        goals,
        substitutions: finalPersonalized?.substitutions ?? [],
      });
      if (res.error) {
        setSaveMsg(res.error);
        setSavedRecipeId(null);
      } else {
        setSaveMsg("Saved to your cookbook.");
        setSavedRecipeId(res.id ?? null);
      }
    });
  }

  const canSave =
    mode === "app" && !!userEmail && !!personalized && extracted?.ingestionSource !== "url_only_insufficient";

  const isLinkOnlyInsufficient = extracted?.ingestionSource === "url_only_insufficient";

  return (
    <div className="space-y-8 px-4 pb-16 pt-6">
      <section className="mx-auto max-w-3xl rounded-card border border-reelish-border bg-reelish-surface p-5 shadow-soft">
        <h1 className="font-serif text-2xl font-semibold text-reelish-cream">
          {mode === "demo" ? "Try Reelish (demo)" : "Import recipe"}
        </h1>
        <p className="mt-1 text-sm text-reelish-muted">
          <strong className="text-reelish-cream/90">Primary flow:</strong> use Share → Reelish from Instagram, TikTok, or Facebook
          (PWA or native app).           Reelish ingests the link, any text the OS sends, shared images/video, and (when configured) legitimate
          weak public retrieval from the canonical post URL — then runs extraction from that combined evidence —
          including speech-to-text and on-screen text when you shared media.{" "}
          <strong className="text-reelish-cream/90">Optional:</strong> edit the fields below if you need to add a note; pasting a
          full caption is a fallback, not required when share + media work. Reelish never scrapes feeds. With{" "}
          <code className="text-reelish-gold/90">OPENAI_API_KEY</code> and ffmpeg, video frames and audio are analyzed automatically.
        </p>
        {mode === "demo" ? (
          <p className="mt-3 rounded-xl bg-reelish-elevated/80 px-3 py-2 text-xs text-reelish-muted">
            You’re in demo mode.{" "}
            <a href="/auth/sign-up" className="text-reelish-gold underline-offset-2 hover:underline">
              Create an account
            </a>{" "}
            to save recipes.
          </p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-reelish-gold/30 bg-reelish-gold/5 px-3 py-2.5">
            <p className="text-xs font-semibold text-reelish-gold">Share in (primary)</p>
            <p className="mt-1 text-[11px] leading-snug text-reelish-muted">
              Install the PWA or native shell → Share → Reelish. Link, preview text, title, and files the OS attaches are
              combined into one import and processed together.
            </p>
          </div>
          <div className="rounded-xl border border-reelish-border px-3 py-2.5">
            <p className="text-xs font-semibold text-reelish-cream/90">Edit / paste (fallback)</p>
            <p className="mt-1 text-[11px] leading-snug text-reelish-muted">
              Tweak the link or add text if a share missed something — not required when Share delivered enough signal.
            </p>
          </div>
          <div className="rounded-xl border border-reelish-border px-3 py-2.5">
            <p className="text-xs font-semibold text-reelish-cream/90">Extra media</p>
            <p className="mt-1 text-[11px] leading-snug text-reelish-muted">
              Attach more clips or images here if needed; same pipeline as shared media (OpenAI + ffmpeg for video).
            </p>
          </div>
        </div>

        {nativeMediaPreparing ? (
          <div
            className="mt-4 rounded-xl border border-reelish-gold/35 bg-reelish-gold/10 px-4 py-3 text-sm text-reelish-cream"
            role="status"
          >
            <p className="font-medium text-reelish-gold">Preparing shared media…</p>
            <p className="mt-1 text-xs text-reelish-muted">
              iOS is uploading files from the share extension. This screen should update in a moment — simulator Safari
              can be slower than a real device.
            </p>
          </div>
        ) : null}
        {nativeUploadFailedFlag ? (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-reelish-cream" role="alert">
            <p className="font-medium text-red-300">Couldn’t upload shared files</p>
            <p className="mt-1 text-xs text-reelish-muted">
              Check network and sign-in, then try sharing again. You can still extract from the link or caption if they
              appeared above.
            </p>
          </div>
        ) : null}

        <ShareArrivalStatus
          url={url}
          text={text}
          shareTitle={shareSnapshots?.title}
          shareBody={shareSnapshots?.text}
          mediaCount={stagedMediaIds.length}
          intakeOrigin={intakeOrigin}
          shareReceivedAt={shareReceivedAt}
          nativeStagedMedia={nativeStagedMediaFlag}
          nativeUploadPartial={nativeUploadPartialFlag}
          handoffFromAppGroupRelay={nativeHandoffFlags.relay}
          handoffSimulatorBuild={nativeHandoffFlags.simulator}
          handoffManualResume={nativeHandoffFlags.manualResume}
          noAppGroupMediaBlocked={noAppGroupStagingFlag}
        />

        <label className="mt-5 block text-sm font-medium text-reelish-cream">Recipe link</label>
        <input
          className="mt-1 w-full rounded-xl border border-reelish-border bg-reelish-bg px-4 py-3 text-reelish-cream placeholder:text-reelish-muted/70"
          placeholder="https://www.instagram.com/reel/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <label className="mt-4 block text-sm font-medium text-reelish-cream">
          Caption / recipe text <span className="font-normal text-reelish-muted">(from Share when available — edit or add only if needed)</span>
        </label>
        <textarea
          className="mt-1 min-h-[120px] w-full rounded-xl border border-reelish-border bg-reelish-bg px-4 py-3 text-reelish-cream placeholder:text-reelish-muted/70"
          placeholder="Usually filled from Share. Add or edit text only if iOS sent a short preview — Korean, Turkish, English, etc. all work."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="mt-4 rounded-xl border border-reelish-border/80 bg-reelish-bg/30 px-4 py-3">
          <label className="block text-sm font-medium text-reelish-cream">
            Attach media <span className="font-normal text-reelish-muted">(optional — audio, video, or images)</span>
          </label>
          <p className="mt-1 text-xs text-reelish-muted">
            Uploads are stored on the server for this extraction only (MVP local disk). Video requires{" "}
            <code className="text-reelish-gold/80">ffmpeg</code> on the server for frames and audio.
          </p>
          <input
            type="file"
            accept="audio/*,video/*,image/*"
            multiple
            className="mt-2 block w-full text-sm text-reelish-muted file:mr-3 file:rounded-lg file:border-0 file:bg-reelish-elevated file:px-3 file:py-2 file:text-reelish-cream"
            disabled={isUploadingMedia}
            onChange={(e) => void handleMediaFilesSelected(e.target.files)}
          />
          {isUploadingMedia ? <p className="mt-2 text-xs text-reelish-muted">Uploading…</p> : null}
          {mediaUploadError ? (
            <p className="mt-2 text-xs text-red-400/90" role="alert">
              {mediaUploadError}
            </p>
          ) : null}
          {stagedMediaIds.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {stagedMediaIds.map((id) => (
                <span
                  key={id}
                  className="rounded-full border border-reelish-border bg-reelish-elevated/60 px-2.5 py-1 font-mono text-[11px] text-reelish-cream/90"
                >
                  Media {id.slice(0, 8)}…
                </span>
              ))}
              <button
                type="button"
                className="text-xs text-reelish-gold underline-offset-2 hover:underline"
                onClick={() => setStagedMediaIds([])}
              >
                Clear media
              </button>
            </div>
          ) : null}
        </div>

        {process.env.NODE_ENV === "development" ? (
          <p className="mt-3 text-xs text-reelish-muted">
            <Link href="/dev/multimodal-test" className="text-reelish-gold hover:underline">
              Open dev multimodal test page
            </Link>{" "}
            for end-to-end media extraction.
          </p>
        ) : null}

        {extractError ? (
          <p className="mt-3 text-sm text-red-400/90" role="alert">
            {extractError}
          </p>
        ) : null}

        <button
          type="button"
          disabled={isExtracting}
          onClick={() => void handleExtract()}
          className="mt-4 w-full rounded-xl bg-reelish-accent py-3.5 font-semibold text-white shadow-glow hover:bg-reelish-accentHover transition-colors disabled:opacity-60 sm:w-auto sm:px-8"
        >
          {isExtracting ? "Extracting…" : "Extract recipe"}
        </button>
      </section>

      <section className="mx-auto max-w-3xl">
        {!extracted ? (
          <EmptyRecipeIllustration />
        ) : (
          <div className="overflow-hidden rounded-card border border-reelish-border bg-reelish-surface shadow-soft">
            <div className="h-36 bg-gradient-to-br from-reelish-accent/40 to-reelish-bg" aria-hidden />
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-2xl font-semibold text-reelish-cream">{extracted.title}</h2>
                <span className="rounded-full bg-reelish-elevated px-3 py-1 text-xs text-reelish-muted">
                  From {sourceLabel(extracted.sourceType)}
                </span>
              </div>
              {extracted.sourceUrl ? (
                <a
                  href={extracted.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-reelish-gold hover:underline"
                >
                  Open source link
                </a>
              ) : null}
              {describeIngestionSource(extracted.ingestionSource) ? (
                <p className="text-xs text-reelish-muted">
                  Content source: {describeIngestionSource(extracted.ingestionSource)}
                </p>
              ) : null}
              <div className="mt-2">
                <ExtractionEvidencePanel recipe={extracted} />
              </div>

              {isLinkOnlyInsufficient ? (
                <div className="rounded-xl border border-reelish-gold/35 bg-reelish-gold/10 px-4 py-3 text-sm text-reelish-cream">
                  <p className="font-medium text-reelish-gold">
                    {extracted.sourceType === "instagram"
                      ? "Instagram: your post link is saved — a full recipe wasn’t reconstructed"
                      : "We saved the link — add more signal for a full recipe"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-reelish-cream/90">
                    {extracted.sourceType === "instagram" || extracted.sourceType === "tiktok"
                      ? "What happened: Reelish ran source retrieval on this URL (public oEmbed/metadata when enabled) but could not recover enough caption-like text for a full recipe."
                      : "What happened: source retrieval on this URL did not yield enough text for ingredients and steps."}
                  </p>
                  <p className="mt-2 text-reelish-muted">
                    {extracted.sourceType === "instagram" ? (
                      <>
                        Check the evidence panel below for which providers ran. Try <strong className="text-reelish-cream/90">Share →
                        Reelish</strong> with media (transcript/OCR), enable{" "}
                        <code className="text-reelish-gold/90">REELISH_EXPERIMENTAL_SOCIAL_RETRIEVAL=1</code> on the server, or paste
                        the caption only if retrieval truly failed. Reelish won’t invent a recipe or log into Instagram.
                      </>
                    ) : extracted.sourceType === "tiktok" ? (
                      <>
                        Check the evidence panel for provider outcomes. Share with media, enable experimental social retrieval on the
                        server, or paste the caption as a fallback.
                      </>
                    ) : (
                      <>
                        See evidence below for retrieval attempts. Paste the caption, recipe text, or attach a clip, then tap{" "}
                        <strong className="text-reelish-cream/90">Extract recipe</strong> again.
                      </>
                    )}
                  </p>
                </div>
              ) : null}

              {(extracted.extractionWarnings?.length ||
                extracted.extractionConfidence != null ||
                extracted.measurementConfidence != null ||
                extracted.sourceLanguage ||
                extracted.outputLanguage) ? (
                <div className="rounded-xl border border-reelish-border/80 bg-reelish-bg/40 px-3 py-2 text-xs text-reelish-muted">
                  {extracted.sourceLanguage ? (
                    <p>
                      <span className="text-reelish-cream/80">Source language:</span> {extracted.sourceLanguage}
                      {extracted.outputLanguage ? (
                        <>
                          {" "}
                          → <span className="text-reelish-cream/80">Output:</span> {extracted.outputLanguage}
                        </>
                      ) : null}
                    </p>
                  ) : extracted.outputLanguage ? (
                    <p>
                      <span className="text-reelish-cream/80">Output language:</span> {extracted.outputLanguage}
                    </p>
                  ) : null}
                  {extracted.estimatedServings != null && extracted.estimatedServings > 0 ? (
                    <p className="mt-1">
                      <span className="text-reelish-cream/80">Servings:</span> ~{extracted.estimatedServings}
                    </p>
                  ) : null}
                  {extracted.extractionConfidence != null || extracted.measurementConfidence != null ? (
                    <p className="mt-1">
                      {extracted.extractionConfidence != null ? (
                        <>
                          Extraction confidence: {Math.round(extracted.extractionConfidence * 100)}%
                        </>
                      ) : null}
                      {extracted.extractionConfidence != null && extracted.measurementConfidence != null
                        ? " · "
                        : null}
                      {extracted.measurementConfidence != null ? (
                        <>Measurements: {Math.round(extracted.measurementConfidence * 100)}%</>
                      ) : null}
                    </p>
                  ) : null}
                  {extracted.extractionWarnings?.length ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-reelish-gold/85">
                      {extracted.extractionWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {extracted.notes?.length ? (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-reelish-muted">Notes</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-reelish-cream/95">
                    {extracted.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-reelish-muted">Ingredients</h3>
                  <RecipeIngredientList ingredients={extracted.ingredients} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-reelish-muted">Steps</h3>
                  <RecipeStepsList steps={extracted.steps} />
                </div>
              </div>

              <div className="border-t border-reelish-border pt-6">
                <h3 className="font-serif text-xl text-reelish-cream">Make this recipe yours</h3>
                <p className="mt-1 text-sm text-reelish-muted">
                  We’ll swap ingredients and tweak steps using rules in{" "}
                  <code className="text-reelish-gold/90">lib/personalize-recipe.ts</code> — ready for an AI upgrade
                  later.
                </p>
                {!!profile.allergies.length || !!profile.dislikedIngredients.length ? (
                  <p className="mt-2 text-xs text-reelish-gold/90">
                    Auto-safety is on: allergies/restrictions/dislikes from your profile are enforced first.
                  </p>
                ) : null}
                <div className="mt-4">
                  <SelectionChips
                    preferences={prefs}
                    goals={goals}
                    onTogglePreference={togglePref}
                    onToggleGoal={toggleGoal}
                  />
                </div>
                <button
                  type="button"
                  disabled={isLinkOnlyInsufficient}
                  onClick={handlePersonalize}
                  className="mt-5 w-full rounded-xl border border-reelish-gold/40 bg-reelish-gold/10 py-3 font-semibold text-reelish-cream hover:bg-reelish-gold/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8"
                >
                  Personalize recipe
                </button>
                {isLinkOnlyInsufficient ? (
                  <p className="mt-2 text-xs text-reelish-muted">
                    Personalize and save unlock once extraction has caption, recipe text, or media to work from.
                  </p>
                ) : null}
                {mode === "app" ? (
                  <button
                    type="button"
                    disabled={isLinkOnlyInsufficient}
                    onClick={() => handleSave(true)}
                    className="mt-3 w-full rounded-xl border border-reelish-border py-3 text-sm font-semibold text-reelish-cream hover:bg-reelish-elevated/50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8"
                  >
                    Save original recipe
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </section>

      {personalized ? (
        <section className="mx-auto max-w-3xl rounded-card border border-reelish-accent/30 bg-reelish-elevated/40 p-5 shadow-soft">
          <h2 className="font-serif text-2xl font-semibold text-reelish-cream">Your Reelish version</h2>
          <p className="mt-2 text-sm text-reelish-muted">{personalized.rationale}</p>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-reelish-muted">Ingredients</h3>
              <RecipeIngredientList
                ingredients={personalized.ingredients}
                className="mt-2 list-disc space-y-1.5 pl-5 text-sm"
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-reelish-muted">Steps</h3>
              <RecipeStepsList steps={personalized.steps} className="mt-2 list-decimal space-y-1.5 pl-5 text-sm" />
            </div>
          </div>

          {personalized.substitutions.length ? (
            <div className="mt-6 rounded-xl bg-reelish-bg/60 p-4">
              <h3 className="text-sm font-semibold text-reelish-cream">Substitutions</h3>
              <ul className="mt-2 space-y-2 text-sm text-reelish-muted">
                {personalized.substitutions.map((s, i) => (
                  <li key={i}>
                    <span className="text-reelish-cream/90">{s.from}</span>
                    <span className="mx-1 text-reelish-muted">→</span>
                    <span className="text-reelish-cream/90">{s.to}</span>
                    <span className="mt-0.5 block text-xs">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canSave ? (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleSave(false)}
                className="rounded-xl bg-reelish-accent px-6 py-3 font-semibold text-white hover:bg-reelish-accentHover disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save recipe"}
              </button>
              {saveMsg ? <p className="text-sm text-reelish-gold">{saveMsg}</p> : null}
              {savedRecipeId ? (
                <Link
                  href={`/recipe/${savedRecipeId}`}
                  className="rounded-xl border border-reelish-border px-6 py-3 text-center text-sm font-semibold text-reelish-cream hover:bg-reelish-surface"
                >
                  View saved recipe
                </Link>
              ) : null}
            </div>
          ) : mode === "app" && !userEmail ? (
            <p className="mt-4 text-sm text-reelish-muted">Sign in to save recipes.</p>
          ) : null}
        </section>
      ) : null}

      <section className="mx-auto max-w-3xl rounded-card border border-reelish-border bg-reelish-surface/60 p-5">
        <h3 className="font-serif text-lg text-reelish-cream">Sample paste (try it)</h3>
        <p className="mt-1 text-xs text-reelish-muted">
          Copy into the caption field to test extraction. Link-only stays transparent until there’s text or media to parse.
        </p>
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-reelish-bg p-3 text-xs text-reelish-muted">
          {`Title: Creamy Tuscan Chicken Pasta
Ingredients:
- 1 lb chicken breast
- 12 oz penne pasta
- 2 tbsp butter
- 1 cup heavy cream
Steps:
1. Cook pasta; reserve water.
2. Sear chicken in butter.
3. Simmer cream and fold in spinach.`}
        </pre>
      </section>
    </div>
  );
}
