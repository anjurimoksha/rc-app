import { useEffect, useState } from 'react';
import { getDoc, doc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';
import ChatWindow from '../../components/ChatWindow';

export default function PatientChat() {
    const { currentUser } = useAuth();
    const [doctorId, setDoctorId] = useState(null);
    const [doctorName, setDoctorName] = useState('Dr. Priya Sharma');

    useEffect(() => {
        if (!currentUser) return;
        // Direct doc read — patient document ID == user UID
        getDoc(doc(db, 'patients', currentUser.uid))
            .then(snap => {
                if (snap.exists()) {
                    const pat = snap.data();
                    setDoctorId(pat.assignedDoctorId);
                    // Fetch doctor name
                    getDoc(doc(db, 'users', pat.assignedDoctorId))
                        .then(uSnap => { if (uSnap.exists()) setDoctorName(uSnap.data().name); });
                }
            });
    }, [currentUser]);

    const chatId = currentUser && doctorId ? `${currentUser.uid}_${doctorId}` : null;

    return (
        <>
            <Navbar portalType="patient" />
            <div className="page" style={{ maxWidth: 750 }}>
                <div className="page-header">
                    <h1>💬 Chat with Doctor</h1>
                    <p>Your conversation with {doctorName} — messages are end-to-end secure</p>
                </div>
                {chatId ? (
                    <ChatWindow
                        chatId={chatId}
                        recipientName={doctorName}
                        recipientId={doctorId}
                        recipientRole="doctor"
                    />
                ) : (
                    <div className="card">
                        <div className="card-body" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            Loading chat...
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
