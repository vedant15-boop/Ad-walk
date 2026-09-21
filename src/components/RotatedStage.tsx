import { useEffect } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import type { DisplayOrientation } from "../storage";

/**
 * Counter-rotates the whole UI when the panel is carried physically turned on
 * its side.
 *
 * Two mechanisms, because Android TV builds are inconsistent about honouring
 * orientation requests:
 *
 *  1. Ask the OS to rotate. When the box obliges, everything — including the
 *     native video surface — rotates properly and we do nothing else.
 *  2. If the window never actually flips, rotate the content ourselves with a
 *     transform. Always draws correctly, but it's a fallback because native
 *     video surfaces don't always honour a parent transform.
 *
 * Which one is in play is decided by observing the real window dimensions
 * rather than trusting the lock call, so the same build works on boxes that
 * rotate and boxes that refuse to.
 */
export function RotatedStage({
  orientation,
  children,
}: {
  orientation: DisplayOrientation;
  children: React.ReactNode;
}) {
  const { width, height } = useWindowDimensions();

  // Always keep the OS in landscape and do the rotation ourselves.
  //
  // Asking the box to rotate looked cleaner but wasn't reliable: at least one
  // box changes the dimensions it reports without actually rotating what it
  // renders, which made "did the window flip?" useless as a signal — it looked
  // handled, so nothing rotated and the toggle appeared dead. Doing it
  // ourselves is deterministic and behaves the same on every box.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);

  if (orientation !== "portrait") {
    return <View style={styles.fill}>{children}</View>;
  }

  // Swap the axes: a portrait-shaped box, centred, then turned a quarter turn
  // clockwise so it lands exactly over the landscape screen the right way up
  // for the direction the panel is carried.
  const portraitWidth = Math.min(width, height);
  const portraitHeight = Math.max(width, height);

  return (
    <View style={styles.fill}>
      <View
        style={{
          position: "absolute",
          width: portraitWidth,
          height: portraitHeight,
          left: (width - portraitWidth) / 2,
          top: (height - portraitHeight) / 2,
          transform: [{ rotate: "90deg" }],
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // overflow visible matters: before the rotation is applied the child is
  // taller than the screen, and a clipping parent would cut it off.
  fill: { flex: 1, backgroundColor: "#000", overflow: "visible" },
});
