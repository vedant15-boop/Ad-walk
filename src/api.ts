import { API_URL } from "./config";
import type { AuthUser, Screen, Slot } from "./types";

// Single auth token held in memory for the session; persisted separately.
let authToken: string | null = null;
export function setToken(token: string | null) {
  authToken = token;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(opts.headers ?? {}),
    },
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // non-JSON error body — keep generic message
    }
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Auth ────────────────────────────────────────────────────────────────
export async function login(identifier: string, password: string): Promise<{ token: string; user: AuthUser }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

// ── Screens & slots ───────────────────────────────────────────────────────
export async function getMyScreens(runnerId: number): Promise<Screen[]> {
  return request(`/screens?runnerId=${runnerId}`);
}

export async function getSlots(screenId: number): Promise<Slot[]> {
  return request(`/slots?screenId=${screenId}`);
}

// ── Play logging ──────────────────────────────────────────────────────────
export async function recordPlay(payload: {
  screenId: number;
  adId: number;
  slotNumber: number;
  playedAt: string;
  durationSeconds: number;
}): Promise<void> {
  await request("/play-logs", { method: "POST", body: JSON.stringify(payload) });
}

// ── Single-session enforcement (mirrors the web player) ────────────────────
export async function startSession(screenId: number): Promise<{ sessionToken: string }> {
  return request("/runner-sessions/start", {
    method: "POST",
    body: JSON.stringify({ screenId }),
  });
}

export async function heartbeat(screenId: number, sessionToken: string): Promise<{ valid: boolean }> {
  return request("/runner-sessions/heartbeat", {
    method: "POST",
    body: JSON.stringify({ screenId, sessionToken }),
  });
}

export async function endSession(): Promise<void> {
  await request("/runner-sessions", { method: "DELETE" });
}

// ── GPS reporting (best-effort) ────────────────────────────────────────────
// Backend endpoint POST /api/runner/location is not implemented yet; this is
// wrapped by the caller in try/catch so a 404 is harmless. When the endpoint
// is added server-side, location reporting starts working with no app change.
export async function reportLocation(payload: {
  screenId: number;
  lat: number;
  lng: number;
  recordedAt: string;
}): Promise<void> {
  await request("/runner/location", { method: "POST", body: JSON.stringify(payload) });
}

export { ApiError };
