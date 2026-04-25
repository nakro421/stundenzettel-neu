import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDECr2BPIPNKS0B-a56iZPSZt06hrXnOQs",
  authDomain: "stunden-konto.firebaseapp.com",
  projectId: "stunden-konto",
  storageBucket: "stunden-konto.firebasestorage.app",
  messagingSenderId: "545147869331",
  appId: "1:545147869331:web:ad7e32a00dcc5bb909566",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);