import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { mediaUri, isVideo } from "../config";

// ─────────────────────────────────────────────────────────────────────────
// Resolution-independent ad renderer.
//
// Both image and video use contentFit="contain": the media is scaled to fit
// inside the screen, preserving aspect ratio. Nothing is ever cropped or
// stretched — if the ad's aspect ratio doesn't match the TV, the leftover
// space is filled with the black background (letterbox/pillarbox). This is
// what makes one APK look correct on 720p, 1080p and 4K panels alike.
// ─────────────────────────────────────────────────────────────────────────

function AdVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true; // loop within the 12s slot if the clip is shorter
    p.muted = true; // public screens play silently
    p.play();
  });

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      contentFit="contain"
      nativeControls={false}
    />
  );
}

function AdImage({ uri }: { uri: string }) {
  return (
    <Image
      style={StyleSheet.absoluteFill}
      source={{ uri }}
      contentFit="contain"
      transition={300}
      cachePolicy="memory-disk"
    />
  );
}

export function AdMedia({
  url,
  mediaType,
}: {
  url: string | null;
  mediaType: string | null;
}) {
  const uri = mediaUri(url);
  if (!uri) return null;

  // Keyed by uri so React fully remounts on slot change — gives a clean
  // fade for images and a fresh player instance for videos.
  return (
    <View style={StyleSheet.absoluteFill}>
      {isVideo(mediaType, url) ? <AdVideo key={uri} uri={uri} /> : <AdImage key={uri} uri={uri} />}
    </View>
  );
}
