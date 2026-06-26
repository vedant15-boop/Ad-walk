import { useState } from "react";
import { Pressable, Text, StyleSheet, ViewStyle, StyleProp } from "react-native";

// Button that shows a clear focus ring when highlighted by a TV remote's
// D-pad (onFocus/onBlur fire on Android TV) and also works with touch.
// `hasTVPreferredFocus` makes the remote land here first on a fresh screen.
export function FocusButton({
  label,
  onPress,
  variant = "primary",
  preferred = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost";
  preferred?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      focusable={!disabled}
      hasTVPreferredFocus={preferred}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.base,
        variant === "primary" ? styles.primary : styles.ghost,
        focused && styles.focused,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, variant === "ghost" && styles.ghostLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  primary: { backgroundColor: "#f97316" },
  ghost: { backgroundColor: "rgba(255,255,255,0.08)" },
  focused: {
    borderColor: "#ffffff",
    transform: [{ scale: 1.04 }],
  },
  disabled: { opacity: 0.4 },
  label: { color: "#000", fontSize: 20, fontWeight: "800" },
  ghostLabel: { color: "#fff", fontWeight: "700" },
});
