import { useState, useRef, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Modal, Alert, Switch,
  Animated, Dimensions, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  updateProfile, signOut, updatePassword,
  EmailAuthProvider, reauthenticateWithCredential,
} from "firebase/auth";
import { doc, setDoc, getDoc, collection, getDocs, query, orderBy } from "firebase/firestore";
import { auth, db } from "../../src/lib/firebase";

const SPARSH_UID = "O3FcnaQA5tgNztbkWc2FLRnYdye2";
const TODAY = new Date().toISOString().split("T")[0];
const CLOUD_NAME = "ddmuer2zp";
const UPLOAD_PRESET = "manshverse_uploads";

const MODEL_FIELDS = [
  { key: "Milkcake 2.7", color: "#a78bfa" },
  { key: "Astral 2.0",   color: "#67e8f9" },
  { key: "Impulse 1.4",  color: "#86efac" },
  { key: "Cornea 1.0",   color: "#fca5a5" },
  { key: "Nova 1.0",     color: "#fde68a" },
  { key: "Spark 1.0",    color: "#fb923c" },
];

const PLAN_META: Record<string, { name: string; color: string }> = {
  free:  { name: "Free",  color: "#666" },
  pro:   { name: "Pro",   color: "#a78bfa" },
  ultra: { name: "Ultra", color: "#67e8f9" },
};

function Toast({ msg, type }: { msg: string; type: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 100 }).start();
  }, []);
  return (
    <Animated.View style={[s.toast, type === "error" ? s.toastError : s.toastSuccess, { transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }], opacity: anim }]}>
      <Text style={[s.toastText, { color: type === "error" ? "#fca5a5" : "#4ade80" }]}>{msg}</Text>
    </Animated.View>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{title}</Text>
      <View style={s.card}>{children}</View>
    </View>
  );
}

