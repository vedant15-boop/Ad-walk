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
// Drain the offline play backlog while broadcasting. Previously this only
// happened on the screen-select screen, so a TV left playing — the normal
// case — never sent its queued plays at all.
export const PLAY_QUEUE_FLUSH_MS = 2 * 60_000;

export const SHOW_QR_PANEL = true;

/**
 * Demo-only: AuthUser.id values allowed to manually jump PlayerScreen to
 * any slot while broadcasting, instead of waiting the ~12s/slot rotation.
 * Jumping changes what's shown/logged (recordPlay feeds advertiser
 * billing), so this is an explicit allowlist of specific accounts, not a
 * role check. Empty array = disabled for everyone.
 */
export const DEMO_JUMP_ALLOWLIST_IDS: number[] = [45]; // demo runner only

/**
 * Demo-only: AuthUser.id values that play each slot for
 * DEMO_FAST_SLOT_SECONDS instead of the real SLOT_DURATION. Scoped to a
 * dedicated demo runner account — never a real deployment.
 */
export const DEMO_FAST_SLOT_SECONDS = 4;
export const DEMO_FAST_SLOT_ALLOWLIST_IDS: number[] = [45]; // demo runner

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
