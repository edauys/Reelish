import type { TranscriptProvider, TranscriptResult } from "@/lib/reconstruction/providers/transcript";

function stripDataUrl(b64OrDataUrl: string): { base64: string; mime?: string } {
  const t = b64OrDataUrl.trim();
  const m = t.match(/^data:([^;]+);base64,(.+)$/i);
  if (m) {
    return { base64: m[2]!, mime: m[1] };
  }
  return { base64: t };
}

function extensionForMime(mime?: string): string {
  if (!mime) return "bin";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("mpeg4")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp3")) return "mp3";
  if (mime.includes("m4a") || mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("flac")) return "flac";
  return "bin";
}

/**
 * OpenAI Whisper (`audio/transcriptions`). Requires `OPENAI_API_KEY` and inline `audioBase64`.
 * Does not download audio from `sourceUrl`.
 */
export const openAiWhisperTranscriptProvider: TranscriptProvider = {
  async fetchTranscript(input): Promise<TranscriptResult | null> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;

    const raw = input.audioBase64?.trim();
    if (!raw) return null;

    const { base64, mime: fromData } = stripDataUrl(raw);
    const mime = input.audioMimeType?.trim() || fromData || "application/octet-stream";
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch {
      return null;
    }
    if (buffer.length < 256) return null;

    const ext = extensionForMime(mime);
    const filename = input.filenameHint?.trim() || `clip.${ext}`;

    const formData = new FormData();
    const bytes = new Uint8Array(buffer);
    formData.append("file", new Blob([bytes], { type: mime }), filename);
    formData.append("model", process.env.OPENAI_WHISPER_MODEL?.trim() || "whisper-1");
    formData.append("response_format", "json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      if (process.env.REELISH_DEBUG_EXTRACTION === "1") {
        const errText = await res.text();
        console.error("[reelish:whisper]", res.status, errText.slice(0, 400));
      }
      return null;
    }

    const data = (await res.json()) as { text?: string };
    const text = data.text?.trim();
    if (!text) return null;

    return {
      text,
      confidence: 0.82,
      provider: "openai_whisper",
    };
  },
};
