import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyCOAvFoEbgZ9HtF3O5ow3St0ndpGqKcupg",
  authDomain: "manshverseai.firebaseapp.com",
  projectId: "manshverseai",
  storageBucket: "manshverseai.firebasestorage.app",
  messagingSenderId: "123681206442",
  appId: "1:123681206442:web:79cbea3d99c199270920d3",
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);