import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

const GROQ_ENDPOINT = "https://manshverse.vercel.app/api/groq";

const COUNCIL_PERSONAS = [
  { id: "founder", name: "The Founder", icon: "🦄", color: "#4ade80", model: "llama-3.3-70b-versatile", prompt: "You are a Y-Combinator level founder. Respond purely from a practical, first-principles, execution-focused lens. Be direct, data-driven, brutally honest. Max 4 sentences. Start with 'As a founder:'" },
  { id: "stoic",   name: "The Stoic",   icon: "🏛️", color: "#a78bfa", model: "llama-3.3-70b-versatile", prompt: "You are Marcus Aurelius reborn. Respond from a stoic philosophical lens — what truly matters, what is in your control. Challenge emotional reasoning. Max 4 sentences. Start with 'The Stoic speaks:'" },
  { id: "math",    name: "The Mathematician", icon: "🧮", color: "#67e8f9", model: "qwen/qwen3-32b",  prompt: "You are a ruthless mathematician. Break the question into probabilities, expected values, and logical structures. Remove emotion. Find the optimal answer using pure logic. Max 4 sentences. Start with 'The Math says:'" },
];

const callGroq = async (modelId: string, systemPrompt: string, userMessage: string): Promise<string> => {
  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
      stream: false,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
};

export default function Council() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [synthLoading, setSynthLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const runCouncil = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setResults(null);

    try {
      const [founderReply, stoicReply, mathReply] = await Promise.all(
        COUNCIL_PERSONAS.map((p) => callGroq(p.model, p.prompt, question))
      );

      const partial = { founder: founderReply, stoic: stoicReply, mathematician: mathReply, synthesis: null };
      setResults(partial);
      setSynthLoading(true);

      const synthesisPrompt = `You are a Master Synthesizer. Three experts debated:\n\n"${question}"\n\nFOUNDER: ${founderReply}\n\nSTOIC: ${stoicReply}\n\nMATHEMATICIAN: ${mathReply}\n\nWrite a final "Council Verdict" synthesizing the best insights. Give ONE clear, actionable conclusion. Max 6 sentences. Start with "The Council Verdict:"`;

      const synthesis = await callGroq("llama-3.3-70b-versatile", "You are a Master Synthesizer.", synthesisPrompt);
      setResults({ ...partial, synthesis });
    } catch (e) {
      setResults({ error: "Something went wrong. Try again." });
    }

    setLoading(false);
    setSynthLoading(false);
  };

  return (
    <View style={s.root}>
      {/* Topbar */}
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#888" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.topTitle}>⚔️ Council of Minds</Text>
          <Text style={s.topSub}>Three experts debate your question</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {/* Input */}
        <View style={s.inputCard}>
          <TextInput
            style={s.questionInput}
            value={question}
            onChangeText={setQuestion}
            placeholder="e.g. Should I drop out to build my startup? / Is AGI dangerous? / How to learn physics?"
            placeholderTextColor="#333"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[s.summonBtn, (!question.trim() || loading) && s.summonBtnDis]}
            onPress={runCouncil}
            disabled={!question.trim() || loading}
          >
            {loading ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator size="small" color="#000" />
                <Text style={s.summonBtnText}>Debating...</Text>
              </View>
            ) : (
              <Text style={s.summonBtnText}>Summon The Council ⚔️</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Results */}
        {results?.error && (
          <View style={s.errorCard}><Text style={{ color: "#fca5a5", fontSize: 14 }}>{results.error}</Text></View>
        )}

        {results && !results.error && (
          <View style={{ gap: 14 }}>
            {COUNCIL_PERSONAS.map((persona) => {
              const reply = results[persona.id];
              if (!reply) return null;
              return (
                <View key={persona.id} style={s.councilCard}>
                  <View style={s.councilCardHead}>
                    <View style={[s.councilIcon, { backgroundColor: `${persona.color}18`, borderColor: `${persona.color}30` }]}>
                      <Text style={{ fontSize: 20 }}>{persona.icon}</Text>
                    </View>
                    <View>
                      <Text style={[s.councilName, { color: persona.color }]}>{persona.name}</Text>
                      <Text style={s.councilLabel}>Council Member</Text>
                    </View>
                  </View>
                  <Text style={s.councilBody}>{reply}</Text>
                </View>
              );
            })}

            {synthLoading && !results.synthesis && (
              <View style={s.synthesisCard}>
                <Text style={s.synthLabel}>⚡ Synthesizing verdict...</Text>
                <ActivityIndicator color="#a78bfa" style={{ marginTop: 12 }} />
              </View>
            )}

            {results.synthesis && (
              <View style={s.synthesisCard}>
                <Text style={s.synthLabel}>⚡ Council Verdict</Text>
                <Text style={s.synthBody}>{results.synthesis}</Text>
                <TouchableOpacity style={s.askAgainBtn} onPress={() => { setResults(null); setQuestion(""); }}>
                  <Text style={{ color: "#888", fontWeight: "600", fontSize: 13 }}>Ask Another Question</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  topbar: { flexDirection: "row", alignItems: "center", paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#111", backgroundColor: "rgba(5,5,10,0.96)" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  topSub: { fontSize: 12, color: "#555", marginTop: 2 },
  inputCard: { backgroundColor: "rgba(10,10,15,0.8)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 20, padding: 18, marginBottom: 24 },
  questionInput: { color: "#fff", fontSize: 15, minHeight: 80, lineHeight: 24, marginBottom: 16 },
  summonBtn: { backgroundColor: "#fff", borderRadius: 14, padding: 15, alignItems: "center" },
  summonBtnDis: { backgroundColor: "rgba(255,255,255,0.1)" },
  summonBtnText: { color: "#000", fontWeight: "700", fontSize: 15 },
  errorCard: { backgroundColor: "rgba(255,50,50,0.07)", borderWidth: 1, borderColor: "rgba(255,80,80,0.2)", borderRadius: 14, padding: 16 },
  councilCard: { backgroundColor: "rgba(10,10,15,0.85)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 18, overflow: "hidden" },
  councilCardHead: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  councilIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  councilName: { fontSize: 14, fontWeight: "700" },
  councilLabel: { fontSize: 11, color: "#555", marginTop: 2 },
  councilBody: { padding: 18, fontSize: 14.5, color: "#9aa0b0", lineHeight: 24 },
  synthesisCard: { backgroundColor: "rgba(124,92,252,0.06)", borderWidth: 1, borderColor: "rgba(124,92,252,0.25)", borderRadius: 18, padding: 22 },
  synthLabel: { fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: "#a78bfa", marginBottom: 12 },
  synthBody: { fontSize: 15, color: "#d0c8ff", lineHeight: 26 },
  askAgainBtn: { marginTop: 20, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 12, padding: 14, alignItems: "center" },
});