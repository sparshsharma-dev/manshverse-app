import { useState, useRef, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Animated, Dimensions, Alert, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  collection, addDoc, getDoc, getDocs, query, orderBy, serverTimestamp,
  deleteDoc, doc, increment, setDoc, onSnapshot,
} from "firebase/firestore";
import { auth, db } from "../../src/lib/firebase";
import { getPlanSnapshot, getUsageDayKey } from "../../src/lib/account";
import { DEFAULT_PLAN_LIMITS, normalizePlanLimits } from "../../src/lib/plans";

const GROQ_ENDPOINT = "https://manshverse.vercel.app/api/groq";
const SPARSH_UID = "O3FcnaQA5tgNztbkWc2FLRnYdye2";

// ── HELPERS ──────────────────────────────────────────────
const parseThinking = (text: string) => {
  const match = text?.match(/<think>([\s\S]*?)<\/think>/);
  return {
    thinking: match?.[1]?.trim() || null,
    answer: text?.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || "",
  };
};

// ── MODELS ──────────────────────────────────────────────
const MODELS = [
  { id: "auto/mansh",                                label: "Mansh Mode ✨", desc: "Auto-routes to best model",  color: "#facc15", vision: false },
  { id: "qwen/qwen3-32b",                            label: "Milkcake 2.7", desc: "Deep reasoning & math",      color: "#a78bfa", vision: false },
  { id: "openai/gpt-oss-120b",                       label: "Astral 2.0",   desc: "Sharp & insightful",         color: "#67e8f9", vision: false },
  { id: "llama-3.3-70b-versatile",                   label: "Impulse 1.4",  desc: "Lightning fast",             color: "#86efac", vision: false },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Cornea 1.0",   desc: "Vision & image analysis",    color: "#fca5a5", vision: true  },
  { id: "moonshotai/kimi-k2-instruct-0905",          label: "Nova 1.0",     desc: "Long context & synthesis",   color: "#fde68a", vision: false },
  { id: "openai/gpt-oss-20b",                        label: "Spark 1.0",    desc: "Quick & lightweight",        color: "#fb923c", vision: false },
];

// ── ATMOSPHERES ──────────────────────────────────────────
const ATMOSPHERES: Record<string, { accent: string }> = {
  default:   { accent: "#7c5cfc" },
  technical: { accent: "#67e8f9" },
  cosmic:    { accent: "#a78bfa" },
  energetic: { accent: "#4ade80" },
  deep:      { accent: "#818cf8" },
  creative:  { accent: "#f472b6" },
};
const detectAtmosphere = (text: string) => {
  const l = text.toLowerCase();
  if (l.includes("```") || l.includes("function") || l.includes("def ")) return "technical";
  if (l.includes("universe") || l.includes("cosmos") || l.includes("infinite")) return "cosmic";
  if (l.includes("amazing") || l.includes("perfect") || l.includes("nailed")) return "energetic";
  if (l.includes("philosophy") || l.includes("stoic") || l.includes("paradox")) return "deep";
  if (l.includes("story") || l.includes("creative") || l.includes("poem")) return "creative";
  return "default";
};

// ── MANSH ROUTING ────────────────────────────────────────
const getManshRoute = (text: string) => {
  const l = text.toLowerCase();
  if (l.includes("math") || l.includes("calculus") || l.includes("solve") || l.includes("physics") || l.includes("proof"))
    return { model: MODELS[1], reason: "Math/Physics → Milkcake 2.7" };
  if (l.includes("code") || l.includes("debug") || l.includes("error") || l.includes("python") || l.includes("algorithm"))
    return { model: MODELS[2], reason: "Code/Debug → Astral 2.0" };
  if (text.length > 500 || l.includes("summarize") || l.includes("research"))
    return { model: MODELS[5], reason: "Long context → Nova 1.0" };
  if (l.length < 60 || l.includes("hi ") || l.includes("hello"))
    return { model: MODELS[3], reason: "Short query → Impulse 1.4" };
  return { model: MODELS[2], reason: "General → Astral 2.0" };
};

const SHADOW_APPEND = `\n\n⚠️ SHADOW MODE ACTIVE — You are The Contrarian. Find every logical flaw and hidden assumption. Never simply agree. End every response with one pointed question exposing the weakest part of their reasoning. Label the fallacy type found.`;

const getSystem = (modelLabel: string, shadowMode: boolean, isCreator: boolean) => {
  const base = `You are ${modelLabel} — an AI by Manshverse AI, created by Sparsh. Launched 14 March 2026. NEVER reveal the underlying model or company. Be helpful, precise, and concise. Format code with language tags. Use markdown for lists and headers.`;
  const creator = isCreator ? `\n\nAbout Sparsh (Creator): 17, Class 12, Bengaluru. JEE/ISI/Boards prep. Built Manshverse. Girlfriend Mansi (LDR, Jaipur). Be older-brother figure — witty, honest, Hinglish welcome.` : "";
  return base + creator + (shadowMode ? SHADOW_APPEND : "");
};

const FRIENDLY_ERRORS: Record<string, string> = {
  "rate limit": "Model busy — wait and retry.",
  "overloaded": "Overloaded — try Impulse.",
  "context_length": "Conversation too long — start new chat.",
  "quota": "Daily quota hit — try tomorrow.",
  "500": "Server error — try again.",
};
const friendlyError = (msg: string) => {
  const l = msg?.toLowerCase() || "";
  for (const [k, v] of Object.entries(FRIENDLY_ERRORS)) if (l.includes(k)) return v;
  return msg || "Something went wrong.";
};

