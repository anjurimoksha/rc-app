import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy, limit, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';

export default function PatientDashboard() {
    const { currentUser, userData } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [latestLog, setLatestLog] = useState(null);
    const [visitCount, setVisitCount] = useState(0);
    const [assignedDoctor, setAssignedDoctor] = useState(null);
    const [nextVisit, setNextVisit] = useState(null); // { date, doctorName }

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

    // Latest symptom log
    useEffect(() => {
        if (!currentUser) return;
        const q = query(
            collection(db, 'symptomLogs'),
            where('patientId', '==', currentUser.uid),
            orderBy('submittedAt', 'desc'), limit(1)
        );
        return onSnapshot(q, snap => {
            if (!snap.empty) setLatestLog({ id: snap.docs[0].id, ...snap.docs[0].data() });
        });
    }, [currentUser]);

    // Visit count
    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'medicalVisits'), where('patientId', '==', currentUser.uid));
        return onSnapshot(q, snap => setVisitCount(snap.size));
    }, [currentUser]);

    // Assigned doctor + next follow-up visit
    useEffect(() => {
        if (!userData?.assignedDoctorId) return;
        // fetch assigned doctor
        getDoc(doc(db, 'users', userData.assignedDoctorId)).then(snap => {
            if (snap.exists()) setAssignedDoctor({ id: snap.id, ...snap.data() });
        });
        // fetch next upcoming follow-up from medicalVisits
        const today = new Date().toISOString().split('T')[0];
        getDocs(query(
            collection(db, 'medicalVisits'),
            where('patientId', '==', currentUser.uid)
        )).then(snap => {
            const upcoming = snap.docs
                .map(d => ({ ...d.data() }))
                .flatMap(v => {
                    const dates = (v.followUpInstructions || []).map(fi => {
                        const m = fi.match(/\d{4}-\d{2}-\d{2}/);
                        return m ? { date: m[0], doctorName: v.doctorName } : null;
                    }).filter(Boolean);
                    return dates;
                })
                .filter(v => v.date >= today)
                .sort((a, b) => a.date.localeCompare(b.date));
            setNextVisit(upcoming[0] || null);
        });
    }, [currentUser, userData]);

    function timeAgo(ts) {
        if (!ts?.toDate) return null;
        const diff = (Date.now() - ts.toDate().getTime()) / 60000;
        if (diff < 60) return `${Math.floor(diff)} minutes ago`;
        if (diff < 1440) return `${Math.floor(diff / 60)} hours ago`;
        return `${Math.floor(diff / 1440)} days ago`;
    }

    const unread = notifications.filter(n => !n.read).length;
    const firstName = userData?.name?.split(' ')[0] || 'Patient';
    const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();

    return (
        <>
            <Navbar portalType="patient" />
            <div className="page" style={{ paddingBottom: 100 }}>

                {/* Appointment Banner */}
                <div className="announcement-banner" style={{ marginBottom: '1.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>📅</span>
                    <div style={{ flex: 1 }}>
                        {nextVisit ? (
                            <><strong>Upcoming Appointment:</strong>{' '}
                                {new Date(nextVisit.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                                {nextVisit.doctorName && ` — Dr. ${nextVisit.doctorName}`}
                                {assignedDoctor?.hospital && `, ${assignedDoctor.hospital}`}
                            </>
                        ) : assignedDoctor ? (
                            <><strong>Your Doctor:</strong>{' '}Dr. {assignedDoctor.name} · {assignedDoctor.specialization || 'General Medicine'} · {assignedDoctor.hospital || 'Apollo Hospitals'}</>
                        ) : (
                            <><strong>No upcoming appointment</strong> — log your symptoms to keep your doctor updated 📝</>
                        )}
                    </div>
                    <button className="btn btn-sm btn-outline" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }} onClick={() => navigate('/patient/log')}>
                        Message Doctor
                    </button>
                </div>

                {/* Hero Greeting Banner */}
                <div style={{
                    background: 'linear-gradient(135deg, #1A3C6E 0%, #0D4F6E 50%, #0D7A7A 100%)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '2rem 2.5rem',
                    color: '#fff',
                    marginBottom: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    {/* Decorative circles */}
                    <div style={{ position: 'absolute', right: -40, top: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
                    <div style={{ position: 'absolute', right: 60, bottom: -60, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

                    <div style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.7, letterSpacing: 1, marginBottom: 8 }}>{todayStr}</div>
                    <h1 style={{ fontSize: '2.2rem', fontWeight: 800, margin: '0 0 8px', letterSpacing: -0.5 }}>
                        Hello, {firstName}! 👋
                    </h1>
                    <p style={{ opacity: 0.85, fontSize: '1rem', margin: '0 0 16px' }}>Your recovery is on track. Keep it up!</p>

                    {latestLog && (
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)',
                            borderRadius: 'var(--radius-full)', padding: '6px 16px',
                            fontSize: '0.82rem', fontWeight: 600,
                        }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
                            Your last log was {timeAgo(latestLog.submittedAt)}. Feeling good! ✨
                        </div>
                    )}
                </div>

                {/* 3-column grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 320px', gap: '1.5rem' }}>

                    {/* Medical History Card */}
                    <div className="card" style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }} onClick={() => navigate('/patient/history')}>
                        <div style={{ height: 4, background: 'linear-gradient(90deg, var(--primary), var(--accent))' }} />
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ fontSize: '2rem', marginBottom: 12 }}>🗂️</div>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>Medical History</h3>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', flex: 1 }}>Past visits, reports &amp; prescriptions</p>
                            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="badge badge-primary">{visitCount} visit{visitCount !== 1 ? 's' : ''}</span>
                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1rem' }}>→</div>
                            </div>
                        </div>
                    </div>

                    {/* Recovery Trends Card */}
                    <div className="card" style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }} onClick={() => navigate('/patient/trends')}>
                        <div style={{ height: 4, background: 'linear-gradient(90deg, var(--accent), #4ade80)' }} />
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📈</div>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>Recovery Trends</h3>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', flex: 1 }}>See how you're progressing over time</p>
                            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--success)', background: 'var(--success-light)', padding: '3px 10px', borderRadius: 'var(--radius-full)' }}>Improving ↑</span>
                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1rem' }}>→</div>
                            </div>
                        </div>
                    </div>

                    {/* Notifications Panel */}
                    <div className="card">
                        <div className="card-body">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>
                                    🔔 Notifications {unread > 0 && <span className="badge badge-danger" style={{ marginLeft: 4 }}>{unread}</span>}
                                </span>
                                {unread > 0 && <span style={{ fontSize: '0.72rem', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>Mark all read</span>}
                            </div>
                            {notifications.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.83rem', textAlign: 'center', padding: '1.5rem 0' }}>No notifications yet</div>
                            ) : (
                                notifications.slice(0, 5).map(n => (
                                    <div key={n.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '0.83rem', lineHeight: 1.5 }}>
                                            <strong>{n.title || 'Doctor Response'}</strong>
                                            {n.message && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>{' '}{n.message}</span>}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: !n.read ? 'var(--accent)' : 'var(--border)' }} />
                                            {n.timestamp?.toDate ? timeAgo(n.timestamp) : ''}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
