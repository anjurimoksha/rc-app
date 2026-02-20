import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyBxPZwH4UIgYXEp6OmTfY1kYvXbDoNj9Gs",
    authDomain: "recovery-companion-demo.firebaseapp.com",
    projectId: "recovery-companion-demo",
    storageBucket: "recovery-companion-demo.firebasestorage.app",
    messagingSenderId: "387262972852",
    appId: "1:387262972852:web:2c6af221d3d0f5576228e1",
    measurementId: "G-GNGW8X4WVS"
};

const app = initializeApp(firebaseConfig);
// Secondary app for creating patient accounts without signing out the doctor
const secondaryApp = initializeApp(firebaseConfig, 'secondary');

export const auth = getAuth(app);
export const secondaryAuth = getAuth(secondaryApp);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