function InfoRow({ label, value, valueColor, mono }: any) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoKey}>{label}</Text>
      <Text style={[s.infoVal, valueColor && { color: valueColor }, mono && { fontFamily: "monospace", fontSize: 11 }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function Profile() {
  const user = auth.currentUser;
  const isCreator = user?.uid === SPARSH_UID;
  const isGoogle = user?.providerData?.[0]?.providerId === "google.com";

  // Profile state
  const [name, setName] = useState(user?.displayName || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");

  // Password state
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [changingPass, setChangingPass] = useState(false);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  // User data
  const [plan, setPlan] = useState("free");
  const [planExpiry, setPlanExpiry] = useState<Date | null>(null);
  const [usageToday, setUsageToday] = useState<Record<string, number>>({});
  const [convCount, setConvCount] = useState(0);
  const [loadingData, setLoadingData] = useState(true);

  // Modals
  const [signOutModal, setSignOutModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [statsModal, setStatsModal] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const showToast = (msg: string, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load user data
  useEffect(() => {
    if (!user?.uid) return;
    const load = async () => {
      try {
        const [userSnap, usageSnap, convSnap] = await Promise.all([
          getDoc(doc(db, "users", user.uid)),
          getDoc(doc(db, "users", user.uid, "usage", TODAY)),
          getDocs(query(collection(db, "users", user.uid, "conversations"), orderBy("createdAt", "desc"))),
        ]);
        if (userSnap.exists()) {
          const d = userSnap.data();
          setPlan(d.plan || "free");
          const expiry = d.planExpiry?.toDate?.() || null;
          setPlanExpiry(expiry);
        }
        if (usageSnap.exists()) setUsageToday(usageSnap.data() as Record<string, number>);
        setConvCount(convSnap.size);
      } catch {}
      setLoadingData(false);
    };
    load();
  }, [user?.uid]);

  const totalMsgsToday = MODEL_FIELDS.reduce((s, f) => s + (usageToday[f.key] || 0), 0);
  const daysLeft = planExpiry ? Math.ceil((planExpiry.getTime() - Date.now()) / 86400000) : null;
  const planColor = PLAN_META[plan]?.color || "#666";

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateProfile(auth.currentUser!, { displayName: name.trim() });
      await setDoc(doc(db, "users", user!.uid), { name: name.trim() }, { merge: true });
      showToast("✓ Display name updated");
    } catch { showToast("Failed to update name", "error"); }
    setSaving(false);
  };

  const changePassword = async () => {
    if (!currentPass || !newPass) { showToast("Fill both fields", "error"); return; }
    if (newPass.length < 6) { showToast("Min 6 characters", "error"); return; }
    setChangingPass(true);
    try {
      const cred = EmailAuthProvider.credential(user!.email!, currentPass);
      await reauthenticateWithCredential(auth.currentUser!, cred);
      await updatePassword(auth.currentUser!, newPass);
      setCurrentPass(""); setNewPass("");
      setPasswordModal(false);
      showToast("✓ Password updated");
    } catch (err: any) {
      if (err.code === "auth/wrong-password") showToast("Wrong current password", "error");
      else if (err.code === "auth/too-many-requests") showToast("Too many attempts", "error");
      else showToast("Failed to update password", "error");
    }
    setChangingPass(false);
  };

  return (
    <View style={s.root}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* ── SIGN OUT MODAL ── */}
      <Modal visible={signOutModal} transparent animationType="fade" onRequestClose={() => setSignOutModal(false)}>
        <View style={s.overlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Sign out?</Text>
            <Text style={s.modalDesc}>You'll be signed out of Manshverse on this device.</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnGhost, { flex: 1 }]} onPress={() => setSignOutModal(false)}>
                <Text style={{ color: "#666", fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnDanger, { flex: 2 }]} onPress={() => signOut(auth)}>
                <Text style={{ color: "#fca5a5", fontWeight: "700" }}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── PASSWORD MODAL ── */}
      <Modal visible={passwordModal} transparent animationType="slide" onRequestClose={() => setPasswordModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modalBox, { width: "100%", maxWidth: 420 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
              <Text style={s.modalTitle}>Change Password</Text>
              <TouchableOpacity style={{ marginLeft: "auto" }} onPress={() => setPasswordModal(false)}>
                <Ionicons name="close" size={20} color="#555" />
              </TouchableOpacity>
            </View>
            <Text style={s.fieldLabel}>Current Password</Text>
            <View style={s.passWrap}>
              <TextInput
                style={[s.input, { flex: 1, borderWidth: 0 }]}
                value={currentPass} onChangeText={setCurrentPass}
                secureTextEntry={!showCurrentPass}
                placeholder="Enter current password" placeholderTextColor="#333"
              />
              <TouchableOpacity onPress={() => setShowCurrentPass((p) => !p)} style={s.eyeBtn}>
                <Ionicons name={showCurrentPass ? "eye-off-outline" : "eye-outline"} size={18} color="#555" />
              </TouchableOpacity>
            </View>
            <Text style={[s.fieldLabel, { marginTop: 14 }]}>New Password</Text>
            <View style={s.passWrap}>
              <TextInput
                style={[s.input, { flex: 1, borderWidth: 0 }]}
                value={newPass} onChangeText={setNewPass}
                secureTextEntry={!showNewPass}
                placeholder="Min. 6 characters" placeholderTextColor="#333"
              />
              <TouchableOpacity onPress={() => setShowNewPass((p) => !p)} style={s.eyeBtn}>
                <Ionicons name={showNewPass ? "eye-off-outline" : "eye-outline"} size={18} color="#555" />
              </TouchableOpacity>
            </View>
            {newPass.length > 0 && (
              <View style={s.strengthBar}>
                <View style={[s.strengthFill, {
                  width: `${Math.min((newPass.length / 12) * 100, 100)}%` as any,
                  backgroundColor: newPass.length < 6 ? "#ef4444" : newPass.length < 10 ? "#fbbf24" : "#4ade80",
                }]} />
              </View>
            )}
            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: 20 }, changingPass && s.primaryBtnDis]}
              onPress={changePassword}
              disabled={changingPass}
            >
              {changingPass ? <ActivityIndicator color="#000" /> : <Text style={s.primaryBtnText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── STATS MODAL ── */}
      <Modal visible={statsModal} transparent animationType="slide" onRequestClose={() => setStatsModal(false)}>
        <View style={s.overlay}>
          <View style={[s.modalBox, { width: "100%", maxWidth: 420 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
              <Text style={s.modalTitle}>Your Usage Stats</Text>
              <TouchableOpacity style={{ marginLeft: "auto" }} onPress={() => setStatsModal(false)}>
                <Ionicons name="close" size={20} color="#555" />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
              <View style={s.statMini}>
                <Text style={s.statMiniVal}>{convCount}</Text>
                <Text style={s.statMiniLabel}>Conversations</Text>
              </View>
              <View style={s.statMini}>
                <Text style={[s.statMiniVal, { color: "#4ade80" }]}>{totalMsgsToday}</Text>
                <Text style={s.statMiniLabel}>Msgs Today</Text>
              </View>
              <View style={s.statMini}>
                <Text style={[s.statMiniVal, { color: planColor }]}>{PLAN_META[plan]?.name}</Text>
                <Text style={s.statMiniLabel}>Plan</Text>
              </View>
            </View>
            <Text style={s.fieldLabel}>Model Breakdown Today</Text>
            <View style={{ gap: 10, marginTop: 10 }}>
              {MODEL_FIELDS.map((f) => {
                const used = usageToday[f.key] || 0;
                const max = used > 0 ? Math.max(...MODEL_FIELDS.map((x) => usageToday[x.key] || 0)) : 1;
                return (
                  <View key={f.key} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: f.color }} />
                    <Text style={{ fontSize: 12, color: "#888", width: 90 }}>{f.key}</Text>
                    <View style={{ flex: 1, height: 5, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 99 }}>
                      <View style={{ height: 5, borderRadius: 99, backgroundColor: f.color, width: `${(used / Math.max(max, 1)) * 100}%` as any }} />
                    </View>
                    <Text style={{ fontSize: 13, color: "#fff", fontWeight: "600", width: 20, textAlign: "right" }}>{used}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MAIN SCROLL ── */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* TOPBAR */}
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => router.push("/(tabs)/chat")} style={s.iconBtn}>
            <Ionicons name="arrow-back" size={20} color="#888" />
          </TouchableOpacity>
          <Text style={s.topTitle}>Profile</Text>
          {isCreator && (
            <TouchableOpacity onPress={() => router.push("/analytics")} style={[s.iconBtn, { backgroundColor: "rgba(124,92,252,0.1)" }]}>
              <Ionicons name="bar-chart-outline" size={18} color="#a78bfa" />
            </TouchableOpacity>
          )}
        </View>

        {/* HERO CARD */}
        <View style={s.heroCard}>
          {/* Avatar */}
          <View style={s.heroTop}>
            <TouchableOpacity style={s.avWrap} onPress={() => Alert.alert("Change Photo", "Photo upload requires Cloudinary integration.", [{ text: "OK" }])}>
              <View style={s.av}>
                {photoURL ? (
                  <Image source={{ uri: photoURL }} style={{ width: "100%", height: "100%", borderRadius: 44 }} />
                ) : (
                  <Text style={s.avText}>{(user?.displayName?.[0] || user?.email?.[0] || "U").toUpperCase()}</Text>
                )}
              </View>
              <View style={s.avCamera}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={s.heroName} numberOfLines={1}>{user?.displayName || "User"}</Text>
              <Text style={s.heroEmail} numberOfLines={1}>{user?.email}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {isCreator && (
                  <View style={s.badgeCreator}><Text style={s.badgeCreatorText}>✦ Creator</Text></View>
                )}
                <View style={[s.badge, { borderColor: `${planColor}40`, backgroundColor: `${planColor}10` }]}>
                  <Text style={[s.badgeText, { color: planColor }]}>{PLAN_META[plan]?.name?.toUpperCase()}</Text>
                </View>
                <View style={s.badge}>
                  <Text style={s.badgeText}>{isGoogle ? "Google" : "Email"}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Quick stats strip */}
          {loadingData ? (
            <ActivityIndicator color="#555" style={{ marginTop: 20 }} />
          ) : (
            <TouchableOpacity style={s.statsStrip} onPress={() => setStatsModal(true)}>
              <View style={s.statItem}>
                <Text style={s.statVal}>{convCount}</Text>
                <Text style={s.statLabel}>Chats</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={[s.statVal, { color: "#4ade80" }]}>{totalMsgsToday}</Text>
                <Text style={s.statLabel}>Today</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={[s.statVal, { color: planColor }]}>{PLAN_META[plan]?.name}</Text>
                <Text style={s.statLabel}>Plan</Text>
              </View>
              {daysLeft !== null && (
                <>
                  <View style={s.statDivider} />
                  <View style={s.statItem}>
                    <Text style={[s.statVal, daysLeft <= 3 && { color: "#fbbf24" }]}>{daysLeft}d</Text>
                    <Text style={s.statLabel}>Expires</Text>
                  </View>
                </>
              )}
              <View style={{ marginLeft: "auto" }}>
                <Ionicons name="chevron-forward" size={14} color="#333" />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* EXPLORE */}
        <Section title="EXPLORE">
          <TouchableOpacity style={s.menuRow} onPress={() => router.push("/personas")}>
            <View style={[s.menuIcon, { backgroundColor: "rgba(167,139,250,0.1)" }]}>
              <Text style={{ fontSize: 18 }}>👤</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.menuTitle}>Personas & Avatars</Text>
              <Text style={s.menuSub}>Historical, professional & fictional characters</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </TouchableOpacity>
          <View style={s.rowDivider} />
          <TouchableOpacity style={s.menuRow} onPress={() => router.push("/council")}>
            <View style={[s.menuIcon, { backgroundColor: "rgba(124,92,252,0.1)" }]}>
              <Text style={{ fontSize: 18 }}>⚔️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.menuTitle}>Council of Minds</Text>
              <Text style={s.menuSub}>Three experts debate your question</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </TouchableOpacity>
        </Section>

        {/* PROFILE SETTINGS */}
        <Section title="PROFILE">
          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>Display Name</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#333"
            />
          </View>
          <View style={[s.fieldWrap, { marginTop: 14 }]}>
            <Text style={s.fieldLabel}>Email Address</Text>
            <TextInput
              style={[s.input, { color: "#555" }]}
              value={user?.email || ""}
              editable={false}
            />
          </View>
          <TouchableOpacity
            style={[s.primaryBtn, { marginTop: 16 }, (saving || !name.trim()) && s.primaryBtnDis]}
            onPress={saveName}
            disabled={saving || !name.trim()}
          >
            {saving ? <ActivityIndicator color="#000" /> : <Text style={s.primaryBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </Section>

        {/* SECURITY */}
        <Section title="SECURITY">
          {isGoogle ? (
            <View style={s.noteBox}>
              <Ionicons name="logo-google" size={16} color="#74b9ff" />
              <Text style={s.noteText}>You signed in with Google. Password management is handled through your Google account.</Text>
            </View>
          ) : (
            <TouchableOpacity style={s.menuRow} onPress={() => setPasswordModal(true)}>
              <View style={[s.menuIcon, { backgroundColor: "rgba(251,191,36,0.1)" }]}>
                <Ionicons name="lock-closed-outline" size={18} color="#fbbf24" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuTitle}>Change Password</Text>
                <Text style={s.menuSub}>Update your account password</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#444" />
            </TouchableOpacity>
          )}
          <View style={s.rowDivider} />
          <View style={s.menuRow}>
            <View style={[s.menuIcon, { backgroundColor: "rgba(74,222,128,0.1)" }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#4ade80" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.menuTitle}>Email Verification</Text>
              <Text style={[s.menuSub, { color: user?.emailVerified ? "#4ade80" : "#fbbf24" }]}>
                {user?.emailVerified ? "✓ Verified" : "Not verified"}
              </Text>
            </View>
          </View>
        </Section>

        {/* ACCOUNT INFO */}
        <Section title="ACCOUNT INFO">
          <InfoRow label="User ID" value={`${user?.uid?.slice(0, 20)}...`} mono />
          <InfoRow label="Sign-in method" value={isGoogle ? "Google" : "Email & Password"} />
          <InfoRow label="Account type" value={isCreator ? "✦ Creator" : "Standard"} valueColor={isCreator ? "#c4b5fd" : "#555"} />
          <InfoRow label="Plan" value={PLAN_META[plan]?.name || "Free"} valueColor={planColor} />
          {planExpiry && (
            <InfoRow
              label="Plan expires"
              value={planExpiry.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              valueColor={daysLeft !== null && daysLeft <= 3 ? "#fbbf24" : undefined}
            />
          )}
          <InfoRow label="Platform" value="Manshverse · 14 March 2026" />
        </Section>

        {/* CREATOR TOOLS */}
        {isCreator && (
          <Section title="CREATOR TOOLS">
            <TouchableOpacity style={s.menuRow} onPress={() => router.push("/analytics")}>
              <View style={[s.menuIcon, { backgroundColor: "rgba(124,92,252,0.15)" }]}>
                <Ionicons name="bar-chart-outline" size={18} color="#a78bfa" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuTitle, { color: "#c4b5fd" }]}>Analytics Dashboard</Text>
                <Text style={s.menuSub}>Users, plans, requests, chat inspector</Text>
              </View>
              <View style={s.badgeCreator}>
                <Text style={s.badgeCreatorText}>Creator</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#444" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
            
            <View style={s.rowDivider} />
            
            <View style={s.menuRow}>
              <View style={[s.menuIcon, { backgroundColor: "rgba(103,232,249,0.1)" }]}>
                <Ionicons name="people-outline" size={18} color="#67e8f9" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuTitle}>Creator UID</Text>
                <Text style={[s.menuSub, { fontFamily: "monospace", fontSize: 11 }]}>
                  {SPARSH_UID.slice(0, 24)}...
                </Text>
              </View>
            </View>
          </Section>
        )}

        {/* ABOUT */}
        <Section title="ABOUT">
          <TouchableOpacity style={s.menuRow}>
            <View style={[s.menuIcon, { backgroundColor: "rgba(255,255,255,0.04)" }]}>
              <Ionicons name="information-circle-outline" size={18} color="#888" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.menuTitle}>App Version</Text>
              <Text style={s.menuSub}>Manshverse Mobile 1.0.0</Text>
            </View>
          </TouchableOpacity>
          <View style={s.rowDivider} />
          <TouchableOpacity style={s.menuRow}>
            <View style={[s.menuIcon, { backgroundColor: "rgba(255,255,255,0.04)" }]}>
              <Ionicons name="mail-outline" size={18} color="#888" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.menuTitle}>Support</Text>
              <Text style={s.menuSub}>manshverse@gmail.com</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </TouchableOpacity>
          <View style={s.rowDivider} />
          <TouchableOpacity style={s.menuRow}> {/* 🔴 FIX: Changed View to TouchableOpacity here */}
            <View style={[s.menuIcon, { backgroundColor: "rgba(255,255,255,0.04)" }]}>
              <Ionicons name="globe-outline" size={18} color="#888" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.menuTitle}>Website</Text>
              <Text style={s.menuSub}>manshverse.vercel.app</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </TouchableOpacity>
        </Section>

      <Section title="PLAN">
  <TouchableOpacity style={s.menuRow} onPress={() => router.push("/upgrade")}>
    <View style={[s.menuIcon, { backgroundColor: "rgba(250,204,21,0.1)" }]}>
      <Ionicons name="star-outline" size={18} color="#facc15" />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={s.menuTitle}>Upgrade Plan</Text>
      <Text style={s.menuSub}>Unlock more messages & features</Text>
    </View>
    <View style={{ backgroundColor: "rgba(250,204,21,0.1)", borderWidth: 1, borderColor: "rgba(250,204,21,0.3)", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", color: "#facc15" }}>UPGRADE</Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color="#444" style={{ marginLeft: 6 }} />
  </TouchableOpacity>
</Section>
      
        {/* DANGER ZONE */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>SESSION</Text>
          <View style={[s.card, { borderColor: "rgba(239,68,68,0.15)", backgroundColor: "rgba(127,29,29,0.07)" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <View style={[s.menuIcon, { backgroundColor: "rgba(239,68,68,0.1)" }]}>
                <Ionicons name="log-out-outline" size={18} color="#fca5a5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuTitle, { color: "#fca5a5" }]}>Sign Out</Text>
                <Text style={s.menuSub}>Sign out of this device</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" }]}
              onPress={() => setSignOutModal(true)}
            >
              <Text style={[s.primaryBtnText, { color: "#fca5a5" }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <Text style={{ fontSize: 11, color: "#222", letterSpacing: 0.8, textTransform: "uppercase" }}>
            Founded by Sparsh · 2026
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  // Toast
  toast: { position: "absolute", bottom: 40, left: 20, right: 20, padding: 14, borderRadius: 14, zIndex: 999, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16 },
  toastSuccess: { backgroundColor: "rgba(4,120,87,0.95)", borderWidth: 1, borderColor: "rgba(74,222,128,0.3)" },
  toastError: { backgroundColor: "rgba(127,29,29,0.95)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" },
  toastText: { fontWeight: "600", fontSize: 14 },

  // Overlay
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalBox: { backgroundColor: "rgba(10,10,16,0.99)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400 },
  modalTitle: { fontSize: 19, fontWeight: "700", color: "#fff", marginBottom: 10 },
  modalDesc: { fontSize: 14, color: "#555", lineHeight: 22, marginBottom: 24 },
  modalBtn: { paddingVertical: 13, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalBtnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  modalBtnDanger: { backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" },

  // Topbar
  topbar: { flexDirection: "row", alignItems: "center", paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#0a0a0a", justifyContent: "space-between" },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  topTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },

  // Hero
  heroCard: { margin: 16, backgroundColor: "rgba(10,10,15,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 22, padding: 20 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 16, marginBottom: 20 },
  avWrap: { position: "relative" },
  av: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#1a0d2e", borderWidth: 2, borderColor: "rgba(124,92,252,0.4)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avText: { fontSize: 28, fontWeight: "800", color: "#fff" },
  avCamera: { position: "absolute", bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: "#7c5cfc", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#000" },
  heroName: { fontSize: 19, fontWeight: "700", color: "#fff", letterSpacing: -0.5, marginBottom: 4 },
  heroEmail: { fontSize: 13, color: "#444", marginBottom: 2 },
  badge: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#555" },
  badgeCreator: { backgroundColor: "rgba(124,92,252,0.12)", borderWidth: 1, borderColor: "rgba(124,92,252,0.3)", borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3 },
  badgeCreatorText: { fontSize: 10, fontWeight: "700", color: "#c4b5fd" },

  // Stats strip
  statsStrip: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 14 },
  statItem: { alignItems: "center", flex: 1 },
  statVal: { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 3 },
  statLabel: { fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 0.5 },
  statDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.06)" },

  // Mini stats (modal)
  statMini: { flex: 1, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 14, alignItems: "center" },
  statMiniVal: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 4 },
  statMiniLabel: { fontSize: 11, color: "#555" },

  // Section
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionLabel: { fontSize: 10.5, color: "#333", textTransform: "uppercase", letterSpacing: 0.9, fontWeight: "600", marginBottom: 10, paddingLeft: 2 },
  card: { backgroundColor: "rgba(8,8,14,0.8)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 18, padding: 18 },

  // Menu rows
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4 },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  menuTitle: { fontSize: 15, fontWeight: "600", color: "#ddd", marginBottom: 3 },
  menuSub: { fontSize: 12, color: "#555" },
  rowDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.04)", marginVertical: 12 },

  // Info rows
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  infoKey: { fontSize: 13, color: "#444" },
  infoVal: { fontSize: 13, color: "#666", flex: 1, textAlign: "right" },

  // Fields
  fieldWrap: {},
  fieldLabel: { fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600", marginBottom: 8 },
  input: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 12, padding: 14, fontSize: 14, color: "#e0e0e0" },
  passWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingHorizontal: 14 },
  eyeBtn: { padding: 10 },
  strengthBar: { height: 4, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 99, marginTop: 8, overflow: "hidden" },
  strengthFill: { height: 4, borderRadius: 99 },

  // Buttons
  primaryBtn: { backgroundColor: "#fff", borderRadius: 12, padding: 15, alignItems: "center", justifyContent: "center" },
  primaryBtnDis: { backgroundColor: "rgba(255,255,255,0.1)" },
  primaryBtnText: { color: "#000", fontWeight: "700", fontSize: 15 },

  // Note box
  noteBox: { flexDirection: "row", gap: 12, backgroundColor: "rgba(116,185,255,0.05)", borderWidth: 1, borderColor: "rgba(116,185,255,0.15)", borderRadius: 12, padding: 14, alignItems: "flex-start" },
  noteText: { fontSize: 13.5, color: "#555", lineHeight: 22, flex: 1 },
});