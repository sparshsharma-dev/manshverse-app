import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Modal as RNModal, Dimensions,
} from "react-native";
import { useRouter, Link } from "expo-router";
import Svg, { Line, Circle, Path, Rect } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { auth } from "../../src/lib/firebase";
import {
  signInWithEmailAndPassword, sendPasswordResetEmail,
  sendEmailVerification, signOut, User,
} from "firebase/auth";

const { width, height } = Dimensions.get("window");
const SPARSH_UID = "O3FcnaQA5tgNztbkWc2FLRnYdye2";

const MVLogo = () => (
  <Svg width="24" height="24" viewBox="0 0 100 100" fill="none">
    <Line x1="50" y1="50" x2="50" y2="18" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    <Line x1="50" y1="50" x2="78" y2="36" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
    <Line x1="50" y1="50" x2="83" y2="61" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    <Line x1="50" y1="50" x2="28" y2="78" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    <Circle cx="50" cy="50" r="4" fill="#fff" />
    <Circle cx="50" cy="18" r="2.5" fill="#fff" />
    <Circle cx="83" cy="61" r="2.5" fill="#fff" />
    <Circle cx="28" cy="78" r="2.5" fill="#fff" />
  </Svg>
);

interface ModalAction { label: string; onPress: () => void; }
interface ModalData {
  icon: string; title: string;
  lines: string[]; actions: ModalAction[];
  accent?: string; steps?: string[];
}

