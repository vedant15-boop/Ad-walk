import { View, Text, StyleSheet } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { BASE_URL } from "../config";

// Floating QR code: lets a passerby scan to view the advertiser's public
// profile. Needs its own translucent background (unlike the
// purely-informational status text elsewhere) since the QR code itself
// needs a solid white patch to stay scannable.
export function CustomerQrPanel({
  customerId,
  screenId,
  businessName,
  coords,
}: {
  customerId: number;
  screenId: number;
  businessName?: string | null;
  coords: { lat: number; lng: number } | null;
}) {
  // ?s= identifies which screen the person scanned from. Without it every
  // scan is attributable to an advertiser but not to a location, which is
  // what makes "is this spot working?" answerable.
  const profileUrl = `${BASE_URL}/api/qr/customer/${customerId}?s=${screenId}`;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.card}>
        <View style={styles.qrBox}>
          <QRCode value={profileUrl} size={64} backgroundColor="#fff" color="#000" />
        </View>

        {businessName && (
          <Text style={styles.name} numberOfLines={1}>
            {businessName}
          </Text>
        )}

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
  name: { color: "#fff", fontSize: 9, fontWeight: "600", maxWidth: 90 },
  coords: { color: "#fdba74", fontSize: 7, fontFamily: "monospace" },
});
