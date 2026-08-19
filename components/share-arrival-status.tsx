import { hasAnyExtractableText } from "@/lib/extraction/ingestion";
import { looksLikeIosInstagramLinkTeaser } from "@/lib/share/caption-intake-hints";
import type { ShareIntakeOrigin } from "@/lib/share/types";

function originLabel(o: ShareIntakeOrigin): string {
  switch (o) {
    case "web_share_target":
      return "Web share (PWA)";
    case "manual_import":
      return "Manual import";
    case "native_share_extension":
      return "Native share (iOS)";
    case "programmatic":
      return "Programmatic";
    default:
      return o;
  }
}

/**
 * Explains what arrived from a share vs what is still missing — primary path transparency.
 */
export function ShareArrivalStatus({
  url,
  text,
  shareTitle,
  shareBody,
  mediaCount,
  intakeOrigin,
  shareReceivedAt,
  nativeStagedMedia,
  nativeUploadPartial,
  handoffFromAppGroupRelay,
  handoffSimulatorBuild,
  handoffManualResume,
  /** Personal Team: iOS had media in the share payload but App Group staging was unavailable. */
  noAppGroupMediaBlocked,
}: {
  url: string;
  text: string;
  shareTitle?: string;
  shareBody?: string;
  mediaCount: number;
  intakeOrigin: ShareIntakeOrigin;
  shareReceivedAt: string | null;
  /** Media was staged in the iOS App Group and uploaded before landing on the dashboard. */
  nativeStagedMedia?: boolean;
  /** Some native files failed upload or were over the size limit; remaining ids still attached. */
  nativeUploadPartial?: boolean;
  /** Host restored full handoff from App Group after a minimal wake URL. */
  handoffFromAppGroupRelay?: boolean;
  /** Simulator-target extension build — `extensionContext.open` is often flaky. */
  handoffSimulatorBuild?: boolean;
  /** User opened the app manually; pending handoff was replayed from App Group. */
  handoffManualResume?: boolean;
  noAppGroupMediaBlocked?: boolean;
}) {
  const hasUrl = Boolean(url.trim());
  const bodyUsable = hasAnyExtractableText(text);
  const sharedBodyUsable = hasAnyExtractableText(shareBody ?? "");
  const hasTitle = Boolean(shareTitle?.trim());
  const hasSharedBody = Boolean(shareBody?.trim());
  const bareLink = hasUrl && !bodyUsable && !sharedBodyUsable && !mediaCount;
  const teaserLikely =
    intakeOrigin === "native_share_extension" &&
    (looksLikeIosInstagramLinkTeaser(shareBody ?? "") || looksLikeIosInstagramLinkTeaser(text));
  const handoffDiagParts = [
    nativeStagedMedia ? "App Group → server upload ran" : null,
    nativeUploadPartial ? "partial upload (some files skipped)" : null,
    handoffFromAppGroupRelay ? "full query restored from App Group" : null,
    handoffManualResume ? "replay after manual open" : null,
    handoffSimulatorBuild ? "simulator extension build" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="mt-5 space-y-3 rounded-xl border border-reelish-border/90 bg-reelish-bg/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-reelish-cream/85">Import path</p>
        <span className="rounded-full bg-reelish-elevated/80 px-2.5 py-0.5 text-[11px] text-reelish-muted">
          {originLabel(intakeOrigin)}
        </span>
      </div>
      {intakeOrigin === "web_share_target" && shareReceivedAt ? (
        <p className="text-[11px] text-reelish-muted">Share received (server time): {shareReceivedAt}</p>
      ) : null}

      {intakeOrigin === "native_share_extension" ? (
        <div className="rounded-lg border border-reelish-border/80 bg-reelish-elevated/40 px-3 py-2 text-[11px] leading-snug text-reelish-muted">
          <p className="font-medium text-reelish-cream/90">Native share handoff</p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5">
            <li>
              {handoffManualResume
                ? "Replayed after you opened Reelish manually — the share was waiting in the App Group (common when the Simulator or OS doesn’t auto-open the host app)."
                : "Arrived via iOS share extension — text is whatever Safari/Instagram put on the pasteboard."}
            </li>
            {handoffSimulatorBuild ? (
              <li>
                Simulator build: if Reelish didn’t come to the foreground by itself, switch to the app manually; the
                import should still appear once this screen loads.
              </li>
            ) : null}
            {handoffFromAppGroupRelay && !handoffManualResume ? (
              <li>Full handoff was restored from App Group (short wake URL) — your caption segments should match what the extension captured.</li>
            ) : null}
            {teaserLikely ? (
              <li className="text-reelish-gold/90">
                The shared text looks like the short Instagram preview — iOS often omits the full caption for link shares.
                Reelish will still use shared video/images for speech and on-screen text when you attached them; you only need
                to type more if there was no usable media.
              </li>
            ) : null}
            {teaserLikely && mediaCount > 0 ? (
              <li className="text-reelish-cream/90">
                After extract, check <span className="text-reelish-gold/90">Evidence Reelish used</span> — transcript/OCR should
                lead over the preview line when both exist.
              </li>
            ) : null}
            {handoffDiagParts.length ? (
              <li className="text-reelish-muted">Handoff diagnostics: {handoffDiagParts.join(" · ")}</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <ul className="space-y-1.5 text-sm text-reelish-cream/95">
        <li className="flex gap-2">
          <span className="text-reelish-gold/90">{hasUrl ? "✓" : "○"}</span>
          <span>{hasUrl ? "Shared link captured" : "No link yet — paste a post URL if you have one"}</span>
        </li>
        <li className="flex gap-2">
          <span className="text-reelish-gold/90">{bodyUsable || sharedBodyUsable ? "✓" : "○"}</span>
          <span>
            {bodyUsable || sharedBodyUsable
              ? "Caption or recipe text available (stronger extraction)"
              : hasSharedBody
                ? "Share included text — Reelish will combine it with any shared media automatically"
                : "No text in the share — OK if you shared video/image; Reelish uses media when the OS attaches it"}
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-reelish-gold/90">{hasTitle ? "✓" : "○"}</span>
          <span>{hasTitle ? "Title from share sheet" : "No separate title from share"}</span>
        </li>
        <li className="flex gap-2">
          <span className="text-reelish-gold/90">{mediaCount > 0 ? "✓" : "○"}</span>
          <span>
            {mediaCount > 0
              ? `Media attached (${mediaCount} file${mediaCount === 1 ? "" : "s"}) for transcript / vision`
              : "No media files — optional for multimodal extraction"}
            {nativeStagedMedia && mediaCount > 0 ? (
              <span className="ml-1 text-[11px] text-reelish-gold/90"> (from iOS Share)</span>
            ) : null}
            {nativeUploadPartial && mediaCount > 0 ? (
              <span className="ml-1 text-[11px] text-reelish-muted"> — partial upload</span>
            ) : null}
          </span>
        </li>
      </ul>

      {noAppGroupMediaBlocked ? (
        <div className="rounded-lg border border-reelish-gold/35 bg-reelish-gold/10 px-3 py-2 text-sm text-reelish-cream">
          <p className="font-medium text-reelish-gold">Video or photo was in the share sheet but couldn’t be copied to Reelish</p>
          <p className="mt-1 text-xs text-reelish-muted">
            This Personal Team build has no App Group container, so large files aren’t staged for upload. Recipe signal will come from
            the link and any text iOS sent — not from transcript/OCR until you use an App Groups build or attach media inside Reelish.
          </p>
        </div>
      ) : null}

      {bareLink ? (
        <div className="rounded-lg border border-reelish-gold/30 bg-reelish-gold/10 px-3 py-2 text-sm text-reelish-cream">
          <p className="font-medium text-reelish-gold">Link only — iOS/Instagram didn’t attach usable caption or media this time</p>
          <p className="mt-1 text-xs text-reelish-muted">
            Reelish doesn’t scrape Instagram. Share again when the OS includes more text or files, or attach a clip here — primary path is
            still Share → Reelish.
          </p>
        </div>
      ) : null}

      {intakeOrigin === "native_share_extension" && process.env.NODE_ENV === "development" ? (
        <p className="text-[10px] leading-snug text-reelish-muted/80">
          Dev: set <code className="text-reelish-gold/90">NEXT_PUBLIC_REELISH_NATIVE_BRIDGE_DEBUG=1</code> and attach Safari →
          Develop → your device → Reelish to see <code className="text-reelish-gold/90">[reelish:native-bridge]</code> handoff
          logs in the console.
        </p>
      ) : null}
    </div>
  );
}