const InfoModal = ({ data, onClose }: { data: ModalData; onClose: () => void }) => (
  <RNModal transparent animationType="fade" visible onRequestClose={onClose}>
    <View style={s.modalOverlay}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={s.modalContent}>
        <Text style={s.modalIcon}>{data.icon}</Text>
        <Text style={s.modalTitle}>{data.title}</Text>
        {data.lines.map((l, i) => <Text key={i} style={s.modalLine}>{l}</Text>)}
        {data.steps && (
          <View style={s.stepsBox}>
            {data.steps.map((step, i) => (
              <View key={i} style={s.stepRow}>
                <View style={s.stepBadge}><Text style={s.stepNum}>{i + 1}</Text></View>
                <Text style={s.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={s.spamBox}>
          <Text style={{ fontSize: 16 }}>⚠️</Text>
          <Text style={s.spamText}>Check your Spam/Junk folder — verification emails often land there.</Text>
        </View>
        {data.actions.map((a, i) => (
          <TouchableOpacity
            key={i}
            style={[s.modalBtn, i === 0
              ? { backgroundColor: data.accent === "purple" ? "#7c5cfc" : "#fff" }
              : { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginTop: 8 }
            ]}
            onPress={a.onPress}
          >
            <Text style={[s.modalBtnText, { color: i === 0 ? (data.accent === "purple" ? "#fff" : "#000") : "#777" }]}>
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  </RNModal>
);

export default function Login() {
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [unverifiedUser, setUnverifiedUser] = useState<User | null>(null);
  const [modal, setModal] = useState<ModalData | null>(null);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) { setError("Please fill all fields."); return; }
    setLoading(true); setError("");
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      const u = result.user;
      if (!u.emailVerified && u.uid !== SPARSH_UID) {
        setUnverifiedUser(u);
        await signOut(auth);
        setNeedsVerification(true);
        setLoading(false);
        return;
      }
      router.replace("/(tabs)/chat");
    } catch (err: any) {
      if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].includes(err.code)) {
        setError("Invalid email or password.");
      } else {
        setError(err.message || "Login failed.");
      }
    }
    setLoading(false);
  };

  const handleResendVerification = async () => {
    if (!unverifiedUser) return;
    setLoading(true); setError("");
    try {
      await sendEmailVerification(unverifiedUser);
      setNeedsVerification(false);
      setModal({
        icon: "✉️", title: "Verification Link Sent!",
        lines: [`A new link was sent to ${unverifiedUser.email}.`],
        steps: [
          "Open your email inbox",
          "Check Spam/Junk folder if not in inbox",
          "Click the verification link",
          "Come back and sign in",
        ],
        actions: [{ label: "Got it ✓", onPress: () => setModal(null) }],
        accent: "purple",
      });
    } catch (err: any) {
      setError(err.code === "auth/too-many-requests"
        ? "Too many requests. Wait a few minutes."
        : "Failed to resend. Try again.");
    }
    setLoading(false);
  };

  const handleReset = async () => {
    if (!email) { setError("Enter your email address first."); return; }
    setLoading(true); setError("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetMode(false);
      setModal({
        icon: "🔑", title: "Password Reset Link Sent",
        lines: [`We sent a reset link to ${email}.`],
        steps: [
          "Open your email inbox",
          "Check Spam/Junk folder if not in inbox",
          "Click the reset link (expires in 1 hour)",
          "Set a new strong password",
          "Come back and sign in",
        ],
        actions: [{ label: "Back to Login", onPress: () => setModal(null) }],
      });
    } catch {
      setModal({
        icon: "🔑", title: "Reset Link Sent",
        lines: ["If an account with that email exists, a reset link was sent."],
        steps: ["Check Spam/Junk folder first", "Click the reset link", "Come back and sign in"],
        actions: [{ label: "Back to Login", onPress: () => setModal(null) }],
      });
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#000" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {modal && <InfoModal data={modal} onClose={() => setModal(null)} />}

      {/* Subtle glow bg */}
      <View style={s.glow} />

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.wrapper}>
          {/* Head */}
          <View style={s.head}>
            <LinearGradient colors={["#3d1f8a", "#1a0d2e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.mark}>
              <MVLogo />
            </LinearGradient>
            <Text style={s.title}>Manshverse</Text>
            <Text style={s.sub}>
              {needsVerification ? "Email Verification Required" : resetMode ? "Reset your password" : "Sign in to your account"}
            </Text>
          </View>

          {/* Card */}
          <View style={s.card}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={s.cardInner}>
              {!!error && <Text style={s.errText}>{error}</Text>}

              {/* NEEDS VERIFICATION */}
              {needsVerification ? (
                <View>
                  <View style={s.verifIconWrap}>
                    <Svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round">
                      <Rect x="3" y="11" width="18" height="11" rx="2" />
                      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </Svg>
                  </View>
                  <Text style={s.verifTitle}>Verify Your Email First</Text>
                  <Text style={s.verifDesc}>{unverifiedUser?.email} hasn't been verified yet.</Text>
                  <View style={s.spamWarn}>
                    <Text style={{ fontSize: 18, marginRight: 8 }}>⚠️</Text>
                    <Text style={{ flex: 1, color: "#facc15", fontSize: 12.5 }}>
                      Spam folder check is crucial. Verification emails are frequently filtered as spam.
                    </Text>
                  </View>
                  <TouchableOpacity style={[s.btn, s.btnPurple]} onPress={handleResendVerification} disabled={loading}>
                    <Text style={[s.btnText, { color: "#fff" }]}>{loading ? "Sending..." : "📧 Resend Verification Link"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setNeedsVerification(false); setError(""); }} style={{ marginTop: 16 }}>
                    <Text style={s.linkText}>← Back to Login</Text>
                  </TouchableOpacity>
                </View>

              /* RESET MODE */
              ) : resetMode ? (
                <View>
                  <View style={{ alignItems: "center", marginBottom: 20 }}>
                    <Text style={{ fontSize: 40, marginBottom: 12 }}>🔑</Text>
                    <Text style={{ fontSize: 14, color: "#666", textAlign: "center" }}>
                      Enter your email and we'll send a password reset link.
                    </Text>
                  </View>
                  <Text style={s.label}>EMAIL ADDRESS</Text>
                  <TextInput
                    style={s.input} value={email} onChangeText={setEmail}
                    placeholder="you@example.com" placeholderTextColor="#555"
                    keyboardType="email-address" autoCapitalize="none"
                  />
                  <TouchableOpacity style={[s.btn, { marginTop: 16 }]} onPress={handleReset} disabled={loading}>
                    <Text style={s.btnText}>{loading ? "Sending..." : "Send Reset Link →"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setResetMode(false); setError(""); }} style={{ marginTop: 16 }}>
                    <Text style={s.linkText}>← Back to login</Text>
                  </TouchableOpacity>
                </View>

              /* NORMAL LOGIN */
              ) : (
                <View>
                  {/* Method tabs */}
                  <View style={s.tabs}>
                    {(["email", "phone"] as const).map((m) => (
                      <TouchableOpacity key={m} style={[s.tab, method === m && s.tabActive]} onPress={() => { setMethod(m); setError(""); }}>
                        <Text style={[s.tabText, method === m && s.tabTextActive]}>{m.charAt(0).toUpperCase() + m.slice(1)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {method === "email" && (
                    <View>
                      <Text style={s.label}>EMAIL</Text>
                      <TextInput
                        style={[s.input, { marginBottom: 16 }]} value={email} onChangeText={setEmail}
                        placeholder="you@example.com" placeholderTextColor="#555"
                        keyboardType="email-address" autoCapitalize="none"
                      />
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <Text style={s.label}>PASSWORD</Text>
                        <TouchableOpacity onPress={() => { setResetMode(true); setError(""); }}>
                          <Text style={{ color: "#7c5cfc", fontSize: 12, fontWeight: "600" }}>Forgot password?</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={[s.input, { marginBottom: 0 }]} value={password} onChangeText={setPassword}
                        placeholder="••••••••" placeholderTextColor="#555" secureTextEntry
                      />
                      <TouchableOpacity style={[s.btn, { marginTop: 20 }]} onPress={handleLogin} disabled={loading}>
                        {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>Access Manshverse →</Text>}
                      </TouchableOpacity>
                    </View>
                  )}

                  {method === "phone" && (
                    <View style={{ alignItems: "center", paddingVertical: 20 }}>
                      <Text style={{ fontSize: 32, marginBottom: 12 }}>📱</Text>
                      <Text style={{ color: "#555", fontSize: 14, textAlign: "center", lineHeight: 22 }}>
                        Phone auth requires additional native setup.{"\n"}Use email login for now.
                      </Text>
                    </View>
                  )}

                  {/* Divider */}
                  <View style={s.divider}>
                    <View style={s.divLine} />
                    <Text style={s.divText}>OR</Text>
                    <View style={s.divLine} />
                  </View>

                  {/* Google (placeholder) */}
                  <TouchableOpacity style={s.googleBtn} onPress={() => setError("Google Sign-In coming soon.")}>
                    <Svg width="18" height="18" viewBox="0 0 48 48">
                      <Path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z" />
                      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.8 13.5-4.7l-6.2-5.2C29.3 35.6 26.8 36.5 24 36.5c-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.8 40.1 16.4 44 24 44z" />
                      <Path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.2 5.2C41 35.6 44 30.2 44 24c0-1.3-.1-2.7-.4-4z" />
                    </Svg>
                    <Text style={s.googleText}>Continue with Google</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {!resetMode && !needsVerification && (
            <View style={s.footer}>
              <Text style={s.footerText}>Don't have an account? </Text>
              <Link href="/(auth)/signup" asChild>
                <TouchableOpacity>
                  <Text style={s.footerLink}>Create one</Text>
                </TouchableOpacity>
              </Link>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  glow: { position: "absolute", width: width * 1.5, height: width * 1.5, borderRadius: width, backgroundColor: "rgba(108,71,255,0.06)", top: height / 2 - (width * 0.75), left: -(width * 0.25) },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  wrapper: { width: "100%", maxWidth: 420, paddingVertical: 20 },
  head: { alignItems: "center", marginBottom: 32 },
  mark: { width: 52, height: 52, borderRadius: 16, justifyContent: "center", alignItems: "center", marginBottom: 20, borderWidth: 1, borderColor: "rgba(124,92,252,0.3)" },
  title: { fontSize: 26, fontWeight: "700", color: "#fff", letterSpacing: -0.5, marginBottom: 8 },
  sub: { fontSize: 14, color: "#888" },
  card: { borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", backgroundColor: "rgba(8,8,14,0.75)" },
  cardInner: { padding: 28 },
  errText: { fontSize: 13.5, color: "#fca5a5", backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)", borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 18 },
  tabs: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.03)", padding: 4, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  tab: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.06)", borderWidth: 1 },
  tabText: { color: "#666", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#fff" },
  label: { fontSize: 11, color: "#555", fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  input: { width: "100%", backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: "#fff" },
  btn: { width: "100%", backgroundColor: "#fff", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  btnPurple: { backgroundColor: "#7c5cfc" },
  btnText: { color: "#000", fontSize: 15, fontWeight: "700" },
  linkText: { color: "#666", fontSize: 13, fontWeight: "600", textAlign: "center", textDecorationLine: "underline" },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 22 },
  divLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.07)" },
  divText: { fontSize: 11, color: "#444", letterSpacing: 1, fontWeight: "600" },
  googleBtn: { width: "100%", backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  googleText: { fontSize: 14, fontWeight: "600", color: "#aaa" },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 28 },
  footerText: { fontSize: 13, color: "#555" },
  footerLink: { color: "#fff", fontSize: 13, fontWeight: "600", borderBottomWidth: 1, borderBottomColor: "#333" },
  verifIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(250,204,21,0.1)", borderWidth: 1, borderColor: "rgba(250,204,21,0.3)", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 20 },
  verifTitle: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 12, textAlign: "center" },
  verifDesc: { fontSize: 14, color: "#888", lineHeight: 22, marginBottom: 16, textAlign: "center" },
  spamWarn: { flexDirection: "row", backgroundColor: "rgba(250,204,21,0.07)", borderWidth: 1, borderColor: "rgba(250,204,21,0.3)", padding: 14, borderRadius: 12, marginBottom: 24, alignItems: "flex-start" },
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.8)" },
  modalContent: { backgroundColor: "rgba(8,8,14,0.99)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 24, padding: 32, width: "100%", maxWidth: 440 },
  modalIcon: { fontSize: 52, textAlign: "center", marginBottom: 20 },
  modalTitle: { fontSize: 21, fontWeight: "700", color: "#fff", textAlign: "center", marginBottom: 12 },
  modalLine: { fontSize: 14, color: "#888", lineHeight: 24, marginBottom: 8, textAlign: "center" },
  stepsBox: { marginVertical: 20, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 18 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  stepBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(124,92,252,0.2)", borderWidth: 1, borderColor: "rgba(124,92,252,0.4)", alignItems: "center", justifyContent: "center", marginTop: 1 },
  stepNum: { fontSize: 11, fontWeight: "700", color: "#a78bfa" },
  stepText: { fontSize: 13.5, color: "#bbb", lineHeight: 22, flex: 1 },
  spamBox: { flexDirection: "row", backgroundColor: "rgba(250,204,21,0.06)", borderWidth: 1, borderColor: "rgba(250,204,21,0.25)", borderRadius: 12, padding: 14, marginBottom: 20, gap: 10 },
  spamText: { fontSize: 12.5, color: "#fbbf24", lineHeight: 20, flex: 1 },
  modalBtn: { width: "100%", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnText: { fontSize: 14, fontWeight: "700" },
});