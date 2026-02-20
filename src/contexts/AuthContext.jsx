import { createContext, useContext, useEffect, useState } from 'react';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    async function login(email, password) {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const snap = await getDoc(doc(db, 'users', cred.user.uid));
        if (snap.exists()) {
            setUserRole(snap.data().role);
            setUserData(snap.data());
        }
        return { user: cred.user, role: snap.data()?.role };
    }

    async function register(email, password, name, role) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
            uid: cred.user.uid,
            email,
            name,
            role,
            hospital: 'Apollo Hospitals',
            createdAt: new Date(),
        });
        return cred;
    }

    function logout() {
        setUserRole(null);
        setUserData(null);
        return signOut(auth);
    }

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);
            if (user) {
                try {
                    const snap = await getDoc(doc(db, 'users', user.uid));
                    if (snap.exists()) {
                        setUserRole(snap.data().role);
                        setUserData(snap.data());
                    }
                } catch (e) {
                    console.error('Error fetching user role:', e);
                }
            }
            setLoading(false);
        });
        return unsub;
    }, []);

    const value = {
        currentUser,
        userRole,
        userData,
        login,
        register,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
