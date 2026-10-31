import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, BackHandler } from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import * as Location from "expo-location";
import { Image } from "expo-image";
import {
  getSlots,
  getPlaybackConfig,
  recordPlay,
  recordPlaysBatch,
  startSession,
  heartbeat,
  endSession,
} from "../api";
import { saveCounts, loadCounts, saveSlots, loadSlots, queuePlay, flushQueuedPlays, savePlaybackConfig, loadPlaybackConfig } from "../storage";
import {
  DEFAULT_SLOT_DURATION,
  DEFAULT_TOTAL_SLOTS,
  HEARTBEAT_MS,
  SLOTS_REFRESH_MS,
  SHOW_QR_PANEL,
  PLAY_QUEUE_FLUSH_MS,
  DEMO_JUMP_ALLOWLIST_IDS,
  DEMO_FAST_SLOT_SECONDS,
  DEMO_FAST_SLOT_ALLOWLIST_IDS,
  mediaUri,
  isVideo,
} from "../config";
import { AdMedia } from "../components/AdMedia";
import { isWithinHours, minutesOfDay } from "../screenHours";
import { FocusButton } from "../components/FocusButton";
import { CustomerQrPanel } from "../components/CustomerQrPanel";
import { DemoSlotJumpControl } from "../components/DemoSlotJumpControl";
import type { AuthUser, Screen, Slot, PlaybackConfig } from "../types";

function dateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PlayerScreen({ screen, user, onExit }: { screen: Screen; user: AuthUser; onExit: () => void }) {
  useKeepAwake(); // never let the TV sleep while broadcasting

  const canJumpSlots = DEMO_JUMP_ALLOWLIST_IDS.includes(user.id);
  const isDemoFast = DEMO_FAST_SLOT_ALLOWLIST_IDS.includes(user.id);

  // ── Rotation shape, set by the admin ────────────────────────────────────
  // Held in refs as well as state: the playback interval is created once and
  // reads these on every tick, so a change made in the admin panel takes
  // effect at the next slot boundary without restarting the loop.
  const [playback, setPlayback] = useState<PlaybackConfig>({
    adDurationSeconds: screen.adDurationSeconds ?? DEFAULT_SLOT_DURATION,
    slotsPerCycle: screen.totalSlots || DEFAULT_TOTAL_SLOTS,
    activeStartTime: screen.activeStartTime,
    activeEndTime: screen.activeEndTime,
  });
  const slotDurationRef = useRef(isDemoFast ? DEMO_FAST_SLOT_SECONDS : (screen.adDurationSeconds ?? DEFAULT_SLOT_DURATION));
  const totalSlotsRef = useRef(screen.totalSlots || DEFAULT_TOTAL_SLOTS);
  // Broadcast hours. Unknown only if the server predates them, in which case
  // the box airs all day as it always did.
  const hoursRef = useRef<{ start?: string; end?: string }>({ start: screen.activeStartTime, end: screen.activeEndTime });
  const applyPlayback = useCallback((config: PlaybackConfig) => {
    // Reject anything malformed rather than break the rotation; the server
    // also rejects plays longer than 120 s, so don't play one.
    const d = config?.adDurationSeconds;
    const n = config?.slotsPerCycle;
    if (!Number.isInteger(d) || !Number.isInteger(n) || d < 1 || d > 120 || n < 1) return;
    slotDurationRef.current = isDemoFast ? DEMO_FAST_SLOT_SECONDS : d;
    totalSlotsRef.current = n;
    const start = minutesOfDay(config.activeStartTime) !== null ? config.activeStartTime : hoursRef.current.start;
    const end = minutesOfDay(config.activeEndTime) !== null ? config.activeEndTime : hoursRef.current.end;
    hoursRef.current = { start, end };
    setPlayback({
      adDurationSeconds: d,
      slotsPerCycle: n,
      activeStartTime: start,
      activeEndTime: end,
      fillerMediaUrl: config.fillerMediaUrl ?? null,
      fillerMediaType: config.fillerMediaType ?? null,
    });
    // Keep the filler image on disk for off-air hours without signal. A filler
    // video caches as it plays, like ad videos.
    const filler = mediaUri(config.fillerMediaUrl);
    if (filler && !isVideo(config.fillerMediaType, config.fillerMediaUrl)) {
      Image.prefetch(filler, "disk").catch(() => {});
    }
  }, [isDemoFast]);

  useEffect(() => {
    loadPlaybackConfig(screen.id).then((cached) => { if (cached) applyPlayback(cached); });
  }, [applyPlayback, screen.id]);

  // On air only inside the screen's hours. Evaluated on every tick of the
  // playback loop below; this state just drives what's drawn.
  const [onAir, setOnAir] = useState(true);
  const onAirRef = useRef(true);
  const isOnAir = useCallback((at: Date) => {
    const { start, end } = hoursRef.current;
    if (start === undefined && end === undefined) return true;
    return isWithinHours(start, end, at);
  }, []);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [currentSlotNum, setCurrentSlotNum] = useState(1);
  const [kicked, setKicked] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);

  // Refs so the single playback loop always reads fresh values.
  const slotsRef = useRef<Slot[]>([]);
  const currentSlotRef = useRef(1);
  const sessionTokenRef = useRef<string | null>(null);
  const countsRef = useRef<Map<number, number>>(new Map());
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const slotStartRef = useRef(Date.now());

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

  // ── Put every image in the rotation on disk up front ────────────────────
  //
  // Without this an image is only cached once it has actually been shown, so a
  // freshly installed box needed a full 30-slot loop (~6 min) online before it
  // could survive losing signal — and any slot it hadn't reached yet went blank.
  // Prefetching downloads the whole rotation the moment the slot list arrives.
  //
  // Disk only, deliberately: "memory-disk" would decode every image into a
  // bitmap at once, and a single 4K PNG is ~33 MB decoded — enough to push a
  // low-RAM TV box over. Display still uses memory-disk and reads from disk.
  //
  // Videos aren't prefetched here; expo-video has no prefetch API. They cache
  // as they play (useCaching in AdMedia), so they need one pass online.
  const cachedUrlsRef = useRef(new Set<string>());
  const inFlightUrlsRef = useRef(new Set<string>());
  const prefetchImages = useCallback((list: Slot[]) => {
    for (const s of list) {
      if (!s.adMediaUrl || isVideo(s.adMediaType, s.adMediaUrl)) continue;
      const uri = mediaUri(s.adMediaUrl);
      if (!uri || cachedUrlsRef.current.has(uri) || inFlightUrlsRef.current.has(uri)) continue;
      inFlightUrlsRef.current.add(uri);
      // One call per URL: a batched prefetch resolves false if any single image
      // fails, without saying which — so a partial failure would either mark
      // everything done or nothing. Per-URL, a failure simply retries next poll.
      Image.prefetch(uri, "disk")
        .then((ok) => { if (ok) cachedUrlsRef.current.add(uri); })
        .catch(() => {})
        .finally(() => { inFlightUrlsRef.current.delete(uri); });
    }
  }, []);

  // ── Fetch + poll slots ──────────────────────────────────────────────────
  const refreshSlots = useCallback(async () => {
    // Separate try: an older server without /playback-config must not stop
    // the slot list from refreshing.
    try {
      const config = await getPlaybackConfig(screen.id);
      applyPlayback(config);
      savePlaybackConfig(screen.id, config);
    } catch {
      // keep the cached or default rotation
    }
    try {
      const data = await getSlots(screen.id);
      slotsRef.current = data;
      setSlots(data);
      saveSlots(screen.id, data); // persist for offline fallback
      prefetchImages(data);
    } catch {
      // keep last-known slots on a network hiccup so playback continues
    }
  }, [screen.id, prefetchImages, applyPlayback]);

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
        const { valid } = await heartbeat(screen.id, token, {
          slotNumber: currentSlotRef.current,
          slotStartedAt: new Date(slotStartRef.current).toISOString(),
          onAir: onAirRef.current,
          slotsPerCycle: totalSlotsRef.current,
          adDurationSeconds: slotDurationRef.current,
        });
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

  // ── GPS: watch position for the on-screen readout ───────────────────────
  //
  // Coordinates are shown in the status strip and QR panel only. There is no
  // server-side location endpoint, so nothing is reported upstream; the old
  // periodic POST here targeted a route that never existed and silently 404'd
  // on every call.
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

    return () => {
      sub?.remove();
    };
  }, [screen.id]);

  // ── Playback loop: advance every slot duration, log the ad that played ──
  useEffect(() => {
    slotStartRef.current = Date.now();

    let wasOnAir = true;
    const tick = setInterval(() => {
      // Outside broadcast hours nothing rotates and nothing is logged. A slot
      // cut short by the end of the window isn't counted — it didn't finish.
      const live = isOnAir(new Date());
      if (live !== wasOnAir) setOnAir(live);
      onAirRef.current = live;
      if (!live) {
        wasOnAir = false;
        slotStartRef.current = Date.now();
        setProgressPercent(0);
        return;
      }
      if (!wasOnAir) {
        // Back on air: start a fresh cycle rather than resuming mid-rotation.
        wasOnAir = true;
        currentSlotRef.current = 1;
        setCurrentSlotNum(1);
        slotStartRef.current = Date.now();
      }

      const elapsed = (Date.now() - slotStartRef.current) / 1000;
      const slotDuration = slotDurationRef.current;
      setProgressPercent(Math.min(100, (elapsed / slotDuration) * 100));
      if (elapsed < slotDuration) return;

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

        const playedAt = new Date(slotStartRef.current).toISOString();
        recordPlay({
          screenId: screen.id,
          adId: playing.adId,
          slotNumber: playing.slotNumber,
          playedAt,
          durationSeconds: slotDuration,
        }).catch(() => {
          // Offline or request failed — queue it instead of losing it.
          // Flushed later via the manual Sync button.
          queuePlay({
            screenId: screen.id,
            adId: playing.adId,
            slotNumber: playing.slotNumber,
            playedAt,
            durationSeconds: slotDuration,
          });
        });
      }

      // Explicit wrap, not %: if the admin shrinks the cycle while this box is
      // past the new last slot, % would land somewhere arbitrary.
      const nextSlot = currentSlotRef.current >= totalSlotsRef.current ? 1 : currentSlotRef.current + 1;
      currentSlotRef.current = nextSlot;
      setCurrentSlotNum(nextSlot);
      // The next slot starts when this one was due to end, not when the tick
      // noticed: otherwise each slot runs up to 250 ms long, and the screen
      // preview, which counts slots forward from the last report, falls
      // further behind the longer a box is offline. If the loop stalled for a
      // whole slot (app suspended), restart the clock rather than racing
      // through the missed slots.
      const due = slotStartRef.current + slotDuration * 1000;
      slotStartRef.current = Date.now() - due < slotDuration * 1000 ? due : Date.now();
      setProgressPercent(0);
    }, 250);

    return () => clearInterval(tick);
  }, [screen.id]);

  // ── Flush the offline play backlog while broadcasting ───────────────────
  useEffect(() => {
    let inFlight = false;

    const flush = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const sent = await flushQueuedPlays(recordPlaysBatch);
        if (sent > 0) console.log(`[adwalk] flushed ${sent} queued play(s)`);
      } catch {
        // Still offline — the queue keeps them for the next attempt.
      } finally {
        inFlight = false;
      }
    };

    flush();
    const t = setInterval(flush, PLAY_QUEUE_FLUSH_MS);
    return () => clearInterval(t);
  }, []);

  // ── Demo-only: jump straight to a slot (see DEMO_JUMP_ALLOWLIST_IDS) ────
  // No play is logged for the slot jumped away from — it didn't complete
  // its full dwell, so logging a normal-duration play for it would be a
  // false billing record. The slot jumped into logs normally once the tick
  // above naturally reaches the slot duration from the reset clock.
  const jumpToSlot = useCallback((target: number) => {
    currentSlotRef.current = target;
    setCurrentSlotNum(target);
    slotStartRef.current = Date.now();
    setProgressPercent(0);
  }, []);

  // ── Remote BACK button exits cleanly ────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onExit();
      return true;
    });
    return () => sub.remove();
  }, [onExit]);

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
      {/* Ad / filler — fills the available panel above the progress strip, fit to any resolution */}
      <View style={styles.adArea}>
        {!onAir && playback.fillerMediaUrl ? (
          <AdMedia url={playback.fillerMediaUrl} mediaType={playback.fillerMediaType ?? null} />
        ) : !onAir ? (
          <View style={styles.filler}>
            <Text style={styles.offAirLabel}>OFF AIR</Text>
            <Text style={styles.fillerBrand}>AdWalk</Text>
            <Text style={styles.fillerSub}>
              ADS RUN {playback.activeStartTime}–{playback.activeEndTime} IST
            </Text>
          </View>
        ) : hasAd ? (
          <AdMedia url={currentSlot!.adMediaUrl} mediaType={currentSlot!.adMediaType} />
        ) : (
          <View style={styles.filler}>
            <Text style={styles.fillerBrand}>AdWalk</Text>
            <Text style={styles.fillerSub}>MOVING ADVERTISING NETWORK</Text>
          </View>
        )}

        {SHOW_QR_PANEL && onAir && hasAd && currentSlot!.customerId != null && (
          <CustomerQrPanel
            customerId={currentSlot!.customerId}
            screenId={screen.id}
            businessName={currentSlot!.customerBusinessName}
            coords={coords}
          />
        )}

        {canJumpSlots && (
          <DemoSlotJumpControl currentSlotNum={currentSlotNum} totalSlots={playback.slotsPerCycle} onJump={jumpToSlot} />
        )}
      </View>

      {/* Slot progress — reserved strip, never overlaps the ad above it */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
      </View>

      {/* Status strip — floats directly over the ad, no background box */}
      <View style={styles.statusBar} pointerEvents="none">
        <Text style={styles.statusText} numberOfLines={1}>
          {screen.name} · {screen.serialNumber}
        </Text>
        <Text style={styles.statusText}>
          Slot {currentSlotNum}/{playback.slotsPerCycle} · {hasAd ? "LIVE" : "FILLER"} · {sessionTotal} this session · {todayCount} today
          {coords ? `  ·  ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : ""}
        </Text>
      </View>
    </View>
  );
}

const PROGRESS_BAR_HEIGHT = 4;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  adArea: { flex: 1 },
  filler: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f97316" },
  fillerBrand: { color: "#000", fontSize: 80, fontWeight: "900", letterSpacing: -2 },
  fillerSub: { color: "rgba(0,0,0,0.5)", fontSize: 14, letterSpacing: 6, marginTop: 8, fontWeight: "700" },
  offAirLabel: { color: "rgba(0,0,0,0.45)", fontSize: 16, letterSpacing: 8, marginBottom: 8, fontWeight: "800" },
  kicked: { flex: 1, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center", padding: 40, gap: 16 },
  kickedTitle: { color: "#fff", fontSize: 32, fontWeight: "900" },
  kickedBody: { color: "rgba(255,255,255,0.85)", fontSize: 16, textAlign: "center", maxWidth: 420 },
  kickedBtn: { marginTop: 12, width: 240 },
  progressTrack: {
    height: PROGRESS_BAR_HEIGHT,
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  statusBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: PROGRESS_BAR_HEIGHT,
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusText: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "monospace" },
});
