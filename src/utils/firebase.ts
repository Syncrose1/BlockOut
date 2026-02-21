// Firebase sync integration for BlockOut
// Simple, no-login anonymous sync for hobby projects

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  enableIndexedDbPersistence,
  type Firestore
} from 'firebase/firestore';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';

// Type for the data we sync
type AnyRecord = Record<string, any>;

// Default Firebase config (embedded in app - safe to be public)
// Users can override this by setting their own config in localStorage
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCIWWHlPX_u5Xzi0HHKXpovaRWh006kWis",
  authDomain: "blockout-59350.firebaseapp.com",
  projectId: "blockout-59350",
  storageBucket: "blockout-59350.firebasestorage.app",
  messagingSenderId: "983612208586",
  appId: "1:983612208586:web:20f3186d8ac83c55f0cb33"
};

// Storage key for custom config (optional override)
const FIREBASE_CONFIG_KEY = 'blockout-firebase-config';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let isInitialized = false;

// Get Firebase config (uses default, but allows user override)
export function getFirebaseConfig() {
  try {
    const stored = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Fall through to default
  }
  return DEFAULT_FIREBASE_CONFIG;
}

// Save custom Firebase config (optional)
export function saveFirebaseConfig(config: typeof DEFAULT_FIREBASE_CONFIG): void {
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

// Clear custom Firebase config (revert to default)
export function clearFirebaseConfig(): void {
  localStorage.removeItem(FIREBASE_CONFIG_KEY);
  app = null;
  db = null;
  auth = null;
  isInitialized = false;
}

// Check if Firebase is configured (always true with default)
export function isFirebaseConfigured(): boolean {
  return true; // Always available with default config
}

// Initialize Firebase
async function initFirebase(): Promise<boolean> {
  if (isInitialized) return true;
  
  const config = getFirebaseConfig();
  if (!config) return false;
  
  try {
    app = initializeApp(config);
    db = getFirestore(app);
    auth = getAuth(app);
    
    // Enable offline persistence
    try {
      await enableIndexedDbPersistence(db);
    } catch (e) {
      // Persistence might already be enabled
      console.log('[BlockOut] Firestore persistence:', e);
    }
    
    // Sign in anonymously
    await signInAnonymously(auth);
    
    isInitialized = true;
    return true;
  } catch (e) {
    console.error('[BlockOut] Firebase init failed:', e);
    return false;
  }
}

// Sync data to Firebase
export async function syncToFirebase(data: AnyRecord): Promise<boolean> {
  if (!await initFirebase()) {
    throw new Error('Firebase not configured');
  }
  
  if (!db || !auth) {
    throw new Error('Firebase not initialized');
  }
  
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('Not authenticated');
  }
  
  const payload = {
    ...data,
    lastModified: Date.now(),
    version: (data.version || 0) + 1,
  };
  
  await setDoc(doc(db, 'users', userId, 'data', 'main'), payload);
  console.log('[BlockOut] Synced to Firebase');
  return true;
}

// Sync data from Firebase
export async function syncFromFirebase(): Promise<AnyRecord | null> {
  if (!await initFirebase()) {
    return null;
  }
  
  if (!db || !auth) {
    return null;
  }
  
  const userId = auth.currentUser?.uid;
  if (!userId) {
    return null;
  }
  
  const docRef = doc(db, 'users', userId, 'data', 'main');
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return null;
  }
  
  const data = docSnap.data();
  console.log('[BlockOut] Downloaded from Firebase, version:', data.version);
  return data;
}

// Test Firebase connection
export async function testFirebaseConnection(): Promise<boolean> {
  try {
    if (!await initFirebase()) return false;
    
    // Try to read our own data
    const data = await syncFromFirebase();
    console.log('[BlockOut] Firebase connection test:', data ? 'OK' : 'No existing data');
    return true;
  } catch (e) {
    console.error('[BlockOut] Firebase test failed:', e);
    return false;
  }
}