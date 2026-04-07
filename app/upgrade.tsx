import { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../src/lib/firebase";

const UPI_ID = "sparshxmnsi@fam";
const SUPPORT_EMAIL = "manshverse@gmail.com";

const PLANS = [
  {
    id: "pro",
    name: "Pro",
    price: "₹199",
    period: "/month",
    color: "#a78bfa",
    features: [
      "40 Astral msgs/day",
      "15 Milkcake msgs/day",
      "Mansh Mode access",
      "All personas unlocked",
      "Priority support",
    ],
  },
  {
    id: "ultra",
    name: "Ultra",
    price: "₹1,999",
    period: "/year",
    color: "#67e8f9",
    highlight: true,
    badge: "Best Value — Save ₹389",
    features: [
      "Unlimited Astral & Impulse",
      "75 Milkcake msgs/day",
      "Priority on all models",
      "Free future model upgrades",
      "Early access to new features",
    ],
  },
];

export default function Upgrade() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const user = auth.currentUser;

  const handleUpgrade = async (planId: string, amount: number) => {
    if (!user?.uid || submitting) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "users", user.uid, "planRequests"), {
        userId: user.uid,
        requesterName: user.displayName || "User",
        requesterEmail: user.email || "",
        requestedPlan: planId,
        amount,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setSubmitted(planId);
    } catch {
      // fail silently, still show UPI
    }
    setSubmitting(false);
  };

  const openUPI = (amount: number) => {
    const url = `upi://pay?pa=${UPI_ID}&am=${amount}&cu=INR&tn=Manshverse+Plan`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://payment.airtel.in/payv2/?upiId=${UPI_ID}`);
    });
  };

  if (submitted) {
    return (
      <View style={s.root}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="close" size={20} color="#888" />
          </TouchableOpacity>
        </View>
        <View style={s.successWrap}>
          <Text style={{ fontSize: 60, marginBottom: 24 }}>✅</Text>
          <Text style={s.successTitle}>Request Sent!</Text>
          <Text style={s.successDesc}>
            Your upgrade request is now visible in the creator dashboard.{"\n\n"}
            Send your payment screenshot to{"\n"}
            <Text style={{ color: "#fff", fontWeight: "600" }}>{SUPPORT_EMAIL}</Text>
            {"\n"}from your registered email.{"\n\n"}
            We'll activate your plan within a few hours.
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => router.back()}>
            <Text style={s.primaryBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Topbar */}
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="arrow-back" size={20} color="#888" />
        </TouchableOpacity>
        <Text style={s.topTitle}>Upgrade Manshverse</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={s.heading}>Unlock the full experience</Text>
        <Text style={s.subheading}>More messages, more models, more power</Text>

        {/* Free plan comparison */}
        <View style={s.freeCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <View style={[s.planDot, { backgroundColor: "#555" }]} />
            <Text style={{ color: "#888", fontWeight: "700", fontSize: 15 }}>Free Plan (Current)</Text>
          </View>
          {["10 Astral msgs/day", "5 Milkcake msgs/day", "Limited Mansh Mode", "Basic personas"].map((f) => (
            <View key={f} style={s.featureRow}>
              <Ionicons name="remove-outline" size={14} color="#444" />
              <Text style={{ color: "#555", fontSize: 13.5 }}>{f}</Text>
            </View>
          ))}
        </View>

        {/* Paid plans */}
        {PLANS.map((plan) => (
          <View key={plan.id} style={[s.planCard, plan.highlight && { borderColor: `${plan.color}50`, backgroundColor: `${plan.color}08` }]}>
            {plan.badge && (
              <View style={[s.badgeWrap, { backgroundColor: `${plan.color}20`, borderColor: `${plan.color}40` }]}>
                <Text style={[s.badgeText, { color: plan.color }]}>{plan.badge}</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, marginBottom: 4 }}>
              <Text style={[s.planPrice, { color: plan.color }]}>{plan.price}</Text>
              <Text style={s.planPeriod}>{plan.period}</Text>
            </View>
            <Text style={[s.planName, { color: plan.color }]}>{plan.name}</Text>

            <View style={s.featureList}>
              {plan.features.map((f) => (
                <View key={f} style={s.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={plan.color} />
                  <Text style={{ color: "#ccc", fontSize: 13.5 }}>{f}</Text>
                </View>
              ))}
            </View>

            {/* Pay with UPI button */}
            <TouchableOpacity
              style={[s.upiBtn, { borderColor: `${plan.color}50` }]}
              onPress={() => openUPI(plan.id === "pro" ? 199 : 1999)}
            >
              <Ionicons name="phone-portrait-outline" size={16} color={plan.color} />
              <Text style={[s.upiBtnText, { color: plan.color }]}>
                Pay ₹{plan.id === "pro" ? "199" : "1,999"} via UPI
              </Text>
            </TouchableOpacity>

            {/* Notify after payment */}
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: plan.color, marginTop: 10 }]}
              onPress={() => handleUpgrade(plan.id, plan.id === "pro" ? 199 : 1999)}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={s.primaryBtnText}>
                  I've Paid — Notify Creator
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ))}

        {/* UPI info */}
        <View style={s.upiInfo}>
          <Text style={s.upiInfoTitle}>How to upgrade</Text>
          <View style={s.step}>
            <View style={s.stepNum}><Text style={s.stepNumText}>1</Text></View>
            <Text style={s.stepText}>Tap "Pay via UPI" — opens your UPI app directly</Text>
          </View>
          <View style={s.step}>
            <View style={s.stepNum}><Text style={s.stepNumText}>2</Text></View>
            <Text style={s.stepText}>Complete payment to <Text style={{ color: "#fff", fontWeight: "600" }}>{UPI_ID}</Text></Text>
          </View>
          <View style={s.step}>
            <View style={s.stepNum}><Text style={s.stepNumText}>3</Text></View>
            <Text style={s.stepText}>Tap "I've Paid — Notify Creator" so we know</Text>
          </View>
          <View style={s.step}>
            <View style={s.stepNum}><Text style={s.stepNumText}>4</Text></View>
            <Text style={s.stepText}>Send payment screenshot to <Text style={{ color: "#fff" }}>{SUPPORT_EMAIL}</Text></Text>
          </View>
          <View style={s.step}>
            <View style={s.stepNum}><Text style={s.stepNumText}>5</Text></View>
            <Text style={s.stepText}>Plan activated within a few hours ⚡</Text>
          </View>
        </View>

        <Text style={s.footer}>manshverse.vercel.app · sparshxmnsi@fam</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#111" },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  topTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  heading: { fontSize: 26, fontWeight: "800", color: "#fff", letterSpacing: -0.8, marginBottom: 8, marginTop: 8 },
  subheading: { fontSize: 14, color: "#555", marginBottom: 24 },
  freeCard: { backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 18, padding: 20, marginBottom: 16 },
  planCard: { backgroundColor: "rgba(10,10,15,0.8)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 20, padding: 22, marginBottom: 16 },
  badgeWrap: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", marginBottom: 14 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  planDot: { width: 10, height: 10, borderRadius: 5 },
  planPrice: { fontSize: 40, fontWeight: "800", letterSpacing: -1 },
  planPeriod: { fontSize: 14, color: "#555", marginBottom: 6 },
  planName: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 20 },
  featureList: { gap: 10, marginBottom: 22 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  upiBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 14 },
  upiBtnText: { fontWeight: "700", fontSize: 14 },
  primaryBtn: { backgroundColor: "#fff", borderRadius: 12, padding: 15, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#000", fontWeight: "700", fontSize: 15 },
  upiInfo: { backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 18, padding: 20, marginTop: 8 },
  upiInfoTitle: { fontSize: 14, fontWeight: "700", color: "#fff", marginBottom: 16 },
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 14 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  stepNumText: { fontSize: 12, fontWeight: "700", color: "#888" },
  stepText: { fontSize: 13.5, color: "#666", lineHeight: 20, flex: 1 },
  footer: { textAlign: "center", fontSize: 11, color: "#222", marginTop: 24, letterSpacing: 0.5 },
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  successTitle: { fontSize: 28, fontWeight: "800", color: "#4ade80", marginBottom: 16 },
  successDesc: { fontSize: 15, color: "#555", lineHeight: 26, textAlign: "center", marginBottom: 32 },
});