// Local Expo config plugin that makes the standard Android build a good
// Android-TV citizen, without switching to the heavier react-native-tvos fork:
//
//  1. Declares touchscreen + leanback as NOT required, so the APK installs on
//     TV boxes (and would pass Play Store's TV filter later).
//  2. Adds the LEANBACK_LAUNCHER category to the main activity so the app
//     shows up on the Android-TV home screen, not just under Settings > Apps.
//
const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

module.exports = function withAndroidTv(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // ── uses-feature: don't require touchscreen / leanback ──
    manifest["uses-feature"] = manifest["uses-feature"] || [];
    const ensureFeature = (name, required) => {
      const existing = manifest["uses-feature"].find((f) => f.$ && f.$["android:name"] === name);
      if (existing) {
        existing.$["android:required"] = required;
      } else {
        manifest["uses-feature"].push({ $: { "android:name": name, "android:required": required } });
      }
    };
    ensureFeature("android.hardware.touchscreen", "false");
    ensureFeature("android.software.leanback", "false");

    // ── Add LEANBACK_LAUNCHER to the main launcher intent-filter ──
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const main = (app.activity || []).find((a) => a.$ && a.$["android:name"] === ".MainActivity");
    if (main && main["intent-filter"]) {
      const launcher = main["intent-filter"].find((f) =>
        (f.category || []).some((c) => c.$ && c.$["android:name"] === "android.intent.category.LAUNCHER"),
      );
      if (launcher) {
        launcher.category = launcher.category || [];
        const has = launcher.category.some(
          (c) => c.$ && c.$["android:name"] === "android.intent.category.LEANBACK_LAUNCHER",
        );
        if (!has) {
          launcher.category.push({ $: { "android:name": "android.intent.category.LEANBACK_LAUNCHER" } });
        }
      }
    }

    return cfg;
  });
};
