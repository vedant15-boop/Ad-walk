import { useState } from "react";
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import { login, setToken } from "../api";
import { saveAuth } from "../storage";
import { FocusButton } from "../components/FocusButton";
import type { AuthUser } from "../types";

export function LoginScreen({ onSuccess }: { onSuccess: (user: AuthUser) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idFocus, setIdFocus] = useState(false);
  const [pwFocus, setPwFocus] = useState(false);

  const submit = async () => {
    if (!identifier.trim() || !password.trim()) {
      setError("Enter username and password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await login(identifier.trim(), password);
      if (user.role !== "runner") {
        setError("This app is for runner accounts only.");
        setBusy(false);
        return;
      }
      setToken(token);
      await saveAuth(token, user);
      onSuccess(user);
    } catch (e: any) {
      setError(e?.message || "Login failed");
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.brand}>AdWalk</Text>
        <Text style={styles.subtitle}>Runner Broadcast</Text>

        <Text style={styles.fieldLabel}>Username</Text>
        <TextInput
          style={[styles.input, idFocus && styles.inputFocused]}
          value={identifier}
          onChangeText={setIdentifier}
          onFocus={() => setIdFocus(true)}
          onBlur={() => setIdFocus(false)}
          placeholder="username or mobile"
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.fieldLabel}>Password</Text>
        <TextInput
          style={[styles.input, pwFocus && styles.inputFocused]}
          value={password}
          onChangeText={setPassword}
          onFocus={() => setPwFocus(true)}
          onBlur={() => setPwFocus(false)}
          placeholder="••••••••"
          placeholderTextColor="#666"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={submit}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          {busy ? (
            <ActivityIndicator size="large" color="#f97316" />
          ) : (
            <FocusButton label="Start" onPress={submit} preferred style={styles.button} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 460, backgroundColor: "#161616", borderRadius: 20, padding: 32, borderWidth: 1, borderColor: "#262626" },
  brand: { color: "#f97316", fontSize: 40, fontWeight: "900", textAlign: "center" },
  subtitle: { color: "#888", fontSize: 15, textAlign: "center", marginTop: 2, marginBottom: 28, textTransform: "uppercase", letterSpacing: 2 },
  fieldLabel: { color: "#aaa", fontSize: 13, marginBottom: 6, marginTop: 14, textTransform: "uppercase", letterSpacing: 1 },
  input: {
    backgroundColor: "#0a0a0a",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#333",
    color: "#fff",
    fontSize: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  inputFocused: { borderColor: "#f97316" },
  error: { color: "#f87171", marginTop: 16, fontSize: 14, textAlign: "center" },
  actions: { marginTop: 28, minHeight: 56, justifyContent: "center" },
  button: { width: "100%" },
});
