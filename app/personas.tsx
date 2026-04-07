import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ImageSourcePropType,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../src/lib/firebase";

type HistoricalPersona = {
  id: string;
  label: string;
  sub: string;
  img: ImageSourcePropType;
  prompt: string;
};

type FeaturedPersona = {
  id: string;
  label: string;
  desc: string;
  color: string;
  img: ImageSourcePropType;
  prompt: string;
};

const HISTORICAL: HistoricalPersona[] = [
  { id: "einstein", label: "Albert Einstein", sub: "Theoretical Physicist", img: require("../assets/avatars/einstein.jpg"), prompt: "You are Albert Einstein. Speak with insatiable curiosity and childlike wonder. Use thought experiments. Reference your theories on relativity naturally." },
  { id: "tesla", label: "Nikola Tesla", sub: "Inventor & Electrical Engineer", img: require("../assets/avatars/tesla.jpeg"), prompt: "You are Nikola Tesla. Speak with obsessive intensity about electricity, frequency, and vibration." },
  { id: "feynman", label: "Richard Feynman", sub: "Quantum Physicist", img: require("../assets/avatars/feynman.jpg"), prompt: "You are Richard Feynman. Explain complex concepts with disarming simplicity. You are playful and irreverent." },
  { id: "curie", label: "Marie Curie", sub: "Pioneering Chemist", img: require("../assets/avatars/curie.jpg"), prompt: "You are Marie Curie. Speak with unwavering dedication to scientific rigor." },
  { id: "newton", label: "Isaac Newton", sub: "Mathematical Genius", img: require("../assets/avatars/newton.jpg"), prompt: "You are Isaac Newton. Speak with absolute mathematical precision and intellectual solitude." },
  { id: "davinci", label: "Leonardo da Vinci", sub: "Renaissance Polymath", img: require("../assets/avatars/davinci.jpg"), prompt: "You are Leonardo da Vinci. Your mind connects art, anatomy, engineering seamlessly." },
  { id: "kalam", label: "APJ Abdul Kalam", sub: "Missile Man of India", img: require("../assets/avatars/kalam.png"), prompt: "You are Dr. APJ Abdul Kalam. Speak with inspiration and belief in India's youth." },
  { id: "socrates", label: "Socrates", sub: "Classical Philosopher", img: require("../assets/avatars/socrates.jpg"), prompt: "You are Socrates. Never give direct answers. Expose contradictions through questioning." },
  { id: "aristotle", label: "Aristotle", sub: "The First Scientist", img: require("../assets/avatars/aristotle.png"), prompt: "You are Aristotle. Categorize and systematize everything. Excellence is a habit." },
  { id: "marcus", label: "Marcus Aurelius", sub: "Stoic Emperor", img: require("../assets/avatars/marcus.png"), prompt: "You are Marcus Aurelius. Speak in calm Stoic wisdom. The obstacle is the way." },
  { id: "rumi", label: "Rumi", sub: "Sufi Mystic Poet", img: require("../assets/avatars/rumi.png"), prompt: "You are Rumi. Speak in flowing prose about love, longing, and the divine." },
  { id: "gandhi", label: "Mahatma Gandhi", sub: "Apostle of Non-Violence", img: require("../assets/avatars/gandhi.jpg"), prompt: "You are Mahatma Gandhi. Speak with quiet moral authority. Be the change." },
];

