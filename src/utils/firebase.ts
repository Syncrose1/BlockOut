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
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User
} from 'firebase/auth';

// Type for the data we sync
type AnyRecord = Record<string, any>;

// Re-export User type
export type { User } from 'firebase/auth';

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
let initPromise: Promise<boolean> | null = null;

async function initFirebase(): Promise<boolean> {
  if (isInitialized) return true;
  if (initPromise) return initPromise;
  
  const config = getFirebaseConfig();
  if (!config) return false;
  
  initPromise = (async () => {
    try {
      app = initializeApp(config);
      db = getFirestore(app);
      auth = getAuth(app);
      
      // Enable offline persistence (only once)
      try {
        await enableIndexedDbPersistence(db);
      } catch (e) {
        // Persistence might already be enabled or failed
        // This is fine, just log it
        if ((e as Error).message?.includes('already been started')) {
          // Already enabled, ignore
        } else {
          console.log('[BlockOut] Firestore persistence:', e);
        }
      }
      
      isInitialized = true;
      return true;
    } catch (e) {
      console.error('[BlockOut] Firebase init failed:', e);
      return false;
    } finally {
      initPromise = null;
    }
  })();
  
  return initPromise;
}

// Get current user (may be null during initial load)
export function getCurrentUser(): User | null {
  return auth?.currentUser || null;
}

// Wait for auth state to be determined
export function waitForAuth(timeout = 3000): Promise<User | null> {
  return new Promise((resolve) => {
    const user = getCurrentUser();
    if (user) {
      resolve(user);
      return;
    }
    
    let cleanup: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    
    const done = (result: User | null) => {
      if (timer) clearTimeout(timer);
      if (cleanup) cleanup();
      resolve(result);
    };
    
    // Set timeout
    timer = setTimeout(() => {
      done(getCurrentUser());
    }, timeout);
    
    // Listen for auth changes
    cleanup = onAuthChange((newUser) => {
      done(newUser);
    });
  });
}

// Sign in with Google
export async function signInWithGoogle(): Promise<User | null> {
  if (!await initFirebase()) {
    throw new Error('Firebase not initialized');
  }
  
  if (!auth) {
    throw new Error('Auth not initialized');
  }
  
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

// Sign out
export async function signOut(): Promise<void> {
  if (!auth) return;
  await firebaseSignOut(auth);
}

// Ensure Firebase is initialized
async function ensureFirebase(): Promise<boolean> {
  if (isInitialized) return true;
  return initFirebase();
}

// Listen to auth state changes
export function onAuthChange(callback: (user: User | null) => void): () => void {
  // Initialize Firebase asynchronously
  ensureFirebase().then(() => {
    if (auth) {
      onAuthStateChanged(auth, callback);
    } else {
      callback(null);
    }
  }).catch(() => {
    callback(null);
  });
  
  // Return a dummy cleanup function for now
  return () => {};
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