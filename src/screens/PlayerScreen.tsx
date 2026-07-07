import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, BackHandler } from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import * as Location from "expo-location";
import {
  getSlots,
  recordPlay,
  recordPlaysBatch,
  syncScreen,
  startSession,
  heartbeat,
  endSession,
  reportLocation,
} from "../api";
import { saveCounts, loadCounts, saveSlots, loadSlots, queuePlay, loadQueuedPlays, removeOldestQueuedPlays } from "../storage";
import {
  SLOT_DURATION,
  TOTAL_SLOTS,
  HEARTBEAT_MS,
  SLOTS_REFRESH_MS,
  LOCATION_REPORT_MS,
} from "../config";
import { AdMedia } from "../components/AdMedia";
import { FocusButton } from "../components/FocusButton";
import type { Screen, Slot } from "../types";

function dateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PlayerScreen({ screen, onExit }: { screen: Screen; onExit: () => void }) {
  useKeepAwake(); // never let the TV sleep while broadcasting

  const [slots, setSlots] = useState<Slot[]>([]);
  const [currentSlotNum, setCurrentSlotNum] = useState(1);
  const [kicked, setKicked] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [todayCount, setTodayCount] = useState(0);

  // Refs so the single playback loop always reads fresh values.
  const slotsRef = useRef<Slot[]>([]);
  const currentSlotRef = useRef(1);
  const sessionTokenRef = useRef<string | null>(null);
  const countsRef = useRef<Map<number, number>>(new Map());
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const slotMap = new Map(slots.map((s) => [s.slotNumber, s]));
  const currentSlot = slotMap.get(currentSlotNum) ?? null;

  // ── Load persisted daily counts ─────────────────────────────────────────
  useEffect(() => {
    loadCounts(screen.id, dateKey()).then((m) => {
      countsRef.current = m;
      setTodayCount(Array.from(m.values()).reduce((a, b) => a + b, 0));
    });
  }, [screen.id]);

  // ── Seed slots from cache so playback works immediately if offline ────────
  useEffect(() => {
    loadSlots(screen.id).then((cached) => {
      if (cached && cached.length > 0 && slotsRef.current.length === 0) {
        slotsRef.current = cached as Slot[];
        setSlots(cached as Slot[]);
      }
    });
  }, [screen.id]);

  // ── Fetch + poll slots ──────────────────────────────────────────────────
  const refreshSlots = useCallback(async () => {
    try {
      const data = await getSlots(screen.id);
      slotsRef.current = data;
      setSlots(data);
      saveSlots(screen.id, data); // persist for offline fallback
    } catch {
      // keep last-known slots on a network hiccup so playback continues
    }
  }, [screen.id]);

  useEffect(() => {
    refreshSlots();
    const t = setInterval(refreshSlots, SLOTS_REFRESH_MS);
    return () => clearInterval(t);
  }, [refreshSlots]);

  // ── Session: start, heartbeat, clean exit ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    startSession(screen.id)
      .then(({ sessionToken }) => {
        if (!cancelled) sessionTokenRef.current = sessionToken;
      })
      .catch(() => {});

    const beat = setInterval(async () => {
      const token = sessionTokenRef.current;
      if (!token) return;
      try {
        const { valid } = await heartbeat(screen.id, token);
        if (!valid) setKicked(true);
      } catch {
        // network blip — keep playing
      }
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(beat);
      endSession().catch(() => {});
      sessionTokenRef.current = null;
    };
  }, [screen.id]);

  // ── GPS: watch position + periodic report ───────────────────────────────
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 60_000, distanceInterval: 25 },
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          coordsRef.current = c;
          setCoords(c);
        },
      );
    })();

    const report = setInterval(async () => {
      const c = coordsRef.current;
      if (!c) return;
      try {
        await reportLocation({ screenId: screen.id, lat: c.lat, lng: c.lng, recordedAt: new Date().toISOString() });
      } catch {
        // endpoint may not exist yet — harmless
      }
    }, LOCATION_REPORT_MS);

    return () => {
      sub?.remove();
      clearInterval(report);
    };
  }, [screen.id]);

  // ── Playback loop: advance every SLOT_DURATION, log the ad that played ───
  useEffect(() => {
    const startRef = { t: Date.now() };

    const tick = setInterval(() => {
      const elapsed = (Date.now() - startRef.t) / 1000;
      if (elapsed < SLOT_DURATION) return;

      const playing = slotsRef.current.find((s) => s.slotNumber === currentSlotRef.current) ?? null;
      if (playing) {
        // Count the play immediately regardless of whether the network send
        // succeeds — the ad genuinely played, so the on-screen count should
        // reflect that even through a long offline stretch, not just
        // server-confirmed plays.
        const next = new Map(countsRef.current);
        next.set(playing.adId, (next.get(playing.adId) ?? 0) + 1);
        countsRef.current = next;
        saveCounts(screen.id, dateKey(), next);
        setTodayCount(Array.from(next.values()).reduce((a, b) => a + b, 0));
        setSessionTotal((p) => p + 1);

        const playedAt = new Date(startRef.t).toISOString();
        recordPlay({
          screenId: screen.id,
          adId: playing.adId,
          slotNumber: playing.slotNumber,
          playedAt,
          durationSeconds: SLOT_DURATION,
        }).catch(() => {
          // Offline or request failed — queue it instead of losing it.
          // Flushed later via the manual Sync button.
          queuePlay({
            screenId: screen.id,
            adId: playing.adId,
            slotNumber: playing.slotNumber,
            playedAt,
            durationSeconds: SLOT_DURATION,
          });
        });
      }

      const nextSlot = (currentSlotRef.current % TOTAL_SLOTS) + 1;
      currentSlotRef.current = nextSlot;
      setCurrentSlotNum(nextSlot);
      startRef.t = Date.now();
    }, 250);

    return () => clearInterval(tick);
  }, [screen.id]);

  // ── Remote BACK button exits cleanly ────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onExit();
      return true;
    });
    return () => sub.remove();
  }, [onExit]);

  // ── Manual sync: flush queued offline plays + pull fresh ad assignments ──
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncMessage(null);

    let sentCount = 0;
    let playsFailed = false;
    try {
      const queued = await loadQueuedPlays();
      if (queued.length > 0) {
        const { inserted } = await recordPlaysBatch(queued);
        await removeOldestQueuedPlays(queued.length);
        sentCount = inserted;
      }
    } catch {
      playsFailed = true;
    }

    let refreshedCount = 0;
    let refreshFailed = false;
    try {
      await syncScreen(screen.id);
      const freshSlots = await getSlots(screen.id);
      slotsRef.current = freshSlots;
      setSlots(freshSlots);
      saveSlots(screen.id, freshSlots);
      refreshedCount = freshSlots.length;
    } catch {
      refreshFailed = true;
    }

    if (playsFailed && refreshFailed) {
      setSyncMessage("Sync failed — check internet");
    } else if (playsFailed) {
      setSyncMessage(`Ads refreshed (${refreshedCount}) — sending queued plays failed`);
    } else if (refreshFailed) {
      setSyncMessage(`${sentCount} play${sentCount === 1 ? "" : "s"} sent — ad refresh failed`);
    } else {
      setSyncMessage(`Synced — ${sentCount} play${sentCount === 1 ? "" : "s"} sent, ${refreshedCount} ad${refreshedCount === 1 ? "" : "s"} refreshed`);
    }

    setIsSyncing(false);
    setTimeout(() => setSyncMessage(null), 6000);
  }, [screen.id, isSyncing]);

  if (kicked) {
    return (
      <View style={styles.kicked}>
        <Text style={styles.kickedTitle}>Session Ended</Text>
        <Text style={styles.kickedBody}>This screen was opened on another device. Only one active session is allowed per runner.</Text>
        <FocusButton label="Back to screens" onPress={onExit} preferred style={styles.kickedBtn} />
      </View>
    );
  }

  const hasAd = !!currentSlot;

  return (
    <View style={styles.root}>
      {/* Ad / filler — fills the whole panel, fit to any resolution */}
      {hasAd ? (
        <AdMedia url={currentSlot!.adMediaUrl} mediaType={currentSlot!.adMediaType} />
      ) : (
        <View style={styles.filler}>
          <Text style={styles.fillerBrand}>AdWalk</Text>
          <Text style={styles.fillerSub}>MOVING ADVERTISING NETWORK</Text>
        </View>
      )}

      {/* Status strip — floats directly over the ad, no background box */}
      <View style={styles.statusBar} pointerEvents="none">
        <Text style={styles.statusText} numberOfLines={1}>
          {screen.name} · {screen.serialNumber}
        </Text>
        <Text style={styles.statusText}>
          Slot {currentSlotNum}/{TOTAL_SLOTS} · {hasAd ? "LIVE" : "FILLER"} · {todayCount} today
          {coords ? `  ·  ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : ""}
        </Text>
      </View>

      {/* Manual sync — flushes queued offline plays + pulls fresh ads */}
      <View style={styles.syncArea}>
        <FocusButton
          label={isSyncing ? "Syncing…" : "Sync"}
          variant="primary"
          onPress={handleSync}
          disabled={isSyncing}
          preferred
          style={styles.syncBtn}
        />
        {syncMessage && (
          <Text style={styles.syncMessage} numberOfLines={2}>{syncMessage}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  filler: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "#f97316" },
  fillerBrand: { color: "#000", fontSize: 80, fontWeight: "900", letterSpacing: -2 },
  fillerSub: { color: "rgba(0,0,0,0.5)", fontSize: 14, letterSpacing: 6, marginTop: 8, fontWeight: "700" },
  kicked: { flex: 1, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center", padding: 40, gap: 16 },
  kickedTitle: { color: "#fff", fontSize: 32, fontWeight: "900" },
  kickedBody: { color: "rgba(255,255,255,0.85)", fontSize: 16, textAlign: "center", maxWidth: 420 },
  kickedBtn: { marginTop: 12, width: 240 },
  statusBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusText: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "monospace" },
  syncArea: {
    position: "absolute",
    top: 12,
    right: 12,
    alignItems: "flex-end",
    gap: 6,
  },
  syncBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    minWidth: 0,
  },
  syncMessage: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontFamily: "monospace",
    textAlign: "right",
    maxWidth: 220,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
});
