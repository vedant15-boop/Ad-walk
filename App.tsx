import { useEffect, useState } from "react";
import { View, StatusBar, StyleSheet } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Updates from "expo-updates";
import { setToken } from "./src/api";
import { loadAuth, clearAuth, loadLastScreen, saveLastScreen, clearLastScreen } from "./src/storage";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ScreenSelectScreen } from "./src/screens/ScreenSelectScreen";
import { PlayerScreen } from "./src/screens/PlayerScreen";
import type { AuthUser, Screen } from "./src/types";

type Stage =
  | { name: "loading" }
  | { name: "login" }
  | { name: "select"; user: AuthUser }
  | { name: "player"; user: AuthUser; screen: Screen };

export default function App() {
  const [stage, setStage] = useState<Stage>({ name: "loading" });

  // Check for OTA update on launch and reload immediately if one is available.
  useEffect(() => {
    if (!Updates.isEmbeddedLaunch) return; // skip in dev/Expo Go
    Updates.checkForUpdateAsync()
      .then(({ isAvailable }) => {
        if (!isAvailable) return;
        return Updates.fetchUpdateAsync().then(() => Updates.reloadAsync());
      })
      .catch(() => {}); // never block the app if update check fails
  }, []);

  // Lock landscape — TVs are landscape and ads are authored for it.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);

  // Resume a saved session on launch (survives power cuts). If a screen was
  // actively broadcasting before, skip straight into the player with it —
  // no network call needed, so a cold boot with zero internet still starts
  // playing ads immediately from whatever was last cached.
  useEffect(() => {
    loadAuth().then(async (auth) => {
      if (!auth || auth.user.role !== "runner") {
        setStage({ name: "login" });
        return;
      }
      setToken(auth.token);
      const lastScreen = await loadLastScreen();
      if (lastScreen) {
        setStage({ name: "player", user: auth.user, screen: lastScreen });
      } else {
        setStage({ name: "select", user: auth.user });
      }
    });
  }, []);

  const logout = async () => {
    await clearAuth();
    await clearLastScreen();
    setToken(null);
    setStage({ name: "login" });
  };

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {stage.name === "loading" && <View style={styles.root} />}
      {stage.name === "login" && (
        <LoginScreen onSuccess={(user) => setStage({ name: "select", user })} />
      )}
      {stage.name === "select" && (
        <ScreenSelectScreen
          user={stage.user}
          onSelect={(screen) => {
            saveLastScreen(screen);
            setStage({ name: "player", user: stage.user, screen });
          }}
          onLogout={logout}
        />
      )}
      {stage.name === "player" && (
        <PlayerScreen
          screen={stage.screen}
          onExit={() => {
            clearLastScreen();
            setStage({ name: "select", user: stage.user });
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
});
