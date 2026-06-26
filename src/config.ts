// ─────────────────────────────────────────────────────────────────────────
// Central config. The app is a thin client — all logic lives on the backend.
// Only BASE_URL changes between environments.
// ─────────────────────────────────────────────────────────────────────────

/** Production API host. Change this if you point the app at a different server. */
export const BASE_URL = "https://targettedpromotions.com";
export const API_URL = `${BASE_URL}/api`;

/** Playback cadence — must match the web player so play-logs/billing line up. */
export const SLOT_DURATION = 12; // seconds each slot is shown
export const TOTAL_SLOTS = 30; // slots cycle 1 → 30 → 1

/** Background timers. */
export const HEARTBEAT_MS = 30_000; // session keep-alive
export const SLOTS_REFRESH_MS = 30_000; // re-fetch slots to pick up newly approved ads
export const LOCATION_REPORT_MS = 30 * 60_000; // push GPS to server every 30 min

/**
 * Media URLs from the API are stored relative (e.g. "/objects/uploads/abc").
 * Absolutise them against BASE_URL so the TV can load them.
 */
export function mediaUri(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Decide whether a slot's media is a video (vs an image). */
export function isVideo(mediaType?: string | null, url?: string | null): boolean {
  const t = (mediaType || "").toLowerCase();
  if (t.includes("video")) return true;
  if (t.includes("image")) return false;
  const u = (url || "").toLowerCase();
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/.test(u);
}
