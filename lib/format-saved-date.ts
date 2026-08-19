/**
 * Stable date formatting for SSR + client hydration.
 * Do not use `toLocaleString(undefined, ...)` — default locale differs between Node and browsers.
 */
const savedAtFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatSavedAtUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return savedAtFormatter.format(d);
}
