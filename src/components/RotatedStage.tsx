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

  useEffect(() => {
    const lock = orientation === "portrait"
      // PORTRAIT_UP rather than PORTRAIT: the docs note plain PORTRAIT is
      // invalid on devices that can't do PORTRAIT_DOWN, which includes a lot
      // of TV hardware.
      ? ScreenOrientation.OrientationLock.PORTRAIT_UP
      : ScreenOrientation.OrientationLock.LANDSCAPE;
    ScreenOrientation.lockAsync(lock).catch(() => {
      // Box refuses to rotate — the transform below covers it.
    });
  }, [orientation]);

  // The OS ignored us if we asked for portrait and the window is still wider
  // than it is tall.
  const mustRotateOurselves = orientation === "portrait" && width > height;

  if (!mustRotateOurselves) {
    return <View style={styles.fill}>{children}</View>;
  }

  return (
    <View style={styles.fill}>
      <View
        style={{
          position: "absolute",
          // Portrait-shaped box: the screen's dimensions swapped.
          width: height,
          height: width,
          // Centre it, so rotating about its own centre lands it exactly over
          // the screen.
          left: (width - height) / 2,
          top: (height - width) / 2,
          transform: [{ rotate: "-90deg" }],
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
});
