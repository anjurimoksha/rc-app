import { useEffect, useState } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';
import ChatWindow from '../../components/ChatWindow';

// Doctor demo UID (set by seed)
const DOCTOR_ID = 'DOCTOR_DEMO_UID';
const DOCTOR_NAME = 'Dr. Priya Sharma';

export default function PatientChat() {
    const { currentUser } = useAuth();
    const chatId = currentUser ? `${currentUser.uid}_${DOCTOR_ID}` : null;

    return (
        <>
            <Navbar portalType="patient" />
            <div className="page" style={{ maxWidth: 750 }}>
                <div className="page-header">
                    <h1>💬 Chat with Doctor</h1>
                    <p>Your conversation with Dr. Priya Sharma — messages are end-to-end secure</p>
                </div>
                {chatId && (
                    <ChatWindow
                        chatId={chatId}
                        recipientName={DOCTOR_NAME}
                        recipientId={DOCTOR_ID}
                        recipientRole="doctor"
                    />
                )}
            </div>
        </>
    );
}