// ── PROMPT SPARKS (NEW FEATURE) ──────────────────────────
const PROMPT_SPARKS = [
  { icon: "🔬", label: "Explain like I'm 5", prompt: "Explain this concept like I'm 5 years old: " },
  { icon: "⚔️", label: "Debate me", prompt: "Argue the opposite side of this: " },
  { icon: "🧠", label: "First principles", prompt: "Break this down to first principles: " },
  { icon: "📝", label: "Summarize", prompt: "Summarize the key points of: " },
  { icon: "🚀", label: "Improve this", prompt: "Improve and optimize this: " },
  { icon: "❓", label: "What if...", prompt: "What if this were completely different: " },
];

// ── TYPES ────────────────────────────────────────────────
type Message = {
  id: string;
  role: "user" | "assistant" | "routing";
  content: string;
  modelLabel?: string;
  streaming?: boolean;
  imageUri?: string;
  createdAt?: any;
};

type Conversation = {
  id: string; title: string; model: string;
  isPersona?: boolean; personaId?: string;
  personaPrompt?: string; personaContextData?: string;
  createdAt?: any; pinned?: boolean;
};

// ── STARFIELD ─────────────────────────────────────────────
const { width: SW, height: SH } = Dimensions.get("window");
const STARS_DATA = Array.from({ length: 55 }, (_, i) => ({
  id: i, x: Math.random() * SW, y: Math.random() * SH,
  size: Math.random() * 2 + 0.4, opacity: Math.random() * 0.5 + 0.1,
  dur: Math.random() * 3000 + 2000,
}));

function Starfield({ accent }: { accent: string }) {
  const anims = useRef(STARS_DATA.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    STARS_DATA.forEach((_, i) => {
      const loop = () => Animated.sequence([
        Animated.timing(anims[i], { toValue: 1, duration: STARS_DATA[i].dur, useNativeDriver: true }),
        Animated.timing(anims[i], { toValue: 0, duration: STARS_DATA[i].dur, useNativeDriver: true }),
      ]).start(loop);
      setTimeout(loop, Math.random() * 3000);
    });
  }, []);
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {STARS_DATA.map((star, i) => (
        <Animated.View key={star.id} style={{
          position: "absolute", left: star.x, top: star.y,
          width: star.size, height: star.size, borderRadius: star.size / 2,
          backgroundColor: i % 6 === 0 ? accent : "#fff",
          opacity: anims[i].interpolate({ inputRange: [0, 1], outputRange: [star.opacity * 0.2, star.opacity] }),
        }} />
      ))}
    </View>
  );
}

// ── THINKING BLOCK ────────────────────────────────────────
function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity style={s.thinkWrap} onPress={() => setExpanded(p => !p)} activeOpacity={0.7}>
      <View style={s.thinkHeader}>
        <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={11} color="#444" />
        <Text style={s.thinkHeaderText}>View reasoning</Text>
      </View>
      {expanded && <Text style={s.thinkBody}>{text}</Text>}
    </TouchableOpacity>
  );
}

