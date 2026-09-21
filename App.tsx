import { useEffect, useState } from "react";
import { View, Text, StatusBar, StyleSheet, useWindowDimensions } from "react-native";
import * as Updates from "expo-updates";
import { setToken } from "./src/api";
import { loadAuth, clearAuth, loadOrientation, saveOrientation, type DisplayOrientation } from "./src/storage";
import { RotatedStage } from "./src/components/RotatedStage";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ScreenSelectScreen } from "./src/screens/ScreenSelectScreen";
import { PlayerScreen } from "./src/screens/PlayerScreen";
import type { AuthUser, Screen } from "./src/types";

type Stage =
  | { name: "loading" }
  | { name: "login" }
  | { name: "select"; user: AuthUser }
  | { name: "player"; user: AuthUser; screen: Screen };

// What's actually running on this device right now — lets anyone confirm
// whether an OTA update has landed just by looking at the screen, instead
// of guessing. "Embedded" means still on the original APK bundle, no OTA
// applied yet; otherwise shows when the currently-running update was
// published.
function buildStamp(): string {
  if (Updates.isEmbeddedLaunch || !Updates.createdAt) return "build: embedded (no OTA yet)";
  const d = Updates.createdAt;
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `build: ${stamp}`;
}

export default function App() {
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const win = useWindowDimensions();

  // Check for OTA update on launch and reload immediately if one is available.
  // isEnabled is false in dev/Expo Go — unlike isEmbeddedLaunch, it doesn't
  // flip permanently false the first time a device ever applies an update.
  useEffect(() => {
    if (!Updates.isEnabled) return;
    Updates.checkForUpdateAsync()
      .then(({ isAvailable }) => {
        if (!isAvailable) return;
        return Updates.fetchUpdateAsync().then(() => Updates.reloadAsync());
      })
      .catch(() => {}); // never block the app if update check fails
  }, []);

  // How the panel is physically mounted. Persisted per device — the carrier
  // sets it once after strapping the screen on.
  const [orientation, setOrientation] = useState<DisplayOrientation>("landscape");
  useEffect(() => {
    loadOrientation().then(setOrientation);
  }, []);

  const changeOrientation = (next: DisplayOrientation) => {
    setOrientation(next);
    saveOrientation(next);
  };

  // Resume a saved login on launch (survives power cuts) — skips straight
  // past the login screen, but always lands on select so the runner picks
  // their screen and hits Sync fresh each day, rather than silently
  // resuming whatever was playing last.
  useEffect(() => {
    loadAuth().then((auth) => {
      if (!auth || auth.user.role !== "runner") {
        setStage({ name: "login" });
        return;
      }
      setToken(auth.token);
      setStage({ name: "select", user: auth.user });
    });
  }, []);

  const logout = async () => {
    await clearAuth();
    setToken(null);
    setStage({ name: "login" });
  };

  return (
    <RotatedStage orientation={orientation}>
      <View style={styles.root}>
        <StatusBar hidden />
        {stage.name === "loading" && <View style={styles.root} />}
        {stage.name === "login" && (
          <LoginScreen onSuccess={(user) => setStage({ name: "select", user })} />
        )}
        {stage.name === "select" && (
          <ScreenSelectScreen
            user={stage.user}
            onSelect={(screen) => setStage({ name: "player", user: stage.user, screen })}
            onLogout={logout}
            orientation={orientation}
            onChangeOrientation={changeOrientation}
          />
        )}
        {stage.name === "player" && (
          <PlayerScreen
            screen={stage.screen}
            user={stage.user}
            onExit={() => setStage({ name: "select", user: stage.user })}
          />
        )}

        {/* Always-visible build stamp — confirms what's actually running,
            plus the orientation state so a rotation problem can be diagnosed
            off the screen itself rather than guessed at remotely. */}
        <Text style={styles.buildStamp} pointerEvents="none">
          {buildStamp()} · {orientation} · {Math.round(win.width)}x{Math.round(win.height)}
        </Text>
      </View>
    </RotatedStage>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  buildStamp: {
    position: "absolute",
    top: 4,
    left: 8,
    color: "rgba(255,255,255,0.35)",
    fontSize: 9,
    fontFamily: "monospace",
  },
});
