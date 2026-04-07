import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../src/lib/firebase";
import { router } from "expo-router";
import { View, ActivityIndicator } from "react-native";

export default function Index() {
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/(tabs)/chat");
      } else {
        router.replace("/(auth)/login");
      }
    });
    return unsub;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}