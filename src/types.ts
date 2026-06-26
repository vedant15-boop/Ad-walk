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
