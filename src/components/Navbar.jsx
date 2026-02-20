import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar({ portalType = 'patient', patientName = null }) {
    const { currentUser, userRole, userData, logout } = useAuth();
    const navigate = useNavigate();
    const [showNotif, setShowNotif] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unread, setUnread] = useState(0);
    const dropdownRef = useRef(null);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(
            collection(db, 'notifications', currentUser.uid, 'items'),
            orderBy('timestamp', 'desc'),
            limit(20)
        );
        const unsub = onSnapshot(q, snap => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setNotifications(items);
            setUnread(items.filter(n => !n.read).length);
        });
        return unsub;
    }, [currentUser]);

    useEffect(() => {
        function handleClick(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowNotif(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const logoRoute = userRole === 'patient' ? '/patient/dashboard' : '/doctor/patients';

    function formatTime(ts) {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        const diff = (Date.now() - d.getTime()) / 60000;
        if (diff < 60) return `${Math.floor(diff)}m ago`;
        if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
        return `${Math.floor(diff / 1440)}d ago`;
    }

    const notifColors = {
        critical_alert: '#e53e3e',
        doctor_response: '#0D7A7A',
        new_message: '#1A3C6E',
        log_submitted: '#38a169',
    };

    const notifIcons = {
        critical_alert: '🚨',
        doctor_response: '🩺',
        new_message: '💬',
        log_submitted: '📋',
    };

    return (
        <nav className="navbar">
            {/* LEFT — App name & logo */}
            <div className="navbar-left">
                <div className="navbar-logo" onClick={() => navigate(logoRoute)}>
                    <div className="navbar-logo-icon">🩺</div>
                    <div className="navbar-logo-text">
                        Recovery Companion
                        <span>{portalType === 'doctor' ? 'Doctor Portal' : 'Patient Portal'}</span>
                    </div>
                </div>
            </div>

            {/* CENTER — Hospital name + logo */}
            <div className="navbar-center">
                <div className="hospital-badge">🏥 Apollo Hospitals</div>
            </div>

            {/* RIGHT — Log button + Bell + Profile */}
            <div className="navbar-right" ref={dropdownRef} style={{ position: 'relative', gap: 12 }}>
                {/* Log button — only for patients */}
                {portalType === 'patient' && (
                    <button
                        className="btn btn-accent btn-sm"
                        onClick={() => navigate('/patient/log')}
                        style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        📝 Log
                    </button>
                )}

                {/* Notification bell */}
                <div className="bell-btn" onClick={() => setShowNotif(v => !v)}>
                    🔔
                    {unread > 0 && <div className="bell-dot">{unread > 9 ? '9+' : unread}</div>}
                </div>

                {/* Name */}
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {userData?.name?.split(' ')[0] || currentUser?.email}
                </div>

                {/* Avatar — click to logout */}
                <div className="avatar-circle" title="Logout" onClick={() => { logout(); navigate('/'); }}>
                    {(userData?.name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>

                {/* Notification dropdown */}
                {showNotif && (
                    <div className="notif-dropdown" style={{ right: 0 }}>
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary)' }}>🔔 Notifications {unread > 0 && <span className="badge badge-danger">{unread}</span>}</span>
                        </div>
                        {notifications.length === 0 && (
                            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No notifications yet</div>
                        )}
                        {notifications.map(n => (
                            <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}>
                                <div className="notif-avatar" style={{ background: notifColors[n.type] || '#718096' }}>
                                    {notifIcons[n.type] || '📣'}
                                </div>
                                <div className="notif-body">
                                    <p><strong>{n.patientName || n.title}</strong> — {n.message}</p>
                                    <time>{formatTime(n.timestamp)}</time>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </nav>
    );
}
