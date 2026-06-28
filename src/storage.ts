import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthUser } from "./types";

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
