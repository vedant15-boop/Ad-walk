import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { getMyScreens, recordPlaysBatch, syncScreen } from "../api";
import { saveScreens, loadScreens, loadQueuedPlays, removeOldestQueuedPlays } from "../storage";
import { FocusButton } from "../components/FocusButton";
import type { AuthUser, Screen } from "../types";

export function ScreenSelectScreen({
  user,
  onSelect,
  onLogout,
}: {
  user: AuthUser;
  onSelect: (screen: Screen) => void;
  onLogout: () => void;
}) {
  const [screens, setScreens] = useState<Screen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setScreens(null);
    setIsOffline(false);
    try {
      const fresh = await getMyScreens(user.id);
      setScreens(fresh);
      saveScreens(fresh);
    } catch (e: any) {
      const cached = await loadScreens();
      if (cached && cached.length > 0) {
        setScreens(cached);
        setIsOffline(true);
      } else {
        setError(e?.message || "Could not load screens");
      }
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Daily ritual: flush any plays queued while offline, then refresh the
  // screen list and mark every assigned screen as synced. Safe to press with
  // no internet at all — the batch send and refresh just fail silently and
  // nothing local is lost, since the queue only clears on confirmed receipt.
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
      const fresh = await getMyScreens(user.id);
      setScreens(fresh);
      saveScreens(fresh);
      setIsOffline(false);
      await Promise.all(fresh.map((s) => syncScreen(s.id).catch(() => {})));
      refreshedCount = fresh.length;
    } catch {
      refreshFailed = true;
    }

    if (playsFailed && refreshFailed) {
      setSyncMessage("Sync failed — check internet");
    } else if (playsFailed) {
      setSyncMessage(`Screens refreshed (${refreshedCount}) — sending queued plays failed`);
    } else if (refreshFailed) {
      setSyncMessage(`${sentCount} play${sentCount === 1 ? "" : "s"} sent — screen refresh failed`);
    } else {
      setSyncMessage(`Synced — ${sentCount} play${sentCount === 1 ? "" : "s"} sent, ${refreshedCount} screen${refreshedCount === 1 ? "" : "s"} refreshed`);
    }

    setIsSyncing(false);
    setTimeout(() => setSyncMessage(null), 6000);
  }, [isSyncing, user.id]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Select Screen</Text>
      <Text style={styles.greeting}>Signed in as {user.name}</Text>
      {isOffline && (
        <Text style={styles.offlineNotice}>Offline — showing last-known screens</Text>
      )}

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

      {screens === null && !error && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      )}

      {error && (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <FocusButton label="Retry" onPress={load} preferred style={styles.retry} />
        </View>
      )}

      {screens && screens.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>No screens assigned to you.</Text>
          <Text style={styles.emptySub}>Contact your ad getter for an assignment.</Text>
        </View>
      )}

      {screens && screens.length > 0 && (
        <ScrollView contentContainerStyle={styles.list}>
          {screens.map((s) => (
            <FocusButton
              key={s.id}
              label={`${s.name}   ·   ${s.serialNumber}   ·   ${s.usedSlots} ad${s.usedSlots === 1 ? "" : "s"}`}
              onPress={() => onSelect(s)}
              disabled={s.usedSlots === 0}
              style={styles.screenBtn}
            />
          ))}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <FocusButton label="Log out" variant="ghost" onPress={onLogout} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a0a", padding: 40 },
  title: { color: "#fff", fontSize: 34, fontWeight: "900" },
  greeting: { color: "#888", fontSize: 15, marginTop: 4, marginBottom: 4 },
  offlineNotice: { color: "#f97316", fontSize: 12, fontWeight: "700", marginBottom: 12 },
  syncArea: { alignItems: "flex-start", gap: 6, marginBottom: 28 },
  syncBtn: { paddingVertical: 10, paddingHorizontal: 20, minWidth: 160 },
  syncMessage: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "monospace" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  list: { gap: 16, paddingBottom: 20 },
  screenBtn: { width: "100%", alignItems: "flex-start" },
  error: { color: "#f87171", fontSize: 16 },
  retry: { width: 200 },
  empty: { color: "#fff", fontSize: 20, fontWeight: "700" },
  emptySub: { color: "#888", fontSize: 14 },
  footer: { marginTop: 16, alignItems: "center" },
});
