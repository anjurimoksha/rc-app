import { createContext, useContext, useEffect, useState } from 'react';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, secondaryAuth, db } from '../firebase';

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
        } else {
            // Auth account exists but no Firestore doc
            setUserRole('incomplete');
            setUserData(null);
        }
        return { user: cred.user, role: snap.data()?.role || 'incomplete' };
    }

    async function register(email, password, name, role) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
            uid: cred.user.uid, email, name, role,
            hospital: 'Apollo Hospitals',
            createdAt: new Date(),
        });
        return cred;
    }

    /**
     * Admin-only: create a new user without signing out the admin.
     * Uses the secondary Firebase Auth instance.
     */
    async function adminCreateUser(email, password, profileData) {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const uid = cred.user.uid;
        // Write to users collection
        await setDoc(doc(db, 'users', uid), {
            uid, email,
            ...profileData,
            createdAt: serverTimestamp(),
        });
        // If patient, also write to patients collection (used by doctor portal)
        if (profileData.role === 'patient') {
            await setDoc(doc(db, 'patients', uid), {
                uid, email,
                name: profileData.name,
                age: profileData.age || '—',
                gender: profileData.gender || '—',
                diagnosis: profileData.condition || profileData.diagnosis || '—',
                condition: profileData.condition || '—',
                risk: profileData.riskLevel || 'medium',
                riskLevel: profileData.riskLevel || 'medium',
                assignedDoctorId: profileData.assignedDoctorId || null,
                recoveryDay: 0,
                admissionDate: profileData.admissionDate || null,
                phone: profileData.phone || '',
                flagged: false,
                createdAt: serverTimestamp(),
            });
        }
        // Sign out secondary instance so it doesn't conflict
        await secondaryAuth.signOut();
        return { uid, email };
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
                    } else {
                        setUserRole('incomplete');
                        setUserData(null);
                    }
                } catch (e) {
                    console.error('Error fetching user role:', e);
                }
            } else {
                setUserRole(null);
                setUserData(null);
            }
            setLoading(false);
        });
        return unsub;
    }, []);

    const value = {
        currentUser, userRole, userData,
        login, register, adminCreateUser, logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
