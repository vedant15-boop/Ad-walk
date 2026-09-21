import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthUser, Screen } from "./types";

// Token + user persist across reboots so the TV resumes broadcasting
// after a power cut without anyone re-typing credentials.
const TOKEN_KEY = "adwalk_token";
const USER_KEY = "adwalk_user";

export async function saveAuth(token: string, user: AuthUser): Promise<void> {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [USER_KEY, JSON.stringify(user)],
  ]);
}

export async function loadAuth(): Promise<{ token: string; user: AuthUser } | null> {
  const [[, token], [, userRaw]] = await AsyncStorage.multiGet([TOKEN_KEY, USER_KEY]);
  if (!token || !userRaw) return null;
  try {
    return { token, user: JSON.parse(userRaw) as AuthUser };
  } catch {
    return null;
  }
}

export async function clearAuth(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

// ── Display orientation ─────────────────────────────────────────────────────
//
// The panel is carried physically turned on its side, so the box still thinks
// it's landscape and renders content lying down from a passer-by's point of
// view. "portrait" counter-rotates to cancel that out.
//
// A device setting rather than a server one: only whoever straps the screen on
// can see which way it ended up.
export type DisplayOrientation = "landscape" | "portrait";

const ORIENTATION_KEY = "adwalk_orientation";

export async function loadOrientation(): Promise<DisplayOrientation> {
  try {
    const raw = await AsyncStorage.getItem(ORIENTATION_KEY);
    return raw === "portrait" ? "portrait" : "landscape";
  } catch {
    return "landscape";
  }
}

export async function saveOrientation(value: DisplayOrientation): Promise<void> {
  try {
    await AsyncStorage.setItem(ORIENTATION_KEY, value);
  } catch {
    // best-effort — the in-memory setting still applies for this session
  }
}

// ── Last-known slots (fallback when app restarts offline) ───────────────────
function slotsKey(screenId: number) {
  return `adplay_slots_${screenId}`;
}

export async function saveSlots(screenId: number, slots: unknown[]): Promise<void> {
  try {
    await AsyncStorage.setItem(slotsKey(screenId), JSON.stringify(slots));
  } catch {
    // best-effort
  }
}

export async function loadSlots(screenId: number): Promise<unknown[] | null> {
  try {
    const raw = await AsyncStorage.getItem(slotsKey(screenId));
    return raw ? (JSON.parse(raw) as unknown[]) : null;
  } catch {
    return null;
  }
}

// ── Runner's assigned screens (fallback when screen-select loads offline) ───
const SCREENS_KEY = "adwalk_screens";

export async function saveScreens(screens: Screen[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SCREENS_KEY, JSON.stringify(screens));
  } catch {
    // best-effort
  }
}

export async function loadScreens(): Promise<Screen[] | null> {
  try {
    const raw = await AsyncStorage.getItem(SCREENS_KEY);
    return raw ? (JSON.parse(raw) as Screen[]) : null;
  } catch {
    return null;
  }
}

// ── Queued plays that failed to reach the server (offline) ──────────────────
// Appended to instead of dropped whenever a live recordPlay call fails.
// Cleared only after the server confirms receipt via the batch endpoint —
// never optimistically, so a failed sync attempt never loses data.
export interface QueuedPlay {
  screenId: number;
  adId: number;
  slotNumber: number;
  playedAt: string;
  durationSeconds: number;
}

const PLAY_QUEUE_KEY = "adwalk_play_queue";

/**
 * Hard cap on the offline backlog. At ~7,200 plays/day an unbounded queue
 * grows until AsyncStorage refuses the write, at which point every later play
 * is lost silently. Dropping the oldest keeps the most recent (and most
 * likely still billable) plays instead.
 */
export const MAX_QUEUED_PLAYS = 20000;

export async function queuePlay(play: QueuedPlay): Promise<void> {
  try {
    const existing = await loadQueuedPlays();
    const next = [...existing, play];
    const trimmed = next.length > MAX_QUEUED_PLAYS ? next.slice(next.length - MAX_QUEUED_PLAYS) : next;
    if (trimmed.length < next.length) {
      console.warn(`[adwalk] play queue full — dropped ${next.length - trimmed.length} oldest play(s)`);
    }
    await AsyncStorage.setItem(PLAY_QUEUE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    // Losing a play here means losing revenue, so make it visible rather than
    // failing silently the way this used to.
    console.warn("[adwalk] failed to queue play for later sync", err);
  }
}

export async function loadQueuedPlays(): Promise<QueuedPlay[]> {
  try {
    const raw = await AsyncStorage.getItem(PLAY_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedPlay[]) : [];
  } catch {
    return [];
  }
}

// Removes exactly the first `count` entries (the queue is FIFO/append-only,
// so these are the oldest — the ones that were actually sent). Any plays
// queued while the send was in flight are newer and stay behind.
export async function removeOldestQueuedPlays(count: number): Promise<void> {
  try {
    const current = await loadQueuedPlays();
    await AsyncStorage.setItem(PLAY_QUEUE_KEY, JSON.stringify(current.slice(count)));
  } catch {
    // best-effort
  }
}

/**
 * Send queued plays to the server and drop the ones it accepted.
 *
 * Returns how many were flushed. Safe to call on a timer: a single in-flight
 * guard is the caller's job, and anything queued while the request is in
 * flight is newer than the slice being removed, so it stays behind.
 */
export async function flushQueuedPlays(
  send: (plays: QueuedPlay[]) => Promise<{ inserted: number }>,
  maxPerFlush = 2000,
): Promise<number> {
  const queued = await loadQueuedPlays();
  if (queued.length === 0) return 0;

  const batch = queued.slice(0, maxPerFlush);
  await send(batch);
  await removeOldestQueuedPlays(batch.length);
  return batch.length;
}

// ── Per-screen daily play counts (display only; server is source of truth) ──
function countsKey(screenId: number, dateKey: string) {
  return `adplay_counts_${screenId}_${dateKey}`;
}

export async function loadCounts(screenId: number, dateKey: string): Promise<Map<number, number>> {
  try {
    const raw = await AsyncStorage.getItem(countsKey(screenId, dateKey));
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, number>;
    return new Map(Object.entries(obj).map(([k, v]) => [parseInt(k, 10), v]));
  } catch {
    return new Map();
  }
}

export async function saveCounts(screenId: number, dateKey: string, map: Map<number, number>): Promise<void> {
  try {
    await AsyncStorage.setItem(countsKey(screenId, dateKey), JSON.stringify(Object.fromEntries(map)));
  } catch {
    // best-effort
  }
}
