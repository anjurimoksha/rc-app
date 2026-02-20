import { useState, useEffect, useRef } from 'react';
import {
    collection, addDoc, onSnapshot, query,
    orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import VoiceInput from './VoiceInput';

/**
 * ChatWindow — real-time chat between patient and doctor.
 * Props:
 *   doctorId  — UID of the doctor (required; used to build chatId)
 *   chatId    — optional override chatId (used from doctor side: patientId_doctorId)
 *   recipientName — display name for the header
 *   recipientId   — UID to notify
 */
export default function ChatWindow({ doctorId, chatId: chatIdProp, recipientName, recipientId }) {
    const { currentUser, userData } = useAuth();
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const bottomRef = useRef(null);

    // Build chatId: always patientId_doctorId
    const resolvedDoctorId = doctorId || (userData?.role === 'doctor' ? currentUser?.uid : null);
    const patientId = userData?.role === 'patient' ? currentUser?.uid : recipientId;
    const chatId = chatIdProp || (patientId && resolvedDoctorId ? `${patientId}_${resolvedDoctorId}` : null);
    const resolvedRecipientId = recipientId || resolvedDoctorId;

    useEffect(() => {
        if (!chatId) return;
        const q = query(
            collection(db, 'chats', chatId, 'messages'),
            orderBy('timestamp', 'asc')
        );
        const unsub = onSnapshot(q, snap => {
            setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, [chatId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    async function sendMessage() {
        const content = text.trim();
        if (!content || !chatId || sending || !currentUser) return;
        setSending(true);
        setText('');
        try {
            await addDoc(collection(db, 'chats', chatId, 'messages'), {
                senderId: currentUser.uid,
                senderName: userData?.name || 'Unknown',
                senderRole: userData?.role,
                receiverId: resolvedRecipientId,
                content,
                timestamp: serverTimestamp(),
                read: false,
            });
            // Notify recipient
            if (resolvedRecipientId) {
                await addDoc(collection(db, 'notifications', resolvedRecipientId, 'items'), {
                    type: 'new_message',
                    title: '💬 New Message',
                    message: `${userData?.name}: ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`,
                    patientName: userData?.name,
                    senderId: currentUser.uid,
                    timestamp: serverTimestamp(),
                    read: false,
                });
            }
        } catch (err) {
            console.error('Send error:', err);
        } finally {
            setSending(false);
        }
    }

    function formatTime(ts) {
        if (!ts?.toDate) return '';
        return ts.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }

    if (!chatId) {
        return (
            <div className="chat-wrap" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No doctor selected for chat.</p>
            </div>
        );
    }

    return (
        <div className="chat-wrap">
            <div className="chat-header">
                <div>
                    <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.95rem' }}>
                        {recipientName || 'Chat'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--success)', marginTop: 2 }}>
                        <div className="online-dot" /> Online
                    </div>
                </div>
                <span className="badge badge-success">🔒 Secure Chat</span>
            </div>

            <div className="chat-messages">
                {messages.length === 0 && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No messages yet. Say hello! 👋
                    </div>
                )}
                {messages.map(msg => {
                    const mine = msg.senderId === currentUser?.uid;
                    return (
                        <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                            <div className={`chat-bubble ${mine ? 'mine' : 'theirs'}`}>
                                <div className="sender-name">{msg.senderName}</div>
                                {msg.content}
                                <div className="msg-time">{formatTime(msg.timestamp)}</div>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            <div className="chat-input-row">
                <input
                    className="chat-input"
                    type="text"
                    placeholder="Type or speak a message..."
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                />
                <VoiceInput onResult={transcript => setText(prev => prev ? prev + ' ' + transcript : transcript)} />
                <button className="chat-send-btn" onClick={sendMessage} disabled={sending || !text.trim()}>
                    {sending ? '...' : '➤'}
                </button>
            </div>
        </div>
    );
}
