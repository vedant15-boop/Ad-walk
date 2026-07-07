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

// ── Last actively-broadcasting screen (so a reboot resumes straight into the
// player, without needing screen-select's network call, if one was already
// running) ───────────────────────────────────────────────────────────────
const LAST_SCREEN_KEY = "adwalk_last_screen";

export async function saveLastScreen(screen: Screen): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SCREEN_KEY, JSON.stringify(screen));
  } catch {
    // best-effort
  }
}

export async function loadLastScreen(): Promise<Screen | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SCREEN_KEY);
    return raw ? (JSON.parse(raw) as Screen) : null;
  } catch {
    return null;
  }
}

export async function clearLastScreen(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_SCREEN_KEY);
  } catch {
    // best-effort
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

export async function queuePlay(play: QueuedPlay): Promise<void> {
  try {
    const existing = await loadQueuedPlays();
    await AsyncStorage.setItem(PLAY_QUEUE_KEY, JSON.stringify([...existing, play]));
  } catch {
    // best-effort — if this fails there's nothing more we can do locally
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
