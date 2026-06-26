import { useEffect, useState } from "react";
import { View, StatusBar, StyleSheet } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { setToken } from "./src/api";
import { loadAuth, clearAuth } from "./src/storage";
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

  // Lock landscape — TVs are landscape and ads are authored for it.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);

  // Resume a saved session on launch (survives power cuts).
  useEffect(() => {
    loadAuth().then((auth) => {
      if (auth && auth.user.role === "runner") {
        setToken(auth.token);
        setStage({ name: "select", user: auth.user });
      } else {
        setStage({ name: "login" });
      }
    });
  }, []);

  const logout = async () => {
    await clearAuth();
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
          onSelect={(screen) => setStage({ name: "player", user: stage.user, screen })}
          onLogout={logout}
        />
      )}
      {stage.name === "player" && (
        <PlayerScreen
          screen={stage.screen}
          onExit={() => setStage({ name: "select", user: stage.user })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
});
