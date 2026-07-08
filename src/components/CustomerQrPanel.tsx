import { View, Text, StyleSheet } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { BASE_URL } from "../config";

// Floating card matching the web player's QR panel: lets a passerby scan to
// view the advertiser's public profile. Needs its own translucent background
// (unlike the purely-informational status text elsewhere) since the QR code
// itself needs a solid white patch to stay scannable, and the card gives it
// contrast against whatever the ad looks like underneath.
export function CustomerQrPanel({
  customerId,
  businessName,
  city,
  state,
  coords,
}: {
  customerId: number;
  businessName: string | null;
  city: string | null;
  state: string | null;
  coords: { lat: number; lng: number } | null;
}) {
  const profileUrl = `${BASE_URL}/api/qr/customer/${customerId}`;
  const address = [city, state].filter(Boolean).join(", ");

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.card}>
        <View style={styles.qrBox}>
          <QRCode value={profileUrl} size={64} backgroundColor="#fff" color="#000" />
        </View>

        {businessName && (
          <Text style={styles.name} numberOfLines={2}>{businessName}</Text>
        )}

        {address.length > 0 && (
          <Text style={styles.address} numberOfLines={2}>{address}</Text>
        )}

        {coords && (
          <Text style={styles.coords} numberOfLines={1}>
            📍 {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </Text>
        )}

        <Text style={styles.cta}>Scan to view profile</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 10,
    top: 70,
    bottom: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    maxWidth: 96,
    gap: 5,
  },
  qrBox: {
    backgroundColor: "#fff",
    borderRadius: 6,
    padding: 4,
  },
  name: { color: "#fff", fontSize: 10, fontWeight: "700", textAlign: "center", lineHeight: 12 },
  address: { color: "rgba(255,255,255,0.7)", fontSize: 8, textAlign: "center", lineHeight: 10 },
  coords: { color: "#fdba74", fontSize: 7, fontFamily: "monospace" },
  cta: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 7,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
  },
});
