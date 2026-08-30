import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { FocusButton } from "./FocusButton";
import { TOTAL_SLOTS } from "../config";

// Demo-only: lets an allowlisted runner (see DEMO_JUMP_ALLOWLIST_IDS in
// config.ts) jump PlayerScreen straight to a chosen slot instead of waiting
// through the full rotation. Collapsed by default so it stays out of the
// way for the rest of a demo.
export function DemoSlotJumpControl({
  currentSlotNum,
  onJump,
}: {
  currentSlotNum: number;
  onJump: (target: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(1);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <FocusButton
        label={expanded ? "Close" : "Demo Jump"}
        variant="ghost"
        style={styles.trigger}
        onPress={() => {
          if (expanded) {
            setExpanded(false);
          } else {
            setPending(currentSlotNum);
            setExpanded(true);
          }
        }}
      />

      {expanded && (
        <View style={styles.card}>
          <Text style={styles.label} numberOfLines={1}>
            Jump to slot {pending}/{TOTAL_SLOTS}
          </Text>
          <View style={styles.row}>
            <FocusButton
              label="−"
              variant="ghost"
              style={styles.stepBtn}
              onPress={() => setPending((p) => Math.max(1, p - 1))}
            />
            <FocusButton
              label="+"
              variant="ghost"
              style={styles.stepBtn}
              onPress={() => setPending((p) => Math.min(TOTAL_SLOTS, p + 1))}
            />
            <FocusButton
              label="Jump"
              variant="primary"
              style={styles.jumpBtn}
              onPress={() => {
                onJump(pending);
                setExpanded(false);
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 12,
    left: 12,
    alignItems: "flex-start",
    gap: 6,
  },
  trigger: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  card: {
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 10,
    padding: 8,
    gap: 6,
  },
  label: { color: "#fdba74", fontSize: 11, fontFamily: "monospace" },
  row: { flexDirection: "row", gap: 6 },
  stepBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, minWidth: 0 },
  jumpBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, minWidth: 0 },
});
