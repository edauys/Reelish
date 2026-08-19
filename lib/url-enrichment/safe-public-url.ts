/**
 * SSRF guard: only allow http(s) URLs with public-looking hostnames (no loopback / RFC1918 / metadata IPs).
 */

const PRIVATE_IPV4 = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/;

function isProbablyPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0") return true;
  if (h.includes(":")) {
    // IPv6 — block loopback and link-local
    if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  }
  if (PRIVATE_IPV4.test(h)) return true;
  return false;
}

/** Returns normalized https? URL string, or null if not allowed. */
export function safePublicHttpUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (isProbablyPrivateHost(u.hostname)) return null;
  if (u.username || u.password) return null;
  return u.href;
}