// ── MAIN COMPONENT ───────────────────────────────────────
export default function Chat() {
  const user = auth.currentUser;
  const isCreator = user?.uid === SPARSH_UID;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [model, setModel] = useState(MODELS[0]);
  const [shadowMode, setShadowMode] = useState(false);
  const [atmosphere, setAtmosphere] = useState("default");
  const [error, setError] = useState("");
  const [isBanned, setIsBanned] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ uri: string; base64: string } | null>(null);
  const [plan, setPlan] = useState("free");
  const [planLimits, setPlanLimits] = useState(DEFAULT_PLAN_LIMITS);
  const [usageToday, setUsageToday] = useState<Record<string, number>>({}); // 👈 ADD THIS LINE

  // UI
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modelModal, setModelModal] = useState(false);
  const [renameModal, setRenameModal] = useState<{ conv: Conversation; title: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [showSparks, setShowSparks] = useState(false);

  const drawerAnim = useRef(new Animated.Value(-280)).current;
  const flatListRef = useRef<FlatList>(null);
  const atm = ATMOSPHERES[atmosphere] || ATMOSPHERES.default;

  // ── DRAWER ───────────────────────────────────────────
  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.spring(drawerAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 12 }).start();
  };
  const closeDrawer = () => {
    Animated.timing(drawerAnim, { toValue: -280, duration: 220, useNativeDriver: true }).start(() => setDrawerOpen(false));
  };

  // ── INIT ────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const unsubUser = onSnapshot(doc(db, "users", user.uid), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setIsBanned(data.isBanned || false);
        setPlan(getPlanSnapshot(data).plan);
      } else {
        setIsBanned(false);
        setPlan("free");
      }
    });
    const unsubPlat = onSnapshot(doc(db, "settings", "platform"), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setMaintenanceMode(data.maintenanceMode || false);
        setPlanLimits(normalizePlanLimits(data.planLimits || DEFAULT_PLAN_LIMITS));
      } else {
        setMaintenanceMode(false);
        setPlanLimits(DEFAULT_PLAN_LIMITS);
      }
    });
    loadConversations();
    return () => { unsubUser(); unsubPlat(); };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || isCreator) return; // 👈 FIX: Stops the creator from fetching limits
    
    const usageRef = doc(db, "users", user.uid, "usage", getUsageDayKey());
    const unsubUsage = onSnapshot(
      usageRef,
      (snap) => setUsageToday(snap.exists() ? snap.data() : {}),
      (err) => console.log("Usage listener info:", err.message) // 👈 FIX: Changes error to a soft log
    );
    return () => unsubUsage();
  },[user?.uid, isCreator]);

  const loadConversations = async () => {
    if (!user?.uid) return;
    try {
      const q = query(collection(db, "users", user.uid, "conversations"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const convs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Conversation));
      convs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      setConversations(convs);
    } catch {}
  };

  const selectConv = async (conv: Conversation) => {
    setActiveConv(conv);
    setError("");
    const m = MODELS.find(x => x.label === conv.model) || MODELS[2];
    setModel(conv.isPersona ? MODELS[2] : m);
    closeDrawer();
    try {
      const q = query(collection(db, "users", user!.uid, "conversations", conv.id, "messages"), orderBy("createdAt", "asc"));
      const snap = await getDocs(q);
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    } catch {}
  };

  const newChat = () => {
    setActiveConv(null); setMessages([]); setInput(""); setError("");
    setAttachedImage(null); closeDrawer();
  };

  const deleteConv = async (conv: Conversation) => {
    try {
      await deleteDoc(doc(db, "users", user!.uid, "conversations", conv.id));
      setConversations(prev => prev.filter(c => c.id !== conv.id));
      if (activeConv?.id === conv.id) newChat();
    } catch {}
  };

  const showConvOptions = (conv: Conversation) => {
    Alert.alert(conv.title || "Untitled", "What do you want to do?", [
      { text: conv.pinned ? "📌 Unpin" : "📌 Pin", onPress: () => togglePin(conv) },
      { text: "✏️ Rename", onPress: () => setRenameModal({ conv, title: conv.title || "" }) },
      { text: "🗑️ Delete", style: "destructive", onPress: () => deleteConv(conv) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const togglePin = async (conv: Conversation) => {
    const newPinned = !conv.pinned;
    try {
      await setDoc(doc(db, "users", user!.uid, "conversations", conv.id), { pinned: newPinned }, { merge: true });
      setConversations(prev =>
        prev.map(c => c.id === conv.id ? { ...c, pinned: newPinned } : c)
          .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
      );
    } catch {}
  };

  const renameConv = async () => {
    if (!renameModal?.title.trim()) return;
    try {
      await setDoc(doc(db, "users", user!.uid, "conversations", renameModal.conv.id), { title: renameModal.title.trim() }, { merge: true });
      setConversations(prev => prev.map(c => c.id === renameModal.conv.id ? { ...c, title: renameModal.title.trim() } : c));
      if (activeConv?.id === renameModal.conv.id) setActiveConv(p => p ? { ...p, title: renameModal.title.trim() } : p);
    } catch {}
    setRenameModal(null);
  };

  // ── IMAGE PICKER ─────────────────────────────────────
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAttachedImage({ uri: asset.uri, base64: asset.base64 || "" });
      if (model.id !== "meta-llama/llama-4-scout-17b-16e-instruct") {
        setModel(MODELS[4]); // auto-switch to Cornea
      }
    }
  };

  // ── SEND ────────────────────────────────────────────
  const sendMessage = async (overrideInput?: string) => {
    const text = (overrideInput || input).trim();
    if ((!text && !attachedImage) || loading) return;

    // 🚀 FIX 1: Set loading IMMEDIATELY to disable the button and prevent spam-tapping
    setLoading(true);

    if (isBanned && !isCreator) { setError("ACCESS DENIED: Account suspended."); setLoading(false); return; }
    if (maintenanceMode && !isCreator) { setError("SYSTEM OFFLINE: Under maintenance."); setLoading(false); return; }

    let targetModel = model;
    let routeReason: string | null = null;

    if (model.id === "auto/mansh") {
      if (attachedImage) {
        targetModel = MODELS[4];
      } else {
        const route = getManshRoute(text);
        targetModel = route.model;
        routeReason = route.reason;
      }
    }
    
    // ── CHECK USAGE LIMITS ──────────────────────────────
    let latestUsage = usageToday;
    let latestPlan = plan;
    let latestPlanLimits = planLimits;

    if (!isCreator) {
      try {
        const[usageSnap, userSnap, settingsSnap] = await Promise.all([
          getDoc(doc(db, "users", user!.uid, "usage", getUsageDayKey())),
          getDoc(doc(db, "users", user!.uid)),
          getDoc(doc(db, "settings", "platform")),
        ]);

        latestUsage = usageSnap.exists() ? usageSnap.data() : {};
        latestPlan = getPlanSnapshot(userSnap.exists() ? userSnap.data() : {}).plan;
        latestPlanLimits = settingsSnap.exists()
          ? normalizePlanLimits(settingsSnap.data().planLimits || DEFAULT_PLAN_LIMITS)
          : DEFAULT_PLAN_LIMITS;

        setUsageToday(latestUsage);
        setPlan(latestPlan);
        setPlanLimits(latestPlanLimits);
      } catch (err) {
        console.error("Failed to refresh usage gate", err);
      }
    }

    // Get effective limit for this model
    const effectiveLimit = isCreator ? Infinity : (latestPlanLimits[latestPlan]?.[targetModel.label] ?? 10);
    const used = Number(latestUsage[targetModel.label] || 0);

    // 🚀 FIX 2: Block message correctly and re-enable the button
    if (!isCreator && effectiveLimit !== Infinity && used >= effectiveLimit) {
      setError(`Daily limit reached for ${targetModel.label} (${used}/${effectiveLimit}). Upgrade for more → Profile → Upgrade Plan`);
      setLoading(false); 
      return;
    }

    const imgToSend = attachedImage;
    setInput(""); setError(""); setAttachedImage(null); setShowSparks(false);

    const userMsg: Message = {
      id: Date.now().toString(), role: "user",
      content: text || "📎 Image attached",
      modelLabel: model.label,
      imageUri: imgToSend?.uri,
    };
    let newMessages =[...messages, userMsg];

    if (routeReason) {
      newMessages.push({
        id: (Date.now() + 0.5).toString(), role: "routing",
        content: `✨ Mansh Mode → ${targetModel.label} · ${routeReason}`,
      });
    }
    setMessages(newMessages);

    let convId = activeConv?.id;
    if (!convId) {
      try {
        const ref = await addDoc(collection(db, "users", user!.uid, "conversations"), {
          title: (text || "Image").slice(0, 45), createdAt: serverTimestamp(), model: model.label,
        });
        convId = ref.id;
        const nc: Conversation = { id: convId, title: (text || "Image").slice(0, 45), model: model.label };
        setActiveConv(nc);
        setConversations(prev =>[nc, ...prev]);
      } catch {}
    }

    if (convId) {
      try {
        await addDoc(collection(db, "users", user!.uid, "conversations", convId, "messages"), {
          role: "user", content: text, createdAt: serverTimestamp(),
        });
      } catch {}
    }

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev =>[...prev, { id: assistantId, role: "assistant", content: "", modelLabel: targetModel.label, streaming: true }]);

    const sysPrompt = getSystem(targetModel.label, shadowMode, isCreator);
    const apiMsgs = newMessages
      .filter(m => m.role !== "routing")
      .map((m, idx) => {
        if (idx === newMessages.filter(x => x.role !== "routing").length - 1 && imgToSend?.base64) {
          return {
            role: m.role,
            content:[
              { type: "text", text: m.content || "Analyze this image." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgToSend.base64}` } },
            ],
          };
        }
        return { role: m.role, content: m.content };
      });

    try {
      const response = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: targetModel.id === "auto/mansh" ? "llama-3.3-70b-versatile" : targetModel.id,
          stream: false,
          messages:[{ role: "system", content: sysPrompt }, ...apiMsgs],
        }),
      });
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || "No response.";
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: reply, streaming: false } : m));
      setAtmosphere(detectAtmosphere(reply));
      
      if (convId) {
        try {
          await addDoc(collection(db, "users", user!.uid, "conversations", convId, "messages"), {
            role: "assistant", content: reply, createdAt: serverTimestamp(), modelLabel: targetModel.label,
          });
          
          // 🚀 FIX 3: Correctly increment usage AND update the local state instantly
          if (!isCreator) {
            const next = used + 1;
            setUsageToday({ ...latestUsage, [targetModel.label]: next }); 
            await setDoc(
              doc(db, "users", user!.uid, "usage", getUsageDayKey()),
              {[targetModel.label]: increment(1) },
              { merge: true },
            );
          }
        } catch {}
      }
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: friendlyError(e.message), streaming: false } : m));
    } finally {
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const enhancePrompt = async () => {
    if (!input.trim() || enhancing) return;
    setEnhancing(true);
    try {
      const response = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "Rewrite the user's prompt to be highly detailed and effective for AI. Return ONLY the rewritten prompt, nothing else." },
            { role: "user", content: input },
          ],
        }),
      });
      const data = await response.json();
      const enhanced = data.choices?.[0]?.message?.content?.trim();
      if (enhanced) setInput(enhanced);
    } catch {}
    setEnhancing(false);
  };

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const filteredConvs = conversations.filter(c => (c.title || "").toLowerCase().includes(searchQuery.toLowerCase()));

  // ── RENDER MESSAGE ───────────────────────────────────
  const renderMessage = ({ item }: { item: Message }) => {
    if (item.role === "routing") {
      return (
        <View style={s.routingChip}>
          <Text style={s.routingText}>{item.content}</Text>
        </View>
      );
    }
    const isUser = item.role === "user";
    const m = MODELS.find(x => x.label === item.modelLabel) || model;
    const { thinking, answer } = parseThinking(item.content);

    return (
      <View style={s.msgRow}>
        <View style={[s.msgAv, isUser
          ? s.msgAvUser
          : { backgroundColor: `${atm.accent}18`, borderColor: `${atm.accent}40` }
        ]}>
          <Text style={[s.msgAvText, { color: isUser ? "#ccc" : atm.accent }]}>
            {isUser ? (user?.displayName?.[0] || "U").toUpperCase() : "M"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Text style={[s.msgName, { color: isUser ? "#555" : m.color }]}>
              {isUser ? (user?.displayName || "You") : item.modelLabel}
            </Text>
            {!isUser && shadowMode && (
              <View style={s.shadowBadge}><Text style={{ fontSize: 10, color: "#f97316" }}>👹</Text></View>
            )}
          </View>

          {item.imageUri && (
            <Image source={{ uri: item.imageUri }} style={s.attachedImg} resizeMode="cover" />
          )}

          {item.content === "" && item.streaming ? (
            <View style={s.typingDots}>
              <View style={[s.dot, { backgroundColor: atm.accent }]} />
              <View style={[s.dot, { backgroundColor: atm.accent, opacity: 0.6 }]} />
              <View style={[s.dot, { backgroundColor: atm.accent, opacity: 0.3 }]} />
            </View>
          ) : (
            <View>
              {thinking && <ThinkingBlock text={thinking} />}
              <Text style={[s.msgText, isUser && s.msgTextUser]}>{answer || item.content}</Text>
            </View>
          )}

          {!isUser && !item.streaming && (
            <TouchableOpacity
              onPress={() => { setCopied(item.id); setTimeout(() => setCopied(null), 2000); }}
              style={s.copyBtn}
            >
              <Ionicons name={copied === item.id ? "checkmark" : "copy-outline"} size={13} color={copied === item.id ? "#4ade80" : "#333"} />
              <Text style={{ fontSize: 11, color: copied === item.id ? "#4ade80" : "#333", marginLeft: 4 }}>
                {copied === item.id ? "Copied" : "Copy"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const isEmpty = messages.length === 0;

  return (
    <View style={s.root}>
      <Starfield accent={atm.accent} />

      {/* ── MODEL MODAL ── */}
      <Modal visible={modelModal} transparent animationType="slide" onRequestClose={() => setModelModal(false)}>
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => setModelModal(false)}>
          <View style={s.modelSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Select Model</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {MODELS.map((m, i) => (
                <TouchableOpacity
                  key={m.id}
                  style={[s.modelItem, model.id === m.id && [s.modelItemActive, { borderColor: `${m.color}40` }], i === 0 && s.modelItemFirst]}
                  onPress={() => { setModel(m); setModelModal(false); }}
                >
                  <View style={[s.modelDot, { backgroundColor: m.color, shadowColor: m.color, shadowOpacity: 0.6, shadowRadius: 6, elevation: 4 }]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={s.modelName}>{m.label}</Text>
                      {m.vision && (
                        <View style={s.visionBadge}><Text style={s.visionBadgeText}>👁 Vision</Text></View>
                      )}
                    </View>
                    <Text style={s.modelDesc}>{m.desc}</Text>
                  </View>
                  {model.id === m.id && <Ionicons name="checkmark-circle" size={18} color={m.color} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── RENAME MODAL ── */}
      <Modal visible={!!renameModal} transparent animationType="fade" onRequestClose={() => setRenameModal(null)}>
        <View style={s.overlayCenter}>
          <View style={s.renameBox}>
            <Text style={s.renameTitle}>Rename Conversation</Text>
            <TextInput
              style={s.renameInput}
              value={renameModal?.title || ""}
              onChangeText={t => setRenameModal(p => p ? { ...p, title: t } : null)}
              placeholder="Conversation name..."
              placeholderTextColor="#333"
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.renameBtn, { backgroundColor: "rgba(255,255,255,0.05)", flex: 1 }]} onPress={() => setRenameModal(null)}>
                <Text style={{ color: "#666", fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.renameBtn, { backgroundColor: "#fff", flex: 2 }]} onPress={renameConv}>
                <Text style={{ color: "#000", fontWeight: "700" }}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── DRAWER OVERLAY ── */}
      {drawerOpen && <TouchableOpacity style={s.drawerOverlay} activeOpacity={1} onPress={closeDrawer} />}

      {/* ── DRAWER ── */}
      <Animated.View style={[s.drawer, { transform: [{ translateX: drawerAnim }] }]}>
        <View style={s.drawerHead}>
          <View style={[s.drawerMark, { backgroundColor: atm.accent }]}>
            <Text style={{ color: "#000", fontWeight: "800", fontSize: 12 }}>M</Text>
          </View>
          <Text style={s.drawerTitle}>Manshverse</Text>
          <TouchableOpacity onPress={closeDrawer} style={{ marginLeft: "auto", padding: 4 }}>
            <Ionicons name="close" size={20} color="#444" />
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
          <TextInput
            style={s.drawerSearch}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search conversations..."
            placeholderTextColor="#2a2a2a"
          />
          <TouchableOpacity style={s.drawerNewBtn} onPress={newChat}>
            <Ionicons name="add" size={15} color={atm.accent} />
            <Text style={[s.drawerNewBtnText, { color: atm.accent }]}>New Chat</Text>
          </TouchableOpacity>

          <Text style={s.drawerSection}>EXPLORE</Text>
          <TouchableOpacity style={s.drawerItem} onPress={() => { closeDrawer(); router.push("/personas"); }}>
            <Ionicons name="people-outline" size={14} color="#555" />
            <Text style={s.drawerItemText}>Personas & Avatars</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.drawerItem} onPress={() => { closeDrawer(); router.push("/council"); }}>
            <Ionicons name="shield-outline" size={14} color="#555" />
            <Text style={s.drawerItemText}>Council of Minds</Text>
          </TouchableOpacity>
          {isCreator && (
            <TouchableOpacity style={s.drawerItem} onPress={() => { closeDrawer(); router.push("/analytics"); }}>
              <Ionicons name="bar-chart-outline" size={14} color="#a78bfa" />
              <Text style={[s.drawerItemText, { color: "#a78bfa" }]}>Analytics</Text>
            </TouchableOpacity>
          )}
          <Text style={s.drawerSection}>RECENT</Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}>
          {filteredConvs.length === 0 && (
            <Text style={{ color: "#2a2a2a", fontSize: 12, textAlign: "center", paddingVertical: 20 }}>No conversations yet</Text>
          )}
          {filteredConvs.map(conv => (
            <TouchableOpacity
              key={conv.id}
              style={[s.convItem, activeConv?.id === conv.id && [s.convItemActive, { borderColor: `${atm.accent}30` }]]}
              onPress={() => selectConv(conv)}
              onLongPress={() => showConvOptions(conv)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                {conv.pinned && <Ionicons name="pin" size={10} color="#facc15" />}
                <Text style={[s.convTitle, activeConv?.id === conv.id && { color: "#fff" }]} numberOfLines={1}>
                  {conv.title || "Untitled"}
                </Text>
              </View>
              <Text style={s.convSub}>{conv.isPersona ? "● Persona" : conv.model || "—"}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.drawerFoot}>
          <TouchableOpacity style={s.drawerUser} onPress={() => { closeDrawer(); router.push("/(tabs)/profile"); }}>
            <View style={[s.drawerAv, { backgroundColor: `${atm.accent}30` }]}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                {(user?.displayName?.[0] || user?.email?.[0] || "U").toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.drawerUserName} numberOfLines={1}>{user?.displayName || user?.email}</Text>
              {isCreator
                ? <Text style={{ fontSize: 10, color: atm.accent, fontWeight: "700", marginTop: 1 }}>✦ Creator</Text>
                : <Text style={{ fontSize: 10, color: "#333", marginTop: 1 }}>FREE PLAN</Text>
              }
            </View>
            
            {/* 🚀 FIX: Hide the Upgrade button if you are the Creator */}
            {!isCreator && (
              <TouchableOpacity onPress={() => { closeDrawer(); router.push("/upgrade"); }} style={s.upgradeChip}>
                <Text style={s.upgradeChipText}>↑ Upgrade</Text>
              </TouchableOpacity>
            )}

          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── MAIN ── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>

        {/* TOPBAR */}
        <View style={s.topbar}>
          <TouchableOpacity style={s.iconBtn} onPress={openDrawer}>
            <Ionicons name="menu" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={s.modelBtn} onPress={() => setModelModal(true)}>
            <View style={[s.modelDotSm, { backgroundColor: model.color, shadowColor: model.color, shadowOpacity: 0.8, shadowRadius: 4, elevation: 4 }]} />
            <Text style={s.modelBtnText} numberOfLines={1}>{model.label}</Text>
            {model.vision && <Ionicons name="eye-outline" size={12} color="#fca5a5" />}
            <Ionicons name="chevron-down" size={11} color="#444" />
          </TouchableOpacity>

          <View style={s.topRight}>
            <View style={[s.atmDot, { backgroundColor: atm.accent, shadowColor: atm.accent, shadowOpacity: 0.8, shadowRadius: 4, elevation: 4 }]} />
            <TouchableOpacity style={[s.iconBtn, shadowMode && s.iconBtnShadow]} onPress={() => setShadowMode(p => !p)}>
              <Text style={{ fontSize: 16 }}>👹</Text>
            </TouchableOpacity>
            {isCreator && (
              <TouchableOpacity style={s.iconBtn} onPress={() => router.push("/analytics")}>
                <Ionicons name="bar-chart-outline" size={17} color="#a78bfa" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.iconBtn} onPress={newChat}>
              <Ionicons name="create-outline" size={18} color="#555" />
            </TouchableOpacity>
          </View>
        </View>

        {/* BANNERS */}
        {(isBanned || (maintenanceMode && !isCreator)) && (
          <View style={s.bannerRed}>
            <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "600", textAlign: "center" }}>
              {isBanned ? "⚠️ Account suspended." : "🛠️ Under maintenance."}
            </Text>
          </View>
        )}
        {shadowMode && (
          <View style={s.shadowBanner}>
            <Text style={s.shadowBannerText}>👹 Shadow Mode — AI will challenge everything you say</Text>
            <TouchableOpacity onPress={() => setShadowMode(false)}>
              <Text style={s.shadowOff}>Off</Text>
            </TouchableOpacity>
          </View>
        )}
        {!!error && (
          <View style={s.errorBar}>
            <Text style={{ color: "#fca5a5", fontSize: 13, flex: 1 }}>{error}</Text>
            <TouchableOpacity onPress={() => setError("")}>
              <Ionicons name="close" size={16} color="#fca5a5" />
            </TouchableOpacity>
          </View>
        )}

        {/* EMPTY STATE */}
        {isEmpty && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.emptyScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={s.emptyTitle}>Manshverse</Text>
            <Text style={s.emptySubtitle}>What is on your mind?</Text>

            {/* Mode toggle */}
            <View style={s.modeToggle}>
              <TouchableOpacity
                style={[s.modeOpt, model.id === "auto/mansh" && [s.modeOptActive, { borderColor: atm.accent }]]}
                onPress={() => setModel(MODELS[0])}
              >
                <Text style={[s.modeOptText, model.id === "auto/mansh" && { color: "#fff" }]}>✨ Mansh Mode</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modeOpt, model.id !== "auto/mansh" && s.modeOptActive]}
                onPress={() => setModel(MODELS[2])}
              >
                <Text style={[s.modeOptText, model.id !== "auto/mansh" && { color: "#fff" }]}>Standard</Text>
              </TouchableOpacity>
            </View>

            {/* Prompt Sparks */}
            <TouchableOpacity style={s.sparksToggle} onPress={() => setShowSparks(p => !p)}>
              <Ionicons name="flash-outline" size={13} color="#555" />
              <Text style={s.sparksToggleText}>Prompt Sparks</Text>
              <Ionicons name={showSparks ? "chevron-up" : "chevron-down"} size={12} color="#444" />
            </TouchableOpacity>

            {showSparks && (
              <View style={s.sparksGrid}>
                {PROMPT_SPARKS.map(spark => (
                  <TouchableOpacity
                    key={spark.label}
                    style={s.sparkChip}
                    onPress={() => setInput(spark.prompt)}
                  >
                    <Text style={{ fontSize: 14 }}>{spark.icon}</Text>
                    <Text style={s.sparkLabel}>{spark.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

           {/* Quick links */}
            <View style={s.quickLinks}>
              <TouchableOpacity style={s.quickLink} onPress={() => router.push("/personas")}>
                <Text style={{ fontSize: 20 }}>👤</Text>
                <Text style={s.quickLinkText}>Personas</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.quickLink} onPress={() => router.push("/council")}>
                <Text style={{ fontSize: 20 }}>⚔️</Text>
                <Text style={s.quickLinkText}>Council</Text>
              </TouchableOpacity>
              
              {/* 🚀 FIX: Hide this Upgrade quick link if you are the Creator */}
              {!isCreator && (
                <TouchableOpacity style={s.quickLink} onPress={() => router.push("/upgrade")}>
                  <Text style={{ fontSize: 20 }}>⭐</Text>
                  <Text style={s.quickLinkText}>Upgrade</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        )}

        {/* MESSAGES */}
        {!isEmpty && (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={s.msgList}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* INPUT AREA */}
        <View style={s.inputWrap}>
          {/* Attached image preview */}
          {attachedImage && (
            <View style={s.imgPreview}>
              <Image source={{ uri: attachedImage.uri }} style={s.imgPreviewImg} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#ccc", fontSize: 12, fontWeight: "600" }}>Image attached</Text>
                <Text style={{ color: "#555", fontSize: 11, marginTop: 2 }}>Cornea 1.0 will analyze it</Text>
              </View>
              <TouchableOpacity onPress={() => setAttachedImage(null)}>
                <Ionicons name="close-circle" size={20} color="#555" />
              </TouchableOpacity>
            </View>
          )}

          <View style={[s.inputPill, shadowMode && s.inputPillShadow]}>
            {/* Image attach button - always visible */}
            <TouchableOpacity style={s.attachBtn} onPress={pickImage}>
              <Ionicons name="image-outline" size={18} color={attachedImage ? "#fca5a5" : "#444"} />
            </TouchableOpacity>

            <TextInput
              style={s.inputTA}
              value={input}
              onChangeText={setInput}
              placeholder={
                shadowMode ? "State your belief..." :
                attachedImage ? "Ask about this image..." :
                activeConv?.isPersona ? "Message..." : "Ask me anything..."
              }
              placeholderTextColor="#2a2a2a"
              multiline
              maxLength={5000}
            />

            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: atm.accent }, (!input.trim() && !attachedImage || loading) && s.sendBtnDis]}
              onPress={() => sendMessage()}
              disabled={(!input.trim() && !attachedImage) || loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#000" />
                : <Ionicons name="arrow-up" size={18} color="#000" />
              }
            </TouchableOpacity>
          </View>

          {/* Quick actions */}
          <View style={s.quickActions}>
            <TouchableOpacity style={s.qaChip} onPress={enhancePrompt} disabled={enhancing || !input.trim()}>
              <Ionicons name="sparkles-outline" size={11} color={enhancing ? "#333" : "#555"} />
              <Text style={s.qaChipText}>{enhancing ? "..." : "Enhance"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.qaChip, shadowMode && s.qaChipShadow]} onPress={() => setShadowMode(p => !p)}>
              <Text style={{ fontSize: 11 }}>👹</Text>
              <Text style={[s.qaChipText, shadowMode && { color: "#f97316" }]}>Shadow</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.qaChip} onPress={() => { setShowSparks(p => !p); }}>
              <Ionicons name="flash-outline" size={11} color="#555" />
              <Text style={s.qaChipText}>Sparks</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.qaChip, model.vision && { borderColor: "#fca5a540" }]} onPress={pickImage}>
              <Ionicons name="camera-outline" size={11} color={model.vision ? "#fca5a5" : "#555"} />
              <Text style={[s.qaChipText, model.vision && { color: "#fca5a5" }]}>Image</Text>
            </TouchableOpacity>
          </View>

          {/* Sparks dropdown when triggered from input area */}
          {showSparks && !isEmpty && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {PROMPT_SPARKS.map(spark => (
                  <TouchableOpacity
                    key={spark.label}
                    style={s.sparkChipSmall}
                    onPress={() => { setInput(spark.prompt); setShowSparks(false); }}
                  >
                    <Text style={{ fontSize: 12 }}>{spark.icon}</Text>
                    <Text style={s.sparkLabelSmall}>{spark.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  // Drawer
  drawerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.65)", zIndex: 100 },
  drawer: { position: "absolute", left: 0, top: 0, bottom: 0, width: 280, backgroundColor: "rgba(4,4,8,0.99)", borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.05)", zIndex: 200, flexDirection: "column" },
  drawerHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 20, paddingTop: 58, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  drawerMark: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  drawerTitle: { fontSize: 15, fontWeight: "700", color: "#ddd" },
  drawerSearch: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 10, fontSize: 13, color: "#bbb", marginBottom: 8 },
  drawerNewBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", marginBottom: 4 },
  drawerNewBtnText: { fontSize: 13.5, fontWeight: "600" },
  drawerSection: { fontSize: 9.5, color: "#2a2a2a", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700", paddingVertical: 10, paddingHorizontal: 4 },
  drawerItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, marginBottom: 1 },
  drawerItemText: { fontSize: 13.5, color: "#555", fontWeight: "500" },
  convItem: { padding: 12, borderRadius: 12, marginBottom: 2, borderWidth: 1, borderColor: "transparent" },
  convItemActive: { backgroundColor: "rgba(255,255,255,0.04)" },
  convTitle: { fontSize: 13, color: "#666", lineHeight: 18, flex: 1 },
  convSub: { fontSize: 10, color: "#2a2a2a", marginTop: 3 },
  drawerFoot: { padding: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)" },
  drawerUser: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 10 },
  drawerAv: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  drawerUserName: { fontSize: 13, fontWeight: "500", color: "#999" },
  upgradeChip: { backgroundColor: "rgba(250,204,21,0.08)", borderWidth: 1, borderColor: "rgba(250,204,21,0.2)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  upgradeChipText: { fontSize: 10.5, fontWeight: "700", color: "#facc15" },

  // Topbar
  topbar: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 52, paddingBottom: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", backgroundColor: "rgba(4,4,8,0.97)" },
  iconBtn: { padding: 8, borderRadius: 8 },
  iconBtnShadow: { backgroundColor: "rgba(249,115,22,0.1)" },
  modelBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  modelBtnText: { flex: 1, color: "#ccc", fontSize: 13, fontWeight: "600" },
  modelDotSm: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  topRight: { flexDirection: "row", alignItems: "center", gap: 2 },
  atmDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 2 },

  // Banners
  bannerRed: { backgroundColor: "#7f1d1d", padding: 10, borderBottomWidth: 1, borderBottomColor: "#991b1b" },
  shadowBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "rgba(249,115,22,0.06)", borderBottomWidth: 1, borderBottomColor: "rgba(249,115,22,0.15)" },
  shadowBannerText: { color: "#f97316", fontSize: 12, flex: 1 },
  shadowOff: { color: "#f97316", fontSize: 11.5, fontWeight: "700", backgroundColor: "rgba(249,115,22,0.1)", borderWidth: 1, borderColor: "rgba(249,115,22,0.25)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  errorBar: { flexDirection: "row", alignItems: "center", margin: 12, backgroundColor: "rgba(255,50,50,0.06)", borderWidth: 1, borderColor: "rgba(255,80,80,0.15)", borderRadius: 12, padding: 12, gap: 10 },

  // Empty state
  emptyScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 },
  emptyTitle: { fontSize: 34, fontWeight: "800", color: "#fff", marginBottom: 8, letterSpacing: -1.5 },
  emptySubtitle: { fontSize: 15, color: "#333", marginBottom: 28 },
  modeToggle: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 99, padding: 4, marginBottom: 20 },
  modeOpt: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 99, borderWidth: 1, borderColor: "transparent" },
  modeOptActive: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.08)" },
  modeOptText: { fontSize: 13.5, fontWeight: "600", color: "#444" },

  // Sparks
  sparksToggle: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 10, marginBottom: 12 },
  sparksToggleText: { fontSize: 12.5, color: "#555", fontWeight: "600", flex: 1 },
  sparksGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20, justifyContent: "center" },
  sparkChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  sparkLabel: { fontSize: 12.5, color: "#666", fontWeight: "500" },
  sparkChipSmall: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  sparkLabelSmall: { fontSize: 11.5, color: "#555", fontWeight: "500" },

  // Quick links
  quickLinks: { flexDirection: "row", gap: 12 },
  quickLink: { alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16 },
  quickLinkText: { fontSize: 12, color: "#555", fontWeight: "600" },

  // Messages
  msgList: { padding: 16, paddingBottom: 8 },
  msgRow: { flexDirection: "row", gap: 12, marginBottom: 26 },
  msgAv: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, flexShrink: 0, marginTop: 2 },
  msgAvUser: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.07)" },
  msgAvText: { fontSize: 11, fontWeight: "800" },
  msgName: { fontSize: 13, fontWeight: "700" },
  shadowBadge: { backgroundColor: "rgba(249,115,22,0.08)", borderWidth: 1, borderColor: "rgba(249,115,22,0.2)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  msgText: { fontSize: 15, color: "#9aa0b0", lineHeight: 25 },
  msgTextUser: { color: "#d0d4de" },
  copyBtn: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  typingDots: { flexDirection: "row", gap: 5, paddingTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  routingChip: { backgroundColor: "rgba(250,204,21,0.05)", borderWidth: 1, borderColor: "rgba(250,204,21,0.15)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 18, alignSelf: "flex-start", marginLeft: 40 },
  routingText: { color: "#fbbf24", fontSize: 12, fontStyle: "italic" },
  attachedImg: { width: "100%", height: 180, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },

  // Thinking
  thinkWrap: { backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 10, marginBottom: 10 },
  thinkHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  thinkHeaderText: { fontSize: 11.5, color: "#383838" },
  thinkBody: { fontSize: 12.5, color: "#2e2e2e", lineHeight: 20, marginTop: 8, fontStyle: "italic" },

  // Input
  inputWrap: { paddingHorizontal: 14, paddingBottom: 24, paddingTop: 8 },
  imgPreview: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(252,165,165,0.05)", borderWidth: 1, borderColor: "rgba(252,165,165,0.15)", borderRadius: 14, padding: 12, marginBottom: 10 },
  imgPreviewImg: { width: 48, height: 48, borderRadius: 10 },
  inputPill: { flexDirection: "row", alignItems: "flex-end", gap: 8, backgroundColor: "rgba(8,8,14,0.95)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10 },
  inputPillShadow: { borderColor: "rgba(249,115,22,0.3)" },
  attachBtn: { padding: 6 },
  inputTA: { flex: 1, color: "#ddd", fontSize: 15, maxHeight: 120, lineHeight: 22, minHeight: 24 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  sendBtnDis: { backgroundColor: "rgba(255,255,255,0.05)" },
  quickActions: { flexDirection: "row", gap: 7, marginTop: 10, flexWrap: "wrap" },
  qaChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(8,8,14,0.8)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 99, paddingHorizontal: 11, paddingVertical: 7 },
  qaChipShadow: { borderColor: "rgba(249,115,22,0.35)", backgroundColor: "rgba(249,115,22,0.06)" },
  qaChipText: { color: "#555", fontSize: 11.5, fontWeight: "500" },

  // Model sheet
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "flex-end" },
  modelSheet: { backgroundColor: "rgba(6,6,12,0.99)", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 20, paddingBottom: 44, maxHeight: "82%" },
  sheetHandle: { width: 36, height: 4, backgroundColor: "#222", borderRadius: 2, alignSelf: "center", marginBottom: 18 },
  sheetTitle: { color: "#fff", fontSize: 17, fontWeight: "700", marginBottom: 18, paddingHorizontal: 4 },
  modelItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: "transparent", marginBottom: 4 },
  modelItemFirst: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", marginBottom: 12, paddingBottom: 18 },
  modelItemActive: { backgroundColor: "rgba(255,255,255,0.04)" },
  modelDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  modelName: { color: "#fff", fontSize: 14, fontWeight: "700" },
  modelDesc: { color: "#444", fontSize: 11.5, marginTop: 2 },
  visionBadge: { backgroundColor: "rgba(252,165,165,0.1)", borderWidth: 1, borderColor: "rgba(252,165,165,0.25)", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  visionBadgeText: { fontSize: 10, color: "#fca5a5", fontWeight: "600" },

  // Rename modal
  overlayCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 20 },
  renameBox: { backgroundColor: "rgba(8,8,14,0.99)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 22, padding: 24, width: "100%" },
  renameTitle: { fontSize: 17, fontWeight: "700", color: "#fff", marginBottom: 16 },
  renameInput: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 12, padding: 14, fontSize: 15, color: "#fff" },
  renameBtn: { paddingVertical: 13, borderRadius: 12, alignItems: "center" },
});
