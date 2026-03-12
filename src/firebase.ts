import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfigInternal from '../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseConfigInternal.apiKey,
  authDomain: firebaseConfigInternal.authDomain,
  projectId: firebaseConfigInternal.projectId,
  appId: firebaseConfigInternal.appId,
  firestoreDatabaseId: firebaseConfigInternal.firestoreDatabaseId
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const signIn = () => signInWithPopup(auth, googleProvider);
export const logOut = () => signOut(auth);

export { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail };
