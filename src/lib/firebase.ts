import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Initialize Firestore with Database ID from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Safe Analytics Initialization
isSupported().then((supported) => {
  if (supported) {
    getAnalytics(app);
  }
}).catch((err) => {
  console.warn("Firebase Analytics support check failed or not supported in this frame environment:", err);
});
