import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal as RNModal,
  Dimensions
} from "react-native";
import { useRouter, Link } from "expo-router";
import Svg, { Line, Circle, Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

// Firebase
import { auth, db } from "../../src/lib/firebase";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut,
  // Note: Phone & Google Auth require RN-specific libraries in Expo.
} from "firebase/auth";
import { ensureUserProfileDoc } from "../../src/lib/account";
import { STARS } from "../../src/lib/stars";

const { width, height } = Dimensions.get("window");

// Svg Components
const MVLogo = () => (
  <Svg width="24" height="24" viewBox="0 0 100 100" fill="none">
    <Line x1="50" y1="50" x2="50" y2="18" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    <Line x1="50" y1="50" x2="78" y2="36" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
    <Line x1="50" y1="50" x2="83" y2="61" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    <Line x1="50" y1="50" x2="58" y2="81" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
    <Line x1="50" y1="50" x2="28" y2="78" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    <Line x1="50" y1="50" x2="19" y2="46" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
    <Line x1="50" y1="50" x2="39" y2="21" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
    <Circle cx="50" cy="50" r="4" fill="#fff" />
    <Circle cx="50" cy="18" r="2.5" fill="#fff" />
    <Circle cx="83" cy="61" r="2.5" fill="#fff" />
    <Circle cx="28" cy="78" r="2.5" fill="#fff" />
  </Svg>
);

// Types
interface ModalAction {
  label: string;
  onClick: () => void;
}

interface ModalProps {
  icon: string;
  title: string;
  lines: string[];
  actions: ModalAction[];
  accent?: "purple" | string;
}

interface VerifyEmailScreenProps {
  email: string;
  onGoToLogin: () => void;
}

// Post-registration Success Screen
const VerifyEmailScreen = ({ email, onGoToLogin }: VerifyEmailScreenProps) => (
  <View style={{ alignItems: "center" }}>
    <LinearGradient
      colors={["rgba(124,92,252,0.2)", "rgba(167,139,250,0.1)"]}
      style={styles.envelopeIcon}
    >
      <Text style={{ fontSize: 36 }}>✉️</Text>
    </LinearGradient>

    <Text style={styles.successTitle}>Account Created! 🎉</Text>
    <Text style={styles.successDesc}>
      We sent a verification link to{"\n"}
      <Text style={{ color: "#fff", fontWeight: "bold" }}>{email}</Text>
    </Text>

    <View style={styles.stepsContainer}>
      <Text style={styles.stepsLabel}>WHAT TO DO NEXT</Text>
      {[
        { icon: "📬", text: "Open your email inbox", sub: "Check the inbox for the email you just used", highlight: false },
        { icon: "🚨", text: "Check Spam / Junk folder", sub: "Firebase emails almost always get filtered there", highlight: true },
        { icon: "🔗", text: "Click the verification link", sub: "Opens a page confirming your email is verified", highlight: false },
        { icon: "🔐", text: "Come back and sign in", sub: "Use your email + password to access Manshverse", highlight: false },
      ].map((s, i) => (
        <View key={i} style={[styles.stepRow, i < 3 && { marginBottom: 16 }]}>
          <View style={[styles.stepIconBox, s.highlight && styles.stepIconBoxHighlight]}>
            <Text style={{ fontSize: 18 }}>{s.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.stepText, s.highlight && { color: "#fbbf24" }]}>{s.text}</Text>
            <Text style={styles.stepSub}>{s.sub}</Text>
          </View>
        </View>
      ))}
    </View>

    <View style={styles.spamWarning}>
      <Text style={{ fontSize: 18, marginRight: 10 }}>⚠️</Text>
      <Text style={styles.spamWarningText}>
        <Text style={{ fontWeight: "bold" }}>Spam folder is critical.</Text> Gmail, Outlook, and Yahoo frequently filter Firebase verification emails. If you don't see it in 2 minutes, check spam.
      </Text>
    </View>

    <TouchableOpacity style={[styles.btn, styles.btnPurple, { marginBottom: 12 }]} onPress={onGoToLogin}>
      <Text style={[styles.btnText, { color: "#fff" }]}>Go to Login →</Text>
    </TouchableOpacity>
    <Text style={{ fontSize: 12, color: "#444" }}>Already verified? Sign in above ↑</Text>
  </View>
);

