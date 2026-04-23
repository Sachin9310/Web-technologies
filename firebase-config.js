console.log("✅ Firebase config loading...");

// ── FIREBASE SETUP ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, getDocs, query, collection, where, serverTimestamp, addDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBXtrmWfRVXVezg2IdybiAh6NVt72uSg0U",
  authDomain: "hostel-management-system-d274b.firebaseapp.com",
  projectId: "hostel-management-system-d274b",
  storageBucket: "hostel-management-system-d274b.firebasestorage.app",
  messagingSenderId: "521180317692",
  appId: "1:521180317692:web:43dc4f560ffb198b231479",
  measurementId: "G-NWN4NPYRHW"
};

// INITIALIZE FIREBASE
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log("✅ Firebase initialized successfully!");

// EXPORT ALL FUNCTIONS
export { auth, db, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, doc, getDoc, setDoc, getDocs, query, collection, where, serverTimestamp, addDoc, deleteDoc, updateDoc };