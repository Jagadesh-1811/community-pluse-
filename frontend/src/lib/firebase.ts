import { FirebaseApp, initializeApp, getApps } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { Database, getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

let app: FirebaseApp | undefined;
let auth: Auth;
let db: Firestore;
let rtdb: Database;

try {
  const hasConfig = process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== 'your_api_key';
  
  if (hasConfig) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
    rtdb = getDatabase(app);
  } else {
    console.warn("Firebase config missing or placeholder. Running in demo mode.");
    auth = {} as Auth;
    db = {} as Firestore;
    rtdb = {} as Database;
  }
} catch (error) {
  console.error("Firebase initialization failed:", error);
  auth = {} as Auth;
  db = {} as Firestore;
  rtdb = {} as Database;
}

export { app, auth, db, rtdb };