// Styled Modal
const CustomModal = ({ icon, title, lines, actions, accent = "#4ade80" }: ModalProps) => (
  <RNModal transparent animationType="fade" visible={true}>
    <View style={styles.modalOverlay}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.modalContent}>
        <Text style={styles.modalIcon}>{icon}</Text>
        <Text style={styles.modalTitle}>{title}</Text>
        
        {lines.map((l, i) => (
          <Text key={i} style={styles.modalLine}>{l}</Text>
        ))}

        <View style={styles.modalActions}>
          {actions.map((a, i) => (
            <TouchableOpacity
              key={i}
              onPress={a.onClick}
              style={[
                styles.modalBtn,
                i === 0
                  ? { backgroundColor: accent === "purple" ? "#7c5cfc" : "#fff" }
                  : { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }
              ]}
            >
              <Text
                style={[
                  styles.modalBtnText,
                  i === 0 ? { color: accent === "purple" ? "#fff" : "#000" } : { color: "#777" }
                ]}
              >
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  </RNModal>
);

export default function Signup() {
  const[method, setMethod] = useState<"email" | "phone">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);

  const [error, setError] = useState("");
  const[loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [modal, setModal] = useState<ModalProps | null>(null);

  const[showVerifyScreen, setShowVerifyScreen] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  const router = useRouter();

  const validatePassword = (pass: string) => {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{18,}$/.test(pass);
  };

  const handleEmailRegister = async () => {
    if (!name || !email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (!validatePassword(password)) {
      setError("Password must be at least 18 characters and include an uppercase letter, a number, and a symbol.");
      return;
    }
    setLoading(true); setError("");
    try {
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(result.user, { displayName: name.trim() });
      await ensureUserProfileDoc(db, result.user, { name: name.trim(), email: email.trim(), photoURL: "" });
      await sendEmailVerification(result.user);
      await signOut(auth);
      
      setRegisteredEmail(email);
      setShowVerifyScreen(true);
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        setError("An account with this email already exists. Try logging in instead.");
      } else if (err.code === "auth/password-does-not-meet-requirements") {
        setError("Password doesn't meet Firebase security requirements. Make it stronger.");
      } else {
        setError("Registration failed: " + err.message);
      }
    }
    setLoading(false);
  };

  // Phone Auth (requires Expo Firebase Recaptcha In Reality)
  const handleSendOTP = async () => {
    setError("Phone Auth natively requires expo-firebase-recaptcha or @react-native-firebase/auth.");
  };

  const handleVerifyOTP = async () => {
    // Implementation placeholder for native
  };

  // Google Auth (requires Google Sign-in Library)
  const handleGoogle = async () => {
    setError("Google Sign-In requires @react-native-google-signin/google-signin in Expo.");
  };

  const passwordStrengthBars =[
    password.length >= 8,
    password.length >= 12,
    /[A-Z]/.test(password) && /[0-9]/.test(password),
    /[\W_]/.test(password) && password.length >= 18,
  ];
  const barColors =["#ef4444", "#f97316", "#eab308", "#4ade80"];

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: "#000" }} 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {modal && <CustomModal {...modal} />}

      {/* Starfield Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {STARS?.map(s => (
          <View
            key={s.id}
            style={{
              position: "absolute",
              left: s.left,
              top: s.top,
              width: s.w,
              height: s.w,
              borderRadius: s.w / 2,
              backgroundColor: "#fff",
              opacity: s.op,
            }}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.glow} />
        
        <View style={styles.wrapper}>
          <View style={styles.head}>
            <LinearGradient colors={["#3d1f8a", "#1a0d2e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mark}>
              <MVLogo />
            </LinearGradient>
            <Text style={styles.title}>{showVerifyScreen ? "Manshverse" : "Join Manshverse"}</Text>
            <Text style={styles.sub}>{showVerifyScreen ? "One last step" : "Create your account"}</Text>
          </View>

          <View style={styles.cardContainer}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.cardInner}>
              
              {showVerifyScreen ? (
                <VerifyEmailScreen
                  email={registeredEmail}
                  onGoToLogin={() => router.push("/login")}
                />
              ) : (
                <View>
                  <View style={styles.tabs}>
                    <TouchableOpacity style={[styles.tab, method === "email" && styles.tabActive]} onPress={() => { setMethod("email"); setError(""); }}>
                      <Text style={[styles.tabText, method === "email" && styles.tabTextActive]}>Email</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.tab, method === "phone" && styles.tabActive]} onPress={() => { setMethod("phone"); setError(""); }}>
                      <Text style={[styles.tabText, method === "phone" && styles.tabTextActive]}>Phone</Text>
                    </TouchableOpacity>
                  </View>

                  {error ? <Text style={styles.errText}>{error}</Text> : null}

                  {method === "email" ? (
                    <View>
                      <View style={styles.field}>
                        <Text style={styles.label}>FULL NAME</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. Sparsh Sharma"
                          placeholderTextColor="#555"
                          value={name}
                          onChangeText={setName}
                          autoCapitalize="words"
                        />
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>EMAIL ADDRESS</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="you@example.com"
                          placeholderTextColor="#555"
                          value={email}
                          onChangeText={setEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>PASSWORD</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Min 18 chars, 1 Upper, 1 Num, 1 Symbol"
                          placeholderTextColor="#555"
                          value={password}
                          onChangeText={setPassword}
                          secureTextEntry
                        />
                        <View style={styles.pwStrength}>
                          {passwordStrengthBars.map((met, i) => (
                            <View 
                              key={i} 
                              style={[
                                styles.pwBar, 
                                { backgroundColor: met ? barColors[i] : "rgba(255,255,255,0.07)" }
                              ]} 
                            />
                          ))}
                        </View>
                        <Text style={styles.hintText}>Must be ≥18 characters with uppercase, number, and symbol.</Text>
                      </View>
                      <TouchableOpacity style={styles.btn} onPress={handleEmailRegister} disabled={loading}>
                        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Create Account →</Text>}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View>
                      {!otpSent ? (
                        <>
                          <View style={styles.field}>
                            <Text style={styles.label}>FULL NAME</Text>
                            <TextInput
                              style={styles.input}
                              placeholder="e.g. Sparsh Sharma"
                              placeholderTextColor="#555"
                              value={name}
                              onChangeText={setName}
                              autoCapitalize="words"
                            />
                          </View>
                          <View style={styles.field}>
                            <Text style={styles.label}>PHONE NUMBER</Text>
                            <TextInput
                              style={styles.input}
                              placeholder="98765 43210 (defaults to +91)"
                              placeholderTextColor="#555"
                              value={phone}
                              onChangeText={setPhone}
                              keyboardType="phone-pad"
                            />
                          </View>
                          <TouchableOpacity style={styles.btn} onPress={handleSendOTP} disabled={loading}>
                            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Send Verification Code →</Text>}
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <View style={styles.field}>
                            <Text style={styles.label}>ENTER 6-DIGIT CODE</Text>
                            <TextInput
                              style={[styles.input, { letterSpacing: 8, fontSize: 22, textAlign: "center", fontWeight: "700" }]}
                              placeholder="0 0 0 0 0 0"
                              placeholderTextColor="#555"
                              value={otp}
                              onChangeText={setOtp}
                              keyboardType="number-pad"
                              maxLength={6}
                            />
                          </View>
                          <TouchableOpacity style={styles.btn} onPress={handleVerifyOTP} disabled={loading}>
                            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Verify & Complete Signup</Text>}
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => { setOtpSent(false); setOtp(""); }} style={{ marginTop: 16 }}>
                            <Text style={styles.resendText}>Wrong number? Go back</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}

                  <View style={styles.divider}>
                    <View style={styles.divLine} />
                    <Text style={styles.divTxt}>OR</Text>
                    <View style={styles.divLine} />
                  </View>

                  <TouchableOpacity style={styles.googleBtn} onPress={handleGoogle} disabled={googleLoading}>
                    {googleLoading ? (
                      <ActivityIndicator color="#aaa" />
                    ) : (
                      <>
                        <Svg width="18" height="18" viewBox="0 0 48 48">
                          <Path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z" />
                          <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                          <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.8 13.5-4.7l-6.2-5.2C29.3 35.6 26.8 36.5 24 36.5c-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.8 40.1 16.4 44 24 44z" />
                          <Path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.2 5.2C41 35.6 44 30.2 44 24c0-1.3-.1-2.7-.4-4z" />
                        </Svg>
                        <Text style={styles.googleBtnText}>Continue with Google</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {!showVerifyScreen && (
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already a member? </Text>
              <Link href="/login" asChild>
                <TouchableOpacity>
                  <Text style={styles.footerLink}>Sign In</Text>
                </TouchableOpacity>
              </Link>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Stylesheet
const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  glow: {
    position: "absolute",
    width: width * 1.5,
    height: width * 1.5,
    borderRadius: width,
    backgroundColor: "rgba(108,71,255,0.07)",
    top: height / 2 - (width * 1.5) / 2,
    left: width / 2 - (width * 1.5) / 2,
  },
  wrapper: {
    width: "100%",
    maxWidth: 420,
    zIndex: 2,
    paddingVertical: 20,
  },
  head: { alignItems: "center", marginBottom: 32 },
  mark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(124,92,252,0.3)",
  },
  title: { fontSize: 26, fontWeight: "700", color: "#fff", letterSpacing: -0.5, marginBottom: 8 },
  sub: { fontSize: 14, color: "#888" },
  
  cardContainer: {
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(8,8,14,0.75)",
  },
  cardInner: { padding: 32 },

  tabs: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 4,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  tab: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.06)", borderWidth: 1 },
  tabText: { color: "#666", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#fff" },

  field: { marginBottom: 20 },
  label: { fontSize: 11, color: "#555", fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  input: {
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#fff",
  },
  pwStrength: { flexDirection: "row", gap: 4, marginTop: 8 },
  pwBar: { flex: 1, height: 3, borderRadius: 2 },
  hintText: { fontSize: 12, color: "#444", marginTop: 8, lineHeight: 18 },
  
  errText: { fontSize: 13.5, color: "#fca5a5", backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)", borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 18, overflow: "hidden" },

  btn: { width: "100%", backgroundColor: "#fff", borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 10 },
  btnPurple: { backgroundColor: "#7c5cfc" },
  btnText: { color: "#000", fontSize: 15, fontWeight: "700" },

  resendText: { color: "#666", fontSize: 13, fontWeight: "600", textAlign: "center", textDecorationLine: "underline" },

  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 22 },
  divLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.07)" },
  divTxt: { fontSize: 11, color: "#444", letterSpacing: 1, fontWeight: "600" },

  googleBtn: { width: "100%", backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  googleBtnText: { fontSize: 14, fontWeight: "600", color: "#aaa" },

  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 28 },
  footerText: { fontSize: 13, color: "#555" },
  footerLink: { color: "#fff", fontSize: 13, fontWeight: "600", borderBottomWidth: 1, borderBottomColor: "#333" },

  // Verify Screen Styles
  envelopeIcon: { width: 80, height: 80, borderRadius: 40, borderWidth: 1, borderColor: "rgba(124,92,252,0.3)", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  successTitle: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 10, letterSpacing: -0.3 },
  successDesc: { fontSize: 14, color: "#666", marginBottom: 24, lineHeight: 24, textAlign: "center" },
  stepsContainer: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 20, marginBottom: 20, width: "100%" },
  stepsLabel: { fontSize: 11, fontWeight: "700", color: "#555", letterSpacing: 0.8, marginBottom: 16 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  stepIconBox: { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  stepIconBoxHighlight: { backgroundColor: "rgba(250,204,21,0.1)", borderColor: "rgba(250,204,21,0.25)" },
  stepText: { fontSize: 13.5, fontWeight: "600", color: "#ccc", marginBottom: 3 },
  stepSub: { fontSize: 12, color: "#555", lineHeight: 18 },
  spamWarning: { flexDirection: "row", backgroundColor: "rgba(250,204,21,0.06)", borderWidth: 1, borderColor: "rgba(250,204,21,0.3)", borderStyle: "dashed", borderRadius: 12, padding: 14, marginBottom: 24, alignItems: "flex-start" },
  spamWarningText: { flex: 1, fontSize: 12.5, color: "#fbbf24", lineHeight: 20 },

  // Modal Styles
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.8)" },
  modalContent: { backgroundColor: "rgba(8,8,14,0.98)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 24, padding: 36, width: "100%", maxWidth: 420 },
  modalIcon: { fontSize: 48, textAlign: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#fff", textAlign: "center", marginBottom: 14 },
  modalLine: { fontSize: 14, color: "#999", lineHeight: 24, marginBottom: 8, textAlign: "center" },
  modalActions: { gap: 10, marginTop: 28 },
  modalBtn: { width: "100%", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnText: { fontSize: 14, fontWeight: "700" }
});