import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";

export default function Explore() {
  return (
    <View style={s.root}>
      <Text style={s.title}>Explore</Text>
      <Text style={s.sub}>Discover Manshverse's special modes</Text>

      <TouchableOpacity style={s.card} onPress={() => router.push("/personas")}>
        <Text style={s.cardIcon}>👤</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Personas & Avatars</Text>
          <Text style={s.cardDesc}>Talk to historical figures, expert professionals, or fictional icons</Text>
        </View>
        <Text style={{ color: "#444", fontSize: 20 }}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[s.card, { borderColor: "rgba(124,92,252,0.3)" }]} onPress={() => router.push("/council")}>
        <Text style={s.cardIcon}>⚔️</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Council of Minds</Text>
          <Text style={s.cardDesc}>Ask a hard question — three expert minds debate it, then reach a verdict</Text>
        </View>
        <Text style={{ color: "#444", fontSize: 20 }}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000", padding: 24, paddingTop: 80 },
  title: { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: -1, marginBottom: 8 },
  sub: { fontSize: 14, color: "#555", marginBottom: 32 },
  card: {
    backgroundColor: "rgba(10,10,15,0.7)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 20, padding: 20,
    flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 16,
  },
  cardIcon: { fontSize: 32, width: 48, textAlign: "center" },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#fff", marginBottom: 6 },
  cardDesc: { fontSize: 13, color: "#666", lineHeight: 20 },
});