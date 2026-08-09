// Firebase Web SDK initialization & auth helpers
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  getIdToken
} from 'firebase/auth';
import type { User } from 'firebase/auth';

// Firebase configuration pulled from environment variables (NEXT_PUBLIC_*)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// DEBUG: log what env vars are actually available
if (typeof window !== 'undefined') {
  console.log('[ProofGuard Firebase] Config keys present:', {
    apiKey: !!firebaseConfig.apiKey,
    authDomain: !!firebaseConfig.authDomain,
    projectId: !!firebaseConfig.projectId,
    apiKeyFirstChars: firebaseConfig.apiKey ? firebaseConfig.apiKey.substring(0, 8) + '...' : 'MISSING',
  });
}

// Initialize Firebase (singleton)
let app: FirebaseApp | undefined;

function getFirebaseApp(): FirebaseApp {
  if (!app && !getApps().length) {
    // Validate that config is present
    const isValid = firebaseConfig.apiKey
      && firebaseConfig.apiKey !== 'YOUR_FIREBASE_API_KEY'
      && firebaseConfig.apiKey.length > 10;

    if (!isValid) {
      console.error('[ProofGuard Firebase] Invalid config:', {
        apiKey: firebaseConfig.apiKey ? `"${firebaseConfig.apiKey.substring(0, 15)}..."` : 'undefined/empty',
        projectId: firebaseConfig.projectId || 'undefined',
      });
      throw new Error(
        'Firebase is not configured. Please set NEXT_PUBLIC_FIREBASE_* environment variables in your .env file.'
      );
    }
    app = initializeApp(firebaseConfig);
    console.log('[ProofGuard Firebase] Initialized successfully for project:', firebaseConfig.projectId);
  } else if (getApps().length) {
    app = getApps()[0];
  }
  return app!;
}

// Lazy auth singleton
function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

// ─── Auth API ───────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signUp(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/** Sign in with Google popup */
export async function signInWithGoogle(): Promise<User> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
  return credential.user;
}

export async function signOutUser(): Promise<void> {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

/** Get a fresh Firebase ID token for the current user */
export async function getFirebaseToken(user: User): Promise<string> {
  return await getIdToken(user);
}

/**
 * Force-refresh the Firebase ID token.
 * Firebase ID tokens expire after ~1 hour; call this when an API request
 * returns 401 to keep the session alive without forcing a re-login.
 */
export async function refreshIdToken(user: User): Promise<string> {
  return await getIdToken(user, true);
}

/** Subscribe to auth state changes */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}

/** Get the current user synchronously (if already loaded) */
export function getCurrentFirebaseUser(): User | null {
  const auth = getFirebaseAuth();
  return auth.currentUser;
}

export type { User };
