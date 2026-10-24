/*
 * Broadcast hours, mirroring the server's lib/cycle.ts so the box and the
 * play-log check agree on exactly when a screen is on air.
 *
 * Worked out from UTC, not the box's own timezone setting — Android TV boxes
 * often ship set to UTC or somewhere else entirely.
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

export function minutesOfDay(hhmm: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function istMinutesOfDay(at: Date): number {
  return (at.getUTCHours() * 60 + at.getUTCMinutes() + IST_OFFSET_MINUTES) % (24 * 60);
}

/** On air from the start minute up to, but not including, the end minute. */
export function isWithinHours(start: string | null | undefined, end: string | null | undefined, at: Date): boolean {
  const s = minutesOfDay(start);
  const e = minutesOfDay(end);
  if (s === null || e === null || e <= s) return false;
  const now = istMinutesOfDay(at);
  return now >= s && now < e;
}