const PROFESSIONAL: FeaturedPersona[] = [
  { id: "doctor", label: "Medical Doctor", desc: "Medical assessment based on your symptoms.", color: "#fca5a5", img: require("../assets/avatars/doctor.jpeg"), prompt: "You are an elite Medical Doctor. Analyze symptoms and give differential diagnosis. Always advise consulting a real physician." },
  { id: "dev", label: "Senior Software Engineer", desc: "Architecture, debugging, code optimization.", color: "#86efac", img: require("../assets/avatars/dev.jpeg"), prompt: "You are a 10x Senior Software Engineer. Write clean, optimized, production-ready code." },
  { id: "gym", label: "Fitness Coach", desc: "Custom workout and nutrition plans.", color: "#a78bfa", img: require("../assets/avatars/gym.jpeg"), prompt: "You are an elite Fitness Coach. Design scientific, actionable workout and diet plans." },
  { id: "lawyer", label: "Legal Advisor", desc: "Legal strategy and risk assessment.", color: "#67e8f9", img: require("../assets/avatars/lawyer.jpeg"), prompt: "You are a sharp Legal Advisor. Analyze case facts and give strategic options. Note this isn't formal legal counsel." },
  { id: "chef", label: "Michelin-Star Chef", desc: "Gourmet recipes from your ingredients.", color: "#fde68a", img: require("../assets/avatars/chef.jpeg"), prompt: "You are a Michelin-Star Chef. Create step-by-step recipes using only provided ingredients." },
  { id: "finance", label: "Investment Advisor", desc: "Wealth management and investment strategy.", color: "#3b82f6", img: require("../assets/avatars/finance.jpeg"), prompt: "You are a Wealth Advisor. Give conservative, realistic financial advice focused on compounding." },
  { id: "therapist", label: "Clinical Therapist", desc: "Mental health support and CBT strategies.", color: "#f472b6", img: require("../assets/avatars/therapist.jpeg"), prompt: "You are a licensed Clinical Therapist specializing in CBT. Create a safe, non-judgmental space." },
  { id: "professor", label: "University Professor", desc: "Academic explanations and research guidance.", color: "#818cf8", img: require("../assets/avatars/professor.jpeg"), prompt: "You are a tenured Ivy League Professor. Explain with rigorous academic depth." },
];

const FICTIONAL: FeaturedPersona[] = [
  { id: "sherlock", label: "Sherlock Holmes", desc: "Logical deduction applied to your problems.", color: "#67e8f9", img: require("../assets/avatars/sherlock.png"), prompt: "You are Sherlock Holmes. Speak with cold, incisive logic. Make rapid deductions from small details." },
  { id: "ironman", label: "Tony Stark", desc: "Sarcastic brilliance with engineering depth.", color: "#fca5a5", img: require("../assets/avatars/ironman.png"), prompt: "You are Tony Stark. Speak with charismatic rapid-fire wit and engineering genius." },
  { id: "hermione", label: "Hermione Granger", desc: "Encyclopedic knowledge and research focus.", color: "#a78bfa", img: require("../assets/avatars/hermione.jpg"), prompt: "You are Hermione Granger. Speak with methodical precision and love of books and rules." },
  { id: "yoda", label: "Master Yoda", desc: "Ancient wisdom in inverted syntax.", color: "#86efac", img: require("../assets/avatars/yoda.png"), prompt: "You are Master Yoda. Speak ALWAYS in inverted sentence structure. Dispense profound wisdom." },
  { id: "tyrion", label: "Tyrion Lannister", desc: "Dark wit and strategic advice.", color: "#fbbf24", img: require("../assets/avatars/tyrion.jpg"), prompt: "You are Tyrion Lannister. Speak with devastating wit and unexpected empathy. You drink and know things." },
  { id: "spock", label: "Mr. Spock", desc: "Pure Vulcan logic. Emotion is irrelevant.", color: "#3b82f6", img: require("../assets/avatars/spock.png"), prompt: "You are Spock. Speak with absolute logical precision. Reject emotional reasoning." },
  { id: "walter", label: "Walter White", desc: "Chemistry genius with strategic thinking.", color: "#fde68a", img: require("../assets/avatars/walter.png"), prompt: "You are Walter White. Speak with quiet intensity and absolute precision. Apply chemistry logic to any problem." },
];

const TABS = [
  { id: "historical", label: "Historical" },
  { id: "professional", label: "Professional" },
  { id: "fictional", label: "Fictional" },
];

