import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, getDocs, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';

export default function DoctorPatients() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [patients, setPatients] = useState([]);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    // unread messages per patient
    const [unreadMap, setUnreadMap] = useState({});

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'patients'), where('assignedDoctorId', '==', currentUser.uid));
        const unsub = onSnapshot(q, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            list.sort((a, b) => (riskOrder[a.risk] ?? 4) - (riskOrder[b.risk] ?? 4));
            setPatients(list);
            setLoading(false);

            // Subscribe to unread messages for each patient
            list.forEach(pat => {
                const chatId = `${pat.id}_${currentUser.uid}`;
                const msgQ = query(
                    collection(db, 'chats', chatId, 'messages'),
                    where('read', '==', false),
                    where('receiverId', '==', currentUser.uid)
                );
                onSnapshot(msgQ, mSnap => {
                    setUnreadMap(prev => ({ ...prev, [pat.id]: mSnap.size }));
                });
            });
        });
        return unsub;
    }, [currentUser]);

    const riskColors = { critical: '#e53e3e', high: '#dd6b20', medium: '#d69e2e', low: '#38a169' };
    const filtered = patients.filter(p => {
        const matchFilter = filter === 'all' || p.risk === filter;
        const q = search.toLowerCase();
        const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.diagnosis?.toLowerCase().includes(q);
        return matchFilter && matchSearch;
    });

    if (loading) return <div className="spinner">Loading patients...</div>;

    return (
        <>
            <Navbar portalType="doctor" />
            <div className="page">
                <div className="page-header">
                    <h1>My Patients</h1>
                    <p>{patients.length} active patients · sorted by risk level{patients.filter(p => p.risk === 'critical').length > 0 ? ` · ${patients.filter(p => p.risk === 'critical').length} critical` : ''}</p>
                </div>

                {/* Search + Filter */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 3, position: 'relative', minWidth: 280 }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
                        <input
                            className="form-input" style={{ paddingLeft: 36 }}
                            type="text" placeholder="Search patients by name, diagnosis, or risk..."
                            value={search} onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {['all', 'critical', 'high', 'medium', 'low'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                style={{
                                    padding: '6px 14px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 600,
                                    cursor: 'pointer', border: '1.5px solid',
                                    background: filter === f ? (f === 'all' ? 'var(--primary)' : riskColors[f]) : 'var(--card)',
                                    color: filter === f ? '#fff' : 'var(--text-muted)',
                                    borderColor: filter === f ? (f === 'all' ? 'var(--primary)' : riskColors[f]) : 'var(--border)',
                                    transition: 'var(--transition)',
                                }}
                            >
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Patient Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {filtered.length === 0 && (
                        <div className="card">
                            <div className="card-body" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                🔍 No patients found matching your criteria.
                            </div>
                        </div>
                    )}
                    {filtered.map(p => {
                        const unread = unreadMap[p.id] || 0;
                        const maxPain = p.lastSymptoms?.reduce((m, s) => Math.max(m, s.severity), 0) || 0;
                        return (
                            <div
                                key={p.id}
                                className={`patient-card risk-${p.risk}`}
                                onClick={() => { sessionStorage.setItem('rc_sel_patient', JSON.stringify(p)); navigate(`/doctor/patient/${p.id}`); }}
                            >
                                {/* Avatar */}
                                <div className={`pat-avatar av-${p.risk}`}>{p.initials || p.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}</div>

                                {/* Details */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)' }}>{p.name}</span>
                                        <span className={`badge rb-${p.risk}`}>{p.risk?.toUpperCase()}</span>
                                        {p.flagged && <span className="badge badge-danger alert-flash">🚩 ALERT</span>}
                                    </div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 5 }}>{p.diagnosis}</div>
                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        <span>📅 Day {p.recoveryDay}</span>
                                        <span>Last log: {p.lastLog || 'N/A'}</span>
                                        <span>Pain: <strong style={{ color: maxPain >= 8 ? 'var(--danger)' : maxPain >= 5 ? '#dd6b20' : 'var(--success)' }}>{maxPain}/10</strong></span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                    {unread > 0 && (
                                        <div style={{ background: '#e0f2fe', color: '#0277bd', borderRadius: 'var(--radius-sm)', padding: '4px 10px', fontSize: '0.72rem', fontWeight: 700 }}>
                                            💬 {unread} MSG
                                        </div>
                                    )}
                                    <span style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--accent)' }}>View →</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
