import { View, Text, StyleSheet } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { BASE_URL } from "../config";

// Floating QR code: lets a passerby scan to view the advertiser's public
// profile. Business name/address are hidden for now (privacy, not decided
// yet whether to surface them on-screen). Needs its own translucent
// background (unlike the purely-informational status text elsewhere) since
// the QR code itself needs a solid white patch to stay scannable.
export function CustomerQrPanel({
  customerId,
  coords,
}: {
  customerId: number;
  coords: { lat: number; lng: number } | null;
}) {
  const profileUrl = `${BASE_URL}/api/qr/customer/${customerId}`;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.card}>
        <View style={styles.qrBox}>
          <QRCode value={profileUrl} size={64} backgroundColor="#fff" color="#000" />
        </View>

        {coords && (
          <Text style={styles.coords} numberOfLines={1}>
            📍 {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  card: {
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 5,
  },
  qrBox: {
    backgroundColor: "#fff",
    borderRadius: 6,
    padding: 4,
  },
  coords: { color: "#fdba74", fontSize: 7, fontFamily: "monospace" },
});