function AvatarTile({
  label,
  subtitle,
  source,
  onPress,
}: {
  label: string;
  subtitle: string;
  source: ImageSourcePropType;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.avCard} onPress={onPress}>
      {/* 🚀 FIX: Wrap the image in a View to force the square shape on Android */}
      <View style={s.imgWrapper}>
        <Image source={source} style={s.avImg} resizeMode="cover" />
      </View>
      <View style={s.avInfo}>
        <Text style={s.avName}>{label}</Text>
        <Text style={s.avSub}>{subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

function DetailTile({
  label,
  desc,
  color,
  source,
  onPress,
}: {
  label: string;
  desc: string;
  color: string;
  source: ImageSourcePropType;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.proCard} onPress={onPress}>
      <Image source={source} style={[s.proAvatar, { borderColor: `${color}45` }]} resizeMode="cover" />
      <View style={{ flex: 1 }}>
        <Text style={[s.proTag, { color }]}>EXPERT</Text>
        <Text style={s.proName}>{label}</Text>
        <Text style={s.proDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#444" />
    </TouchableOpacity>
  );
}

export default function Personas() {
  const [tab, setTab] = useState("historical");
  const user = auth.currentUser;

  const startPersonaChat = async (persona: { id: string; label: string; prompt: string }) => {
    if (!user?.uid) return;
    try {
      await addDoc(collection(db, "users", user.uid, "conversations"), {
        title: `Chat with ${persona.label}`,
        createdAt: serverTimestamp(),
        model: "Astral 2.0",
        isPersona: true,
        personaId: persona.id,
        personaPrompt: persona.prompt,
        personaContextData: "",
      });
      router.push("/(tabs)/chat");
    } catch {}
  };

  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#888" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.topTitle}>Choose a Persona</Text>
          <Text style={s.topSub}>Talk to great minds from history</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.id} style={[s.tabBtn, tab === t.id && s.tabBtnActive]} onPress={() => setTab(t.id)}>
            <Text style={[s.tabText, tab === t.id && { color: "#fff" }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {tab === "historical" && (
          <View style={s.grid}>
            {HISTORICAL.map((persona) => (
              <AvatarTile
                key={persona.id}
                label={persona.label}
                subtitle={persona.sub}
                source={persona.img}
                onPress={() => startPersonaChat(persona)}
              />
            ))}
          </View>
        )}

        {tab === "professional" && (
          <View style={{ gap: 12 }}>
            {PROFESSIONAL.map((persona) => (
              <DetailTile
                key={persona.id}
                label={persona.label}
                desc={persona.desc}
                color={persona.color}
                source={persona.img}
                onPress={() => startPersonaChat(persona)}
              />
            ))}
          </View>
        )}

        {tab === "fictional" && (
          <View style={s.grid}>
            {FICTIONAL.map((persona) => (
              <AvatarTile
                key={persona.id}
                label={persona.label}
                subtitle={persona.desc}
                source={persona.img}
                onPress={() => startPersonaChat(persona)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
    backgroundColor: "rgba(5,5,10,0.96)",
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  topSub: { fontSize: 12, color: "#555", marginTop: 2 },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: "#7c5cfc" },
  tabText: { fontSize: 12.5, fontWeight: "600", color: "#555" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  avCard: {
    width: "47%",
    backgroundColor: "rgba(10,10,15,0.7)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 20,
    overflow: "hidden",
  },
  // 🚀 FIX: Add the wrapper style and change the image style
  imgWrapper: { width: "100%", aspectRatio: 1 },
  avImg: { width: "100%", height: "100%" },
  
  avInfo: { padding: 14 },
  avName: { fontSize: 14, fontWeight: "600", color: "#fff", marginBottom: 4 },
  avSub: { fontSize: 11, color: "#666", lineHeight: 16 },
  proCard: {
    backgroundColor: "rgba(10,10,15,0.7)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  proAvatar: {
    width: 64,
    height: 64,
    borderRadius: 14,
    borderWidth: 1,
  },
  proTag: {
    fontSize: 9.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  proName: { fontSize: 16, fontWeight: "600", color: "#fff", marginBottom: 4 },
  proDesc: { fontSize: 12.5, color: "#666", lineHeight: 18 },
});
