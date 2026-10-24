// Shapes mirrored from the AdWalk backend responses the runner needs.

export interface AuthUser {
  id: number;
  name: string;
  email?: string;
  mobile?: string;
  role: string;
  stateName?: string | null;
  cityName?: string | null;
}

export interface Screen {
  id: number;
  name: string;
  serialNumber: string;
  usedSlots: number;
  totalSlots: number;
  lastSyncAt?: string | null;
  activeStartTime?: string;
  activeEndTime?: string;
  adDurationSeconds?: number;
}

export interface Slot {
  id: number;
  screenId: number;
  slotNumber: number;
  adId: number;
  adTitle: string | null;
  adMediaUrl: string | null;
  adMediaType: string | null;
  customerId: number | null;
  customerBusinessName: string | null;
  customerCity: string | null;
  customerState: string | null;
}

/** How the rotation is divided. Set by the admin; slots × duration = cycle. */
export interface PlaybackConfig {
  adDurationSeconds: number;
  slotsPerCycle: number;
  /** Broadcast hours, "HH:MM" India time. Absent from servers that predate them. */
  activeStartTime?: string;
  activeEndTime?: string;
}
