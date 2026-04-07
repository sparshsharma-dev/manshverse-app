import { useState, useEffect, useContext } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Modal, Alert, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  collection, collectionGroup, doc, getDoc, getDocs,
  serverTimestamp, setDoc, deleteDoc, query, orderBy, limit,
} from "firebase/firestore";
import { auth, db } from "../src/lib/firebase";
import { getUsageDayKey } from "../src/lib/account";
import {
  calculatePlanExpiry,
  DEFAULT_PLAN_LIMITS,
  limitInputValue,
  normalizePlanLimits,
  serializePlanLimits,
} from "../src/lib/plans";

const SPARSH_UID = "O3FcnaQA5tgNztbkWc2FLRnYdye2";
const TODAY = getUsageDayKey();

const PLAN_META: Record<string, { name: string; color: string; amount: number }> = {
  free:  { name: "Free",  color: "#666",    amount: 0    },
  pro:   { name: "Pro",   color: "#a78bfa", amount: 99   },
  ultra: { name: "Ultra", color: "#67e8f9", amount: 249  },
};
const PLAN_ORDER = ["free", "pro", "ultra"];

const MODEL_FIELDS = [
  { key: "Milkcake 2.7", color: "#a78bfa" },
  { key: "Astral 2.0",   color: "#67e8f9" },
  { key: "Impulse 1.4",  color: "#86efac" },
  { key: "Cornea 1.0",   color: "#fca5a5" },
  { key: "Nova 1.0",     color: "#fde68a" },
  { key: "Spark 1.0",    color: "#fb923c" },
];

const getPlanSnapshot = (data: any) => {
  const plan = data?.plan || "free";
  const expiry = data?.planExpiry?.toDate?.() || null;
  if (plan !== "free" && expiry && expiry < new Date()) return { plan: "free", planExpiryDate: null };
  return { plan, planExpiryDate: expiry };
};

const fmtDate = (val: any) => {
  if (!val) return "—";
  const d = val?.toDate?.() || (val instanceof Date ? val : new Date(val));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};
const fmtDateTime = (val: any) => {
  if (!val) return "—";
  const d = val?.toDate?.() || (val instanceof Date ? val : new Date(val));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};
const daysLeft = (val: any) => {
  if (!val) return null;
  const d = val?.toDate?.() || (val instanceof Date ? val : new Date(val));
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
};

const makeDrafts = (limits: any = DEFAULT_PLAN_LIMITS) => {
  const normalized = normalizePlanLimits(limits);
  const drafts: Record<string, Record<string, string>> = {};
  for (const planId of PLAN_ORDER) {
    drafts[planId] = {};
    for (const field of MODEL_FIELDS) {
      drafts[planId][field.key] = limitInputValue(normalized[planId][field.key]);
    }
  }
  return drafts;
};

// ── CHIP ──────────────────────────────────────────────────
function Chip({ label, type }: { label: string; type: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    free:     { bg: "rgba(255,255,255,0.04)", text: "#555",    border: "rgba(255,255,255,0.08)" },
    pro:      { bg: "rgba(167,139,250,0.1)",  text: "#a78bfa", border: "rgba(167,139,250,0.25)" },
    ultra:    { bg: "rgba(103,232,249,0.1)",  text: "#67e8f9", border: "rgba(103,232,249,0.25)" },
    banned:   { bg: "rgba(239,68,68,0.1)",    text: "#fca5a5", border: "rgba(239,68,68,0.3)" },
    pending:  { bg: "#1a1408",                text: "#fbbf24", border: "#33270b" },
    approved: { bg: "#0a1710",                text: "#4ade80", border: "#12311f" },
    rejected: { bg: "#170b0b",                text: "#f87171", border: "#341515" },
  };
  const c = colors[type] || colors.free;
  return (
    <View style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", color: c.text }}>{label.toUpperCase()}</Text>
    </View>
  );
}

// ── STAT CARD ─────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: any) {
  return (
    <View style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, accent && { color: accent }]}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ── SECTION ───────────────────────────────────────────────
