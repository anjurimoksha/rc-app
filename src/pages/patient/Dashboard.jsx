import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';

export default function PatientDashboard() {
    const { currentUser, userData } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [latestLog, setLatestLog] = useState(null);
    const [recoveryScore, setRecoveryScore] = useState(null);

    // Real-time notifications
    useEffect(() => {
        if (!currentUser) return;
        const q = query(
            collection(db, 'notifications', currentUser.uid, 'items'),
            orderBy('timestamp', 'desc'), limit(10)
        );
        return onSnapshot(q, snap => {
            setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [currentUser]);

    // Latest log + recovery score
    useEffect(() => {
        if (!currentUser) return;
        const q = query(
            collection(db, 'symptomLogs'),
            where('patientId', '==', currentUser.uid),
            orderBy('submittedAt', 'desc'), limit(1)
        );
        return onSnapshot(q, snap => {
            if (!snap.empty) {
                const log = { id: snap.docs[0].id, ...snap.docs[0].data() };
                setLatestLog(log);
                const avgSev = log.symptoms?.reduce((a, s) => a + s.severity, 0) / (log.symptoms?.length || 1);
                setRecoveryScore(Math.round(100 - avgSev * 10));
            }
        });
    }, [currentUser]);

    function formatTime(ts) {
        if (!ts?.toDate) return '';
        return ts.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    const notifIcons = { critical_alert: '🚨', doctor_response: '🩺', new_message: '💬', log_submitted: '📋' };

    return (
        <>
            <Navbar portalType="patient" />
            <div className="page">
                {/* Appointment Banner */}
                <div className="announcement-banner" style={{ marginBottom: '1.5rem' }}>
                    <span style={{ fontSize: '1.3rem' }}>📅</span>
                    <div>
                        <strong>Upcoming Appointment:</strong> February 22, 2026 at 10:00 AM — Dr. Priya Sharma, Apollo Hospitals OPD
                    </div>
                    <button className="btn btn-sm btn-outline" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }} onClick={() => navigate('/patient/chat')}>
                        Message Doctor
                    </button>
                </div>

                <div className="page-header">
                    <h1>Welcome back, {userData?.name?.split(' ')[0] || 'Patient'} 👋</h1>
                    <p>Recovery Day 12 · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>

                {recoveryScore !== null && (
                    <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg,#1A3C6E,#0D7A7A)', color: '#fff', border: 'none' }}>
                        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: 4 }}>RECOVERY SCORE</div>
                                <div style={{ fontSize: '2.8rem', fontWeight: 800 }}>{recoveryScore}<span style={{ fontSize: '1.2rem' }}>/100</span></div>
                                <div style={{ fontSize: '0.82rem', opacity: 0.8 }}>Based on your latest symptom log</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: 4 }}>LAST LOG</div>
                                <div style={{ fontWeight: 700 }}>{latestLog ? formatTime(latestLog.submittedAt) : 'No logs yet'}</div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="dash-grid">
                    {/* LEFT: Action Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="action-card" onClick={() => navigate('/patient/log')}>
                            <div className="action-icon">📝</div>
                            <div className="action-text">
                                <h3>Log Today's Symptoms</h3>
                                <p>Record how you're feeling — your doctor sees it in real-time</p>
                            </div>
                        </div>
                        <div className="action-card" onClick={() => navigate('/patient/chat')}>
                            <div className="action-icon">💬</div>
                            <div className="action-text">
                                <h3>Chat with Doctor</h3>
                                <p>Send a message to Dr. Priya Sharma</p>
                            </div>
                        </div>
                        <div className="action-card" onClick={() => navigate('/patient/trends')}>
                            <div className="action-icon">📈</div>
                            <div className="action-text">
                                <h3>Recovery Trends</h3>
                                <p>View your symptom trends and progress charts</p>
                            </div>
                        </div>
                        <div className="action-card" onClick={() => navigate('/patient/history')}>
                            <div className="action-icon">📁</div>
                            <div className="action-text">
                                <h3>Medical History</h3>
                                <p>View past visit records and medications</p>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Notifications Panel */}
                    <div className="card">
                        <div className="card-body">
                            <div className="section-heading">Notifications</div>
                            {notifications.length === 0 && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0', textAlign: 'center' }}>
                                    No notifications yet
                                </div>
                            )}
                            {notifications.map(n => (
                                <div key={n.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}
                                    className={!n.read ? 'unread' : ''}>
                                    <div style={{ fontSize: '1.2rem' }}>{notifIcons[n.type] || '📣'}</div>
                                    <div>
                                        <div style={{ fontSize: '0.83rem', fontWeight: 600 }}>{n.title || n.patientName}</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{n.message}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
                                            {n.timestamp?.toDate ? n.timestamp.toDate().toLocaleString('en-IN') : ''}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
