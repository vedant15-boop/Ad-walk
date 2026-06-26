import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { getMyScreens } from "../api";
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

  const load = async () => {
    setError(null);
    setScreens(null);
    try {
      setScreens(await getMyScreens(user.id));
    } catch (e: any) {
      setError(e?.message || "Could not load screens");
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Select Screen</Text>
      <Text style={styles.greeting}>Signed in as {user.name}</Text>

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
          {screens.map((s, i) => (
            <FocusButton
              key={s.id}
              label={`${s.name}   ·   ${s.serialNumber}   ·   ${s.usedSlots} ad${s.usedSlots === 1 ? "" : "s"}`}
              onPress={() => onSelect(s)}
              preferred={i === 0}
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
  greeting: { color: "#888", fontSize: 15, marginTop: 4, marginBottom: 28 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  list: { gap: 16, paddingBottom: 20 },
  screenBtn: { width: "100%", alignItems: "flex-start" },
  error: { color: "#f87171", fontSize: 16 },
  retry: { width: 200 },
  empty: { color: "#fff", fontSize: 20, fontWeight: "700" },
  emptySub: { color: "#888", fontSize: 14 },
  footer: { marginTop: 16, alignItems: "center" },
});