function Section({ title, children }: any) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function Analytics() {
  const user = auth.currentUser;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("overview");
  const [toast, setToast] = useState("");

  // Data
  const [stats, setStats] = useState<any>({
    totalUsers: 0, totalConvs: 0, todayUsage: {}, planDist: { free: 0, pro: 0, ultra: 0 },
    activeToday: 0, paidUsers: 0, topUsers: [], recentSignups: [], expiringSoon: [],
    requests: [], pendingRequests: [], requestsByStatus: { pending: 0, approved: 0, rejected: 0 },
  });
  const [users, setUsers] = useState<any[]>([]);
  const [planLimits, setPlanLimits] = useState<any>(DEFAULT_PLAN_LIMITS);
  const [limitDrafts, setLimitDrafts] = useState<any>(makeDrafts(DEFAULT_PLAN_LIMITS));
  const [platformSettings, setPlatformSettings] = useState({ maintenanceMode: false, globalNotice: "" });

  // Users tab
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userDetailTab, setUserDetailTab] = useState("plan");
  const [manualPlan, setManualPlan] = useState("pro");
  const [manualDays, setManualDays] = useState("30");
  const [manualBusy, setManualBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [limitsBusy, setLimitsBusy] = useState(false);
  const [requestEdits, setRequestEdits] = useState<any>({});

  // Chat inspector
  const [logUserSearch, setLogUserSearch] = useState("");
  const [logSelectedUser, setLogSelectedUser] = useState<any>(null);
  const [logConvs, setLogConvs] = useState<any[]>([]);
  const [logSelectedConv, setLogSelectedConv] = useState<any>(null);
  const [logMessages, setLogMessages] = useState<any[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  // Modals
  const [confirmModal, setConfirmModal] = useState<any>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const isCreator = user?.uid === SPARSH_UID;

  const loadData = async () => {
    try {
      const [usersSnap, settingsSnap, requestsSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDoc(doc(db, "settings", "platform")),
        getDocs(collectionGroup(db, "planRequests")),
      ]);

      const settingsData = settingsSnap.exists() ? settingsSnap.data() : {};
      const nextPlanLimits = normalizePlanLimits(settingsData.planLimits || DEFAULT_PLAN_LIMITS);
      setPlatformSettings({
        maintenanceMode: settingsData.maintenanceMode || false,
        globalNotice: settingsData.globalNotice || "",
      });
      setPlanLimits(nextPlanLimits);
      setLimitDrafts(makeDrafts(nextPlanLimits));

      const requests = requestsSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id, userId: data.userId || d.ref.parent.parent?.id || "",
          requesterName: data.requesterName || "User", requesterEmail: data.requesterEmail || "",
          requestedPlan: data.requestedPlan || "pro", approvedPlan: data.approvedPlan || null,
          amount: data.amount || 0, status: data.status || "pending",
          durationDays: data.durationDays || 30, createdAt: data.createdAt,
        };
      }).sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      setRequestEdits(requests.reduce((acc: any, r: any) => {
        acc[r.id] = { plan: r.requestedPlan || "pro", days: String(r.durationDays || 30) };
        return acc;
      }, {}));

      const baseUsers = usersSnap.docs.map((d) => {
        const data = d.data();
        const snapshot = getPlanSnapshot(data);
        return {
          id: d.id, name: data.name || data.email || "User", email: data.email || "",
          createdAt: data.createdAt,
          plan: snapshot.plan, planExpiry: snapshot.planExpiryDate,
          isBanned: data.isBanned || false,
          latestRequest: requests.find((r: any) => r.userId === d.id) || null,
          convCount: 0, usageToday: {}, msgsToday: 0,
        };
      });

      const enriched = await Promise.all(baseUsers.map(async (u: any) => {
        let convCount = 0, usageData: any = {};
        try { convCount = (await getDocs(collection(db, "users", u.id, "conversations"))).size; } catch {}
        try {
          const us = await getDoc(doc(db, "users", u.id, "usage", TODAY));
          usageData = us.exists() ? us.data() : {};
        } catch {}
        const msgsToday = MODEL_FIELDS.reduce((s, f) => s + Number(usageData[f.key] || 0), 0);
        return { ...u, convCount, usageToday: usageData, msgsToday };
      }));

      enriched.sort((a: any, b: any) => b.msgsToday - a.msgsToday);

      const todayUsage: any = {}, planDist: any = { free: 0, pro: 0, ultra: 0 };
      let totalConvs = 0;
      for (const u of enriched) {
        planDist[u.plan] = (planDist[u.plan] || 0) + 1;
        totalConvs += u.convCount;
        for (const f of MODEL_FIELDS) todayUsage[f.key] = (todayUsage[f.key] || 0) + Number(u.usageToday[f.key] || 0);
      }

      setUsers(enriched);
      setStats({
        totalUsers: enriched.length, totalConvs, todayUsage, planDist,
        activeToday: enriched.filter((u: any) => u.msgsToday > 0).length,
        paidUsers: enriched.filter((u: any) => u.plan !== "free").length,
        topUsers: [...enriched].filter((u: any) => u.msgsToday > 0).slice(0, 8),
        recentSignups: [...enriched].sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 8),
        expiringSoon: enriched.filter((u: any) => u.plan !== "free" && u.planExpiry && daysLeft(u.planExpiry) !== null && (daysLeft(u.planExpiry) || 0) <= 7).slice(0, 8),
        requests,
        pendingRequests: requests.filter((r: any) => r.status === "pending"),
        requestsByStatus: requests.reduce((acc: any, r: any) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, { pending: 0, approved: 0, rejected: 0 }),
      });
    } catch (e) {
      showToast("Failed to load data");
    }
  };

  useEffect(() => {
    if (!isCreator) {
      router.replace("/(tabs)/chat");
      return;
    }
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [isCreator]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const applyPlan = async (userId: string, plan: string, days: string) => {
    const expiryDate = plan === "free" ? null : calculatePlanExpiry(days);
    await setDoc(doc(db, "users", userId), {
      plan, planExpiry: expiryDate, planGrantedAt: serverTimestamp(), planGrantedBy: user?.uid,
    }, { merge: true });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, plan, planExpiry: expiryDate } : u));
    if (selectedUser?.id === userId) setSelectedUser((p: any) => ({ ...p, plan, planExpiry: expiryDate }));
  };

  const handleRequestDecision = async (request: any, status: string) => {
    setBusyId(request.id);
    try {
      const edit = requestEdits[request.id] || { plan: request.requestedPlan, days: "30" };
      if (status === "approved") await applyPlan(request.userId, edit.plan, edit.days);
      await setDoc(doc(db, "users", request.userId, "planRequests", request.id), {
        status, approvedPlan: status === "approved" ? edit.plan : null,
        durationDays: Number(edit.days), handledAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast(status === "approved" ? "✅ Approved & applied" : "❌ Rejected");
      await loadData();
    } catch { showToast("⚠️ Action failed"); }
    setBusyId("");
  };

  const handleManualGrant = async () => {
    if (!selectedUser) return;
    setManualBusy(true);
    try {
      await applyPlan(selectedUser.id, manualPlan, manualDays);
      showToast(`⚡ Applied ${manualPlan.toUpperCase()} for ${manualDays} days`);
    } catch { showToast("⚠️ Failed"); }
    setManualBusy(false);
  };

  const handleToggleBan = async () => {
    if (!selectedUser) return;
    const newBan = !selectedUser.isBanned;
    try {
      await setDoc(doc(db, "users", selectedUser.id), { isBanned: newBan }, { merge: true });
      setSelectedUser((p: any) => ({ ...p, isBanned: newBan }));
      setUsers((prev) => prev.map((u) => u.id === selectedUser.id ? { ...u, isBanned: newBan } : u));
      showToast(newBan ? `🚫 Banned` : `✅ Unbanned`);
    } catch { showToast("⚠️ Failed"); }
    setConfirmModal(null);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    try {
      await deleteDoc(doc(db, "users", selectedUser.id));
      setUsers((prev) => prev.filter((u) => u.id !== selectedUser.id));
      setSelectedUser(null);
      showToast("🗑️ Deleted");
    } catch { showToast("⚠️ Failed"); }
    setConfirmModal(null);
  };

  const handleResetUsage = async () => {
    if (!selectedUser) return;
    try {
      await setDoc(doc(db, "users", selectedUser.id, "usage", TODAY), {}, { merge: false });
      showToast("🔄 Usage reset");
    } catch { showToast("⚠️ Failed"); }
    setConfirmModal(null);
  };

  const handleSavePlatform = async () => {
    setLimitsBusy(true);
    try {
      const normalized = normalizePlanLimits(limitDrafts);
      await setDoc(doc(db, "settings", "platform"), {
        planLimits: serializePlanLimits(normalized), maintenanceMode: platformSettings.maintenanceMode,
        globalNotice: platformSettings.globalNotice,
        updatedAt: serverTimestamp(), updatedBy: user?.uid,
      }, { merge: true });
      setPlanLimits(normalized);
      setLimitDrafts(makeDrafts(normalized));
      showToast("✅ Platform settings saved");
    } catch { showToast("⚠️ Save failed"); }
    setLimitsBusy(false);
  };

  const handleSelectLogUser = async (u: any) => {
    setLogSelectedUser(u); setLogSelectedConv(null); setLogMessages([]); setLogLoading(true);
    try {
      const q = query(collection(db, "users", u.id, "conversations"), orderBy("createdAt", "desc"), limit(30));
      const snap = await getDocs(q);
      setLogConvs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch { showToast("Failed to load convs"); }
    setLogLoading(false);
  };

  const handleSelectLogConv = async (conv: any) => {
    setLogSelectedConv(conv); setLogLoading(true);
    try {
      const q = query(collection(db, "users", logSelectedUser.id, "conversations", conv.id, "messages"), orderBy("createdAt", "asc"), limit(50));
      const snap = await getDocs(q);
      setLogMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch { showToast("Failed to load messages"); }
    setLogLoading(false);
  };

  const TABS = [
    { id: "overview",  label: "📊" },
    { id: "requests",  label: `💳${stats.pendingRequests?.length > 0 ? ` ${stats.pendingRequests.length}` : ""}` },
    { id: "users",     label: "👥" },
    { id: "inspector", label: "🔍" },
    { id: "platform",  label: "⚙️" },
  ];

  const maxUsage = Math.max(...Object.values(stats.todayUsage || {}).map(Number), 1);
  const filteredUsers = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase()));
  const filteredLogUsers = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(logUserSearch.toLowerCase()));

  if (!isCreator) return null;

  return (
    <View style={s.root}>
      {/* TOAST */}
      {!!toast && (
        <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>
      )}

      {/* CONFIRM MODAL */}
      <Modal visible={!!confirmModal} transparent animationType="fade" onRequestClose={() => setConfirmModal(null)}>
        <View style={s.overlay}>
          <View style={s.confirmBox}>
            <Text style={s.confirmTitle}>{confirmModal?.title}</Text>
            <Text style={s.confirmDesc}>{confirmModal?.desc}</Text>
            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end" }}>
              <TouchableOpacity style={s.btnOutline} onPress={() => setConfirmModal(null)}>
                <Text style={{ color: "#888", fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnDanger, confirmModal?.safe && s.btnSuccess]} onPress={confirmModal?.onConfirm}>
                <Text style={{ color: confirmModal?.safe ? "#4ade80" : "#fca5a5", fontWeight: "700" }}>{confirmModal?.confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* TOPBAR */}
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={18} color="#888" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.topTitle}>Creator Console</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={s.backBtn}>
          <Ionicons name="refresh" size={18} color="#888" />
        </TouchableOpacity>
      </View>

      {/* TAB BAR */}
      <View style={s.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[s.tabBtn, tab === t.id && s.tabBtnActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[s.tabBtnText, tab === t.id && { color: "#fff" }]}>{t.label}</Text>
            {t.id === "overview" && <Text style={[s.tabLabel, tab === t.id && { color: "#fff" }]}>Overview</Text>}
            {t.id === "requests" && <Text style={[s.tabLabel, tab === t.id && { color: "#fff" }]}>Requests</Text>}
            {t.id === "users" && <Text style={[s.tabLabel, tab === t.id && { color: "#fff" }]}>Users</Text>}
            {t.id === "inspector" && <Text style={[s.tabLabel, tab === t.id && { color: "#fff" }]}>Logs</Text>}
            {t.id === "platform" && <Text style={[s.tabLabel, tab === t.id && { color: "#fff" }]}>Platform</Text>}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#a78bfa" />
          <Text style={{ color: "#555", marginTop: 12, fontSize: 13 }}>Loading dashboard...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />}
        >

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <>
              {/* Stat grid */}
              <View style={s.statGrid}>
                <StatCard label="Total Users" value={stats.totalUsers} sub={`${stats.paidUsers} paid`} />
                <StatCard label="Active Today" value={stats.activeToday} accent="#4ade80" sub={`of ${stats.totalUsers}`} />
                <StatCard label="Msgs Today" value={Object.values(stats.todayUsage || {}).reduce((a: any, b: any) => a + b, 0)} />
                <StatCard label="Pending" value={stats.pendingRequests?.length || 0} accent={stats.pendingRequests?.length > 0 ? "#fbbf24" : undefined} />
              </View>

              <Section title="Model Usage Today">
                {MODEL_FIELDS.map((f) => (
                  <View key={f.key} style={s.barRow}>
                    <View style={[s.barDot, { backgroundColor: f.color }]} />
                    <Text style={s.barLabel}>{f.key}</Text>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${((stats.todayUsage[f.key] || 0) / maxUsage) * 100}%` as any, backgroundColor: f.color }]} />
                    </View>
                    <Text style={s.barCount}>{stats.todayUsage[f.key] || 0}</Text>
                  </View>
                ))}
              </Section>

              <Section title="Plan Distribution">
                {PLAN_ORDER.map((p) => (
                  <View key={p} style={s.barRow}>
                    <View style={[s.barDot, { backgroundColor: PLAN_META[p].color }]} />
                    <Text style={[s.barLabel, { color: PLAN_META[p].color }]}>{PLAN_META[p].name}</Text>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${stats.totalUsers ? ((stats.planDist[p] || 0) / stats.totalUsers) * 100 : 0}%` as any, backgroundColor: PLAN_META[p].color }]} />
                    </View>
                    <Text style={s.barCount}>{stats.planDist[p] || 0}</Text>
                  </View>
                ))}
              </Section>

              <Section title="Most Active Today">
                {stats.topUsers?.length === 0 ? (
                  <Text style={s.empty}>No active users today</Text>
                ) : stats.topUsers?.map((u: any) => (
                  <View key={u.id} style={s.listRow}>
                    <View style={s.avatar}><Text style={s.avatarText}>{(u.name?.[0] || "?").toUpperCase()}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.listName}>{u.name}</Text>
                      <Text style={s.listSub}>{u.email}</Text>
                    </View>
                    <Text style={{ color: "#4ade80", fontWeight: "700", fontSize: 15 }}>{u.msgsToday}</Text>
                  </View>
                ))}
              </Section>

              <Section title="Expiring Soon (≤7 days)">
                {stats.expiringSoon?.length === 0 ? (
                  <Text style={s.empty}>No plans expiring soon ✅</Text>
                ) : stats.expiringSoon?.map((u: any) => (
                  <View key={u.id} style={s.listRow}>
                    <View style={s.avatar}><Text style={s.avatarText}>{(u.name?.[0] || "?").toUpperCase()}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.listName}>{u.name}</Text>
                      <Text style={s.listSub}>{u.email}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Chip label={u.plan} type={u.plan} />
                      <Text style={{ fontSize: 11, color: "#fbbf24" }}>{daysLeft(u.planExpiry)}d left</Text>
                    </View>
                  </View>
                ))}
              </Section>
            </>
          )}

          {/* ── REQUESTS ── */}
          {tab === "requests" && (
            <>
              <Section title={`Pending (${stats.pendingRequests?.length || 0})`}>
                {stats.pendingRequests?.length === 0 ? (
                  <Text style={s.empty}>✅ All clear. No pending requests.</Text>
                ) : stats.pendingRequests?.map((r: any) => {
                  const edit = requestEdits[r.id] || { plan: r.requestedPlan, days: "30" };
                  return (
                    <View key={r.id} style={s.reqCard}>
                      <View style={s.listRow}>
                        <View style={s.avatar}><Text style={s.avatarText}>{(r.requesterName?.[0] || "?").toUpperCase()}</Text></View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.listName}>{r.requesterName}</Text>
                          <Text style={s.listSub}>{r.requesterEmail}</Text>
                          <Text style={{ fontSize: 12, color: "#a78bfa", fontWeight: "600", marginTop: 2 }}>₹{r.amount} · {fmtDateTime(r.createdAt)}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        {PLAN_ORDER.map((p) => (
                          <TouchableOpacity
                            key={p}
                            style={[s.pillBtn, edit.plan === p && { backgroundColor: "rgba(108,71,255,0.2)", borderColor: "#7c5cfc" }]}
                            onPress={() => setRequestEdits((prev: any) => ({ ...prev, [r.id]: { ...edit, plan: p } }))}
                          >
                            <Text style={{ color: edit.plan === p ? "#c4b5fd" : "#666", fontSize: 12, fontWeight: "600" }}>{PLAN_META[p].name}</Text>
                          </TouchableOpacity>
                        ))}
                        <TextInput
                          style={s.daysInput}
                          value={edit.days}
                          onChangeText={(v) => setRequestEdits((prev: any) => ({ ...prev, [r.id]: { ...edit, days: v } }))}
                          keyboardType="numeric"
                          placeholder="Days"
                          placeholderTextColor="#444"
                        />
                      </View>
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                        <TouchableOpacity
                          style={[s.actionBtn, s.actionBtnSuccess, { flex: 1 }]}
                          onPress={() => handleRequestDecision(r, "approved")}
                          disabled={busyId === r.id}
                        >
                          <Text style={{ color: "#4ade80", fontWeight: "700", fontSize: 13 }}>
                            {busyId === r.id ? "..." : "✓ Approve"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionBtn, s.actionBtnDanger, { flex: 1 }]}
                          onPress={() => handleRequestDecision(r, "rejected")}
                          disabled={busyId === r.id}
                        >
                          <Text style={{ color: "#fca5a5", fontWeight: "700", fontSize: 13 }}>✗ Reject</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </Section>

              <Section title="Processed History">
                {stats.requests?.filter((r: any) => r.status !== "pending").length === 0 ? (
                  <Text style={s.empty}>No processed requests yet</Text>
                ) : stats.requests?.filter((r: any) => r.status !== "pending").slice(0, 15).map((r: any) => (
                  <View key={r.id} style={s.listRow}>
                    <View style={s.avatar}><Text style={s.avatarText}>{(r.requesterName?.[0] || "?").toUpperCase()}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.listName}>{r.requesterName}</Text>
                      <Text style={s.listSub}>{fmtDateTime(r.createdAt)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Chip label={r.approvedPlan || r.requestedPlan} type={r.approvedPlan || r.requestedPlan} />
                      <Chip label={r.status} type={r.status} />
                    </View>
                  </View>
                ))}
              </Section>
            </>
          )}

          {/* ── USERS ── */}
          {tab === "users" && (
            <>
              <TextInput
                style={s.searchInput}
                value={userSearch}
                onChangeText={setUserSearch}
                placeholder="Search by name or email..."
                placeholderTextColor="#444"
              />

              {!selectedUser ? (
                <Section title={`${filteredUsers.length} Users`}>
                  {filteredUsers.map((u: any) => (
                    <TouchableOpacity key={u.id} style={s.listRow} onPress={() => { setSelectedUser(u); setUserDetailTab("plan"); }}>
                      <View style={s.avatar}><Text style={s.avatarText}>{(u.name?.[0] || "?").toUpperCase()}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.listName}>{u.name}</Text>
                        <Text style={s.listSub}>{u.email}</Text>
                        <Text style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{u.convCount} convs · {u.msgsToday} msgs today</Text>
                      </View>
                      <Chip label={u.isBanned ? "banned" : u.plan} type={u.isBanned ? "banned" : u.plan} />
                    </TouchableOpacity>
                  ))}
                </Section>
              ) : (
                <View>
                  {/* User header */}
                  <TouchableOpacity style={s.backRow} onPress={() => setSelectedUser(null)}>
                    <Ionicons name="arrow-back" size={16} color="#888" />
                    <Text style={{ color: "#888", fontSize: 13, marginLeft: 6 }}>All Users</Text>
                  </TouchableOpacity>

                  <View style={[s.section, { marginBottom: 16 }]}>
                    <View style={s.listRow}>
                      <View style={[s.avatar, { width: 48, height: 48 }]}>
                        <Text style={[s.avatarText, { fontSize: 18 }]}>{(selectedUser.name?.[0] || "?").toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 17, fontWeight: "700", color: "#fff" }}>{selectedUser.name}</Text>
                        <Text style={s.listSub}>{selectedUser.email}</Text>
                        <Text style={{ fontSize: 10, color: "#333", fontFamily: "monospace", marginTop: 2 }}>{selectedUser.id.slice(0, 24)}...</Text>
                      </View>
                      <Chip label={selectedUser.isBanned ? "banned" : selectedUser.plan} type={selectedUser.isBanned ? "banned" : selectedUser.plan} />
                    </View>
                  </View>

                  {/* Detail tabs */}
                  <View style={s.detailTabRow}>
                    {["plan", "stats", "danger"].map((t) => (
                      <TouchableOpacity key={t} style={[s.detailTab, userDetailTab === t && s.detailTabActive]} onPress={() => setUserDetailTab(t)}>
                        <Text style={[s.detailTabText, userDetailTab === t && { color: "#fff" }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {userDetailTab === "plan" && (
                    <Section title="Plan Override">
                      <Text style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>Force-assign a plan immediately.</Text>
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                        {PLAN_ORDER.map((p) => (
                          <TouchableOpacity
                            key={p}
                            style={[s.pillBtn, manualPlan === p && { backgroundColor: "rgba(108,71,255,0.2)", borderColor: "#7c5cfc" }]}
                            onPress={() => setManualPlan(p)}
                          >
                            <Text style={{ color: manualPlan === p ? "#c4b5fd" : "#666", fontSize: 13, fontWeight: "600" }}>{PLAN_META[p].name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <TextInput
                          style={[s.searchInput, { flex: 1, marginBottom: 0 }]}
                          value={manualDays}
                          onChangeText={setManualDays}
                          keyboardType="numeric"
                          placeholder="Duration (days)"
                          placeholderTextColor="#444"
                        />
                        <TouchableOpacity style={s.primaryBtn} onPress={handleManualGrant} disabled={manualBusy}>
                          <Text style={{ color: "#000", fontWeight: "700", fontSize: 13 }}>{manualBusy ? "..." : "Apply"}</Text>
                        </TouchableOpacity>
                      </View>
                    </Section>
                  )}

                  {userDetailTab === "stats" && (
                    <Section title="Usage Stats">
                      <View style={s.statGrid}>
                        <StatCard label="Conversations" value={selectedUser.convCount} />
                        <StatCard label="Msgs Today" value={selectedUser.msgsToday} accent="#4ade80" />
                      </View>
                      <Text style={{ fontSize: 11, color: "#555", marginTop: 16, marginBottom: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 }}>Model Breakdown</Text>
                      {MODEL_FIELDS.map((f) => (
                        <View key={f.key} style={s.barRow}>
                          <View style={[s.barDot, { backgroundColor: f.color }]} />
                          <Text style={s.barLabel}>{f.key}</Text>
                          <Text style={s.barCount}>{selectedUser.usageToday?.[f.key] || 0}</Text>
                        </View>
                      ))}
                    </Section>
                  )}

                  {userDetailTab === "danger" && (
                    <Section title="Danger Zone">
                      <View style={s.dangerCard}>
                        <Text style={s.dangerTitle}>Reset Today Usage</Text>
                        <Text style={s.dangerDesc}>Zeros out all message counts for today.</Text>
                        <TouchableOpacity style={s.btnOutline} onPress={() => setConfirmModal({ title: "Reset Usage?", desc: `Zero out all message counts for ${selectedUser.name} today.`, confirmLabel: "Reset", safe: true, onConfirm: handleResetUsage })}>
                          <Text style={{ color: "#888", fontWeight: "600", fontSize: 13 }}>🔄 Reset Usage</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={[s.dangerCard, { borderColor: selectedUser.isBanned ? "rgba(74,222,128,0.2)" : "rgba(239,68,68,0.2)" }]}>
                        <Text style={[s.dangerTitle, { color: selectedUser.isBanned ? "#4ade80" : "#fca5a5" }]}>
                          {selectedUser.isBanned ? "Unban User" : "Ban User"}
                        </Text>
                        <Text style={s.dangerDesc}>{selectedUser.isBanned ? "Restore full platform access." : "Block this user immediately."}</Text>
                        <TouchableOpacity
                          style={[s.actionBtn, selectedUser.isBanned ? s.actionBtnSuccess : s.actionBtnDanger]}
                          onPress={() => setConfirmModal({ title: selectedUser.isBanned ? "Unban?" : "Ban User?", desc: `${selectedUser.isBanned ? "Restore access for" : "Block"} ${selectedUser.name}?`, confirmLabel: selectedUser.isBanned ? "Unban" : "Ban", safe: selectedUser.isBanned, onConfirm: handleToggleBan })}
                        >
                          <Text style={{ color: selectedUser.isBanned ? "#4ade80" : "#fca5a5", fontWeight: "700", fontSize: 13 }}>
                            {selectedUser.isBanned ? "Unban Account" : "Ban Account"}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={[s.dangerCard, { borderColor: "rgba(239,68,68,0.2)" }]}>
                        <Text style={[s.dangerTitle, { color: "#fca5a5" }]}>Delete User Data</Text>
                        <Text style={s.dangerDesc}>Permanently wipes all Firestore records. Cannot be undone.</Text>
                        <TouchableOpacity
                          style={[s.actionBtn, s.actionBtnDanger]}
                          onPress={() => setConfirmModal({ title: "Delete User?", desc: `Permanently delete all data for ${selectedUser.email}. Cannot be undone.`, confirmLabel: "Delete", safe: false, onConfirm: handleDeleteUser })}
                        >
                          <Text style={{ color: "#fca5a5", fontWeight: "700", fontSize: 13 }}>🗑️ Delete Permanently</Text>
                        </TouchableOpacity>
                      </View>
                    </Section>
                  )}
                </View>
              )}
            </>
          )}

          {/* ── CHAT INSPECTOR ── */}
          {tab === "inspector" && (
            <>
              <TextInput
                style={s.searchInput}
                value={logUserSearch}
                onChangeText={setLogUserSearch}
                placeholder="Search users..."
                placeholderTextColor="#444"
              />

              {!logSelectedUser ? (
                <Section title="Select User">
                  {filteredLogUsers.map((u: any) => (
                    <TouchableOpacity key={u.id} style={s.listRow} onPress={() => handleSelectLogUser(u)}>
                      <View style={s.avatar}><Text style={s.avatarText}>{(u.name?.[0] || "?").toUpperCase()}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.listName}>{u.name}</Text>
                        <Text style={s.listSub}>{u.email} · {u.msgsToday} msgs today</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color="#444" />
                    </TouchableOpacity>
                  ))}
                </Section>
              ) : !logSelectedConv ? (
                <>
                  <TouchableOpacity style={s.backRow} onPress={() => { setLogSelectedUser(null); setLogConvs([]); }}>
                    <Ionicons name="arrow-back" size={16} color="#888" />
                    <Text style={{ color: "#888", fontSize: 13, marginLeft: 6 }}>All Users</Text>
                  </TouchableOpacity>
                  <Section title={`${logSelectedUser.name}'s Conversations`}>
                    {logLoading ? <ActivityIndicator color="#a78bfa" /> : logConvs.length === 0 ? (
                      <Text style={s.empty}>No conversations</Text>
                    ) : logConvs.map((c: any) => (
                      <TouchableOpacity key={c.id} style={s.listRow} onPress={() => handleSelectLogConv(c)}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.listName}>{c.title || "Untitled"}</Text>
                          <Text style={[s.listSub, c.isPersona && { color: "#a78bfa" }]}>{c.model}{c.isPersona ? " · Persona" : ""}</Text>
                          <Text style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{fmtDateTime(c.createdAt)}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color="#444" />
                      </TouchableOpacity>
                    ))}
                  </Section>
                </>
              ) : (
                <>
                  <TouchableOpacity style={s.backRow} onPress={() => { setLogSelectedConv(null); setLogMessages([]); }}>
                    <Ionicons name="arrow-back" size={16} color="#888" />
                    <Text style={{ color: "#888", fontSize: 13, marginLeft: 6 }}>Back to conversations</Text>
                  </TouchableOpacity>
                  <Section title={logSelectedConv.title || "Messages"}>
                    {logLoading ? <ActivityIndicator color="#a78bfa" /> : logMessages.length === 0 ? (
                      <Text style={s.empty}>No messages</Text>
                    ) : logMessages.map((m: any) => (
                      <View key={m.id} style={s.msgInspect}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: m.role === "user" ? "#4ade80" : "#a78bfa", textTransform: "uppercase", letterSpacing: 0.8 }}>
                            {m.role === "user" ? "User" : m.modelLabel || "AI"}
                          </Text>
                          <Text style={{ fontSize: 11, color: "#444", marginLeft: "auto" }}>{fmtDateTime(m.createdAt)}</Text>
                        </View>
                        <Text style={{ color: "#ccc", fontSize: 13.5, lineHeight: 20 }}>{m.content}</Text>
                      </View>
                    ))}
                  </Section>
                </>
              )}
            </>
          )}

          {/* ── PLATFORM ── */}
          {tab === "platform" && (
            <>
              <Section title="Platform Controls">
                <View style={s.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.toggleLabel}>Maintenance Mode</Text>
                    <Text style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Blocks all non-creator users</Text>
                  </View>
                  <TouchableOpacity
                    style={[s.toggleSwitch, platformSettings.maintenanceMode && s.toggleSwitchOn]}
                    onPress={() => setPlatformSettings((p) => ({ ...p, maintenanceMode: !p.maintenanceMode }))}
                  >
                    <View style={[s.toggleKnob, platformSettings.maintenanceMode && { transform: [{ translateX: 22 }] }]} />
                  </TouchableOpacity>
                </View>

                {platformSettings.maintenanceMode && (
                  <View style={{ backgroundColor: "rgba(239,68,68,0.06)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
                    <Text style={{ color: "#fca5a5", fontSize: 13 }}>⚠️ Maintenance mode is ON. All non-creator users are locked out.</Text>
                  </View>
                )}

                <Text style={{ fontSize: 12, color: "#555", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Global Notice</Text>
                <TextInput
                  style={[s.searchInput, { marginBottom: 16 }]}
                  value={platformSettings.globalNotice}
                  onChangeText={(v) => setPlatformSettings((p) => ({ ...p, globalNotice: v }))}
                  placeholder="e.g. Maintenance tonight at 2AM IST..."
                  placeholderTextColor="#444"
                  multiline
                />

                <TouchableOpacity style={s.primaryBtn} onPress={handleSavePlatform} disabled={limitsBusy}>
                  <Text style={{ color: "#000", fontWeight: "700", fontSize: 14 }}>{limitsBusy ? "Saving..." : "💾 Save Platform Settings"}</Text>
                </TouchableOpacity>
              </Section>

              <Section title="Plan Limits">
                <Text style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>Empty = unlimited. Changes apply immediately on save.</Text>
                {PLAN_ORDER.map((planId) => (
                  <View key={planId} style={[s.dangerCard, { borderColor: `${PLAN_META[planId].color}30` }]}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: PLAN_META[planId].color, marginBottom: 14 }}>{PLAN_META[planId].name} Tier</Text>
                    {MODEL_FIELDS.map((f) => (
                      <View key={f.key} style={[s.barRow, { marginBottom: 10 }]}>
                        <View style={[s.barDot, { backgroundColor: f.color }]} />
                        <Text style={[s.barLabel, { flex: 1 }]}>{f.key}</Text>
                        <TextInput
                          style={s.limitInput}
                          value={limitDrafts?.[planId]?.[f.key] || ""}
                          onChangeText={(v) => setLimitDrafts((p: any) => ({ ...p, [planId]: { ...(p?.[planId] || {}), [f.key]: v } }))}
                          keyboardType="numeric"
                          placeholder="∞"
                          placeholderTextColor="#444"
                        />
                      </View>
                    ))}
                  </View>
                ))}
                <TouchableOpacity style={s.primaryBtn} onPress={handleSavePlatform} disabled={limitsBusy}>
                  <Text style={{ color: "#000", fontWeight: "700", fontSize: 14 }}>{limitsBusy ? "Saving..." : "Save Limits"}</Text>
                </TouchableOpacity>
              </Section>
            </>
          )}

        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  // Toast
  toast: { position: "absolute", bottom: 40, left: 20, right: 20, backgroundColor: "rgba(4,120,87,0.9)", borderRadius: 14, padding: 14, zIndex: 999, alignItems: "center" },
  toastText: { color: "#4ade80", fontWeight: "600", fontSize: 14 },

  // Overlay
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", padding: 20 },
  confirmBox: { backgroundColor: "rgba(10,10,16,0.98)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380 },
  confirmTitle: { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 10 },
  confirmDesc: { fontSize: 14, color: "#666", lineHeight: 22, marginBottom: 24 },

  // Topbar
  topbar: { flexDirection: "row", alignItems: "center", paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#111", backgroundColor: "rgba(5,5,10,0.95)" },
  backBtn: { padding: 8, borderRadius: 8 },
  topTitle: { fontSize: 15, fontWeight: "700", color: "#ddd" },

  // Tabs
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", backgroundColor: "rgba(0,0,0,0.3)" },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabBtnActive: { borderBottomColor: "#7c5cfc" },
  tabBtnText: { fontSize: 16, color: "#444" },
  tabLabel: { fontSize: 9, color: "#444", marginTop: 2, fontWeight: "600" },

  // Stats
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  statCard: { flex: 1, minWidth: "45%", backgroundColor: "rgba(8,8,14,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 18 },
  statLabel: { fontSize: 11, color: "#555", letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "600", marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: "700", color: "#fff", letterSpacing: -1, marginBottom: 4 },
  statSub: { fontSize: 12, color: "#555" },

  // Section
  section: { backgroundColor: "rgba(8,8,14,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 11, color: "#666", letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "600", marginBottom: 16 },

  // Bar chart rows
  barRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  barDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  barLabel: { fontSize: 12, color: "#888", width: 90 },
  barTrack: { flex: 1, height: 5, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 99 },
  barFill: { height: 5, borderRadius: 99 },
  barCount: { fontSize: 13, color: "#fff", fontWeight: "600", width: 28, textAlign: "right" },

  // List
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  listName: { fontSize: 14, fontWeight: "600", color: "#eee" },
  listSub: { fontSize: 12, color: "#555", marginTop: 2 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText: { fontSize: 13, fontWeight: "700", color: "#bbb" },
  empty: { fontSize: 14, color: "#444", textAlign: "center", paddingVertical: 20, fontStyle: "italic" },

  // Request card
  reqCard: { backgroundColor: "rgba(10,10,18,0.6)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 14, padding: 16, marginBottom: 14 },

  // Buttons
  btnOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignSelf: "flex-start" },
  btnDanger: { backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  btnSuccess: { backgroundColor: "rgba(34,197,94,0.12)", borderWidth: 1, borderColor: "rgba(74,222,128,0.25)" },
  actionBtn: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionBtnSuccess: { backgroundColor: "rgba(34,197,94,0.12)", borderWidth: 1, borderColor: "rgba(74,222,128,0.25)" },
  actionBtnDanger: { backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" },
  primaryBtn: { backgroundColor: "#fff", borderRadius: 12, padding: 14, alignItems: "center", justifyContent: "center" },
  pillBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },

  // Inputs
  searchInput: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 13, fontSize: 14, color: "#eee", marginBottom: 14 },
  daysInput: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: "#eee", width: 70 },
  limitInput: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10, padding: 10, fontSize: 13, color: "#fff", textAlign: "center", width: 70, fontWeight: "600" },

  // User detail tabs
  detailTabRow: { flexDirection: "row", gap: 6, marginBottom: 14, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 4 },
  detailTab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 8 },
  detailTabActive: { backgroundColor: "rgba(255,255,255,0.08)" },
  detailTabText: { fontSize: 13, fontWeight: "600", color: "#555" },

  // Danger cards
  dangerCard: { backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 14, padding: 18, marginBottom: 14 },
  dangerTitle: { fontSize: 14, fontWeight: "600", color: "#ddd", marginBottom: 6 },
  dangerDesc: { fontSize: 13, color: "#555", lineHeight: 20, marginBottom: 14 },

  // Chat inspector
  msgInspect: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 16, marginBottom: 12 },

  // Back row
  backRow: { flexDirection: "row", alignItems: "center", marginBottom: 14, paddingVertical: 4 },

  // Platform
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", marginBottom: 16 },
  toggleLabel: { fontSize: 14, fontWeight: "600", color: "#ddd" },
  toggleSwitch: { width: 50, height: 28, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 99, justifyContent: "center", padding: 3 },
  toggleSwitchOn: { backgroundColor: "rgba(124,92,252,0.4)", borderColor: "rgba(124,92,252,0.6)" },
  toggleKnob: { width: 22, height: 22, backgroundColor: "#fff", borderRadius: 11, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4 },
});
