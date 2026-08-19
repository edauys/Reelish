import { notFound } from "next/navigation";
import { DevMultimodalClient } from "@/app/dev/multimodal-test/dev-multimodal-client";

export const metadata = {
  title: "Multimodal test · Reelish",
};

export default function DevMultimodalTestPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return (
    <div className="min-h-screen bg-reelish-bg px-4 py-10 text-reelish-cream">
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="font-serif text-2xl">Dev: multimodal extraction</h1>
        <p className="text-sm text-reelish-muted">
          Upload a local audio, image, or video file. The server stores it under <code className="text-reelish-gold/90">REELISH_MEDIA_DIR</code>{" "}
          (default <code className="text-reelish-gold/90">.data/reelish-media</code>), expands it for Whisper + vision, then runs
          extraction. Install <code className="text-reelish-gold/90">ffmpeg</code> for video frame + audio extraction.
        </p>
        <DevMultimodalClient />
      </div>
    </div>
  );
}
