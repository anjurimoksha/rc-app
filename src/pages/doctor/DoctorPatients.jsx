import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';
import { calculatePriorityScore } from '../../utils/aiPriorityScore';

// ── Score badge colours ──────────────────────────────────────────────────────
function scoreBg(s) {
    if (s >= 75) return { bg: '#fee2e2', color: '#b91c1c' };
    if (s >= 50) return { bg: '#ffedd5', color: '#c2410c' };
    if (s >= 30) return { bg: '#fef9c3', color: '#a16207' };
    return { bg: '#dcfce7', color: '#15803d' };
}

export default function DoctorPatients() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    // ── Core state ────────────────────────────────────────────────────────────
    const [sortedPatients, setSortedPatients] = useState([]);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    // ── Data refs (mutable, don't trigger re-renders on their own) ────────────
    const patientsRef = useRef([]);   // raw patient docs
    const logsRef = useRef({});   // patientId → logs[] (newest first)
    const summariesRef = useRef({});   // patientId → aiSummaries[] (newest first)
    const unreadRef = useRef({});   // patientId → unread message count

    // ── Listener unsub refs ───────────────────────────────────────────────────
    const logUnsubsRef = useRef({});
    const summaryUnsubsRef = useRef({});
    const chatUnsubsRef = useRef({});

    // ── Score + sort all patients, then push to state ─────────────────────────
    const rescore = useCallback(() => {
        const scored = patientsRef.current.map(p => {
            const { score, breakdown } = calculatePriorityScore(
                p,
                logsRef.current[p.id] || [],
                summariesRef.current[p.id] || [],
                unreadRef.current[p.id] || 0,
            );
            return { ...p, priorityScore: score, scoreBreakdown: breakdown };
        });
        scored.sort((a, b) => b.priorityScore - a.priorityScore);
        setSortedPatients(scored);
    }, []);

    // ── Attach / detach per-patient listeners ─────────────────────────────────
    const syncPatientListeners = useCallback((patients) => {
        if (!currentUser) return;
        const currentIds = new Set(patients.map(p => p.id));

        // Tear down for removed patients
        Object.keys(logUnsubsRef.current).forEach(pid => {
            if (!currentIds.has(pid)) {
                logUnsubsRef.current[pid]();
                delete logUnsubsRef.current[pid];
                delete logsRef.current[pid];
            }
        });
        Object.keys(summaryUnsubsRef.current).forEach(pid => {
            if (!currentIds.has(pid)) {
                summaryUnsubsRef.current[pid]();
                delete summaryUnsubsRef.current[pid];
                delete summariesRef.current[pid];
            }
        });
        Object.keys(chatUnsubsRef.current).forEach(pid => {
            if (!currentIds.has(pid)) {
                chatUnsubsRef.current[pid]();
                delete chatUnsubsRef.current[pid];
                delete unreadRef.current[pid];
            }
        });

        // Create new listeners for new patients
        patients.forEach(pat => {
            // symptomLogs
            if (!logUnsubsRef.current[pat.id]) {
                const q = query(collection(db, 'symptomLogs'), where('patientId', '==', pat.id));
                logUnsubsRef.current[pat.id] = onSnapshot(q, snap => {
                    const logs = snap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .sort((a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0));
                    logsRef.current[pat.id] = logs;
                    rescore();
                });
            }

            // aiSummaries
            if (!summaryUnsubsRef.current[pat.id]) {
                const q = query(
                    collection(db, 'aiSummaries'),
                    where('patientId', '==', pat.id),
                    where('doctorId', '==', currentUser.uid)
                );
                summaryUnsubsRef.current[pat.id] = onSnapshot(q, snap => {
                    const sums = snap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .sort((a, b) => (b.generatedAt?.toMillis?.() ?? 0) - (a.generatedAt?.toMillis?.() ?? 0));
                    summariesRef.current[pat.id] = sums;
                    rescore();
                });
            }

            // unread chat messages
            if (!chatUnsubsRef.current[pat.id]) {
                const chatId = `${pat.id}_${currentUser.uid}`;
                const q = query(
                    collection(db, 'chats', chatId, 'messages'),
                    where('read', '==', false),
                    where('receiverId', '==', currentUser.uid)
                );
                chatUnsubsRef.current[pat.id] = onSnapshot(q, mSnap => {
                    unreadRef.current[pat.id] = mSnap.size;
                    rescore();
                });
            }
        });
    }, [currentUser, rescore]);

    // ── Main patients listener ─────────────────────────────────────────────────
    useEffect(() => {
        if (!currentUser) return;
        const q = query(
            collection(db, 'patients'),
            where('assignedDoctorId', '==', currentUser.uid)
        );
        const unsub = onSnapshot(q, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            patientsRef.current = list;
            setLoading(false);
            syncPatientListeners(list);
            rescore();
        }, err => {
            console.error('DoctorPatients query error:', err);
            setLoading(false);
        });
        return unsub;
    }, [currentUser, syncPatientListeners, rescore]);

    // ── 30-minute inactivity re-score interval ────────────────────────────────
    useEffect(() => {
        const id = setInterval(rescore, 30 * 60 * 1000);
        return () => clearInterval(id);
    }, [rescore]);

    // ── Teardown all listeners on unmount ─────────────────────────────────────
    useEffect(() => {
        return () => {
            Object.values(logUnsubsRef.current).forEach(fn => fn());
            Object.values(summaryUnsubsRef.current).forEach(fn => fn());
            Object.values(chatUnsubsRef.current).forEach(fn => fn());
        };
    }, []);

    const riskColors = { critical: '#e53e3e', high: '#dd6b20', medium: '#d69e2e', low: '#38a169' };

    const filtered = sortedPatients.filter(p => {
        const matchFilter = filter === 'all' || (p.risk || p.riskLevel) === filter;
        const q = search.toLowerCase();
        const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.diagnosis?.toLowerCase().includes(q) || p.condition?.toLowerCase().includes(q);
        return matchFilter && matchSearch;
    });

    if (loading) return <div className="spinner">Loading patients…</div>;

    return (
        <>
            <Navbar portalType="doctor" />
            <div className="page">
                <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <h1>My Patients</h1>
                        <p>
                            {sortedPatients.length} active patient{sortedPatients.length !== 1 ? 's' : ''}
                            {sortedPatients.filter(p => (p.risk || p.riskLevel) === 'critical').length > 0
                                ? ` · ${sortedPatients.filter(p => (p.risk || p.riskLevel) === 'critical').length} critical` : ''}
                        </p>
                    </div>
                </div>

                {/* Search + Filter */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 3, position: 'relative', minWidth: 280 }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
                        <input
                            className="form-input" style={{ paddingLeft: 36 }}
                            type="text" placeholder="Search patients by name or diagnosis..."
                            value={search} onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {['all', 'critical', 'high', 'medium', 'low'].map(f => (
                            <button key={f} onClick={() => setFilter(f)}
                                style={{
                                    padding: '6px 14px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 600,
                                    cursor: 'pointer', border: '1.5px solid', transition: 'var(--transition)',
                                    background: filter === f ? (f === 'all' ? 'var(--primary)' : riskColors[f]) : 'var(--card)',
                                    color: filter === f ? '#fff' : 'var(--text-muted)',
                                    borderColor: filter === f ? (f === 'all' ? 'var(--primary)' : riskColors[f]) : 'var(--border)',
                                }}>
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Patient Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {sortedPatients.length === 0 && (
                        <div className="card">
                            <div className="card-body" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>👥</div>
                                <strong>No patients assigned yet.</strong>
                                <p style={{ marginTop: 8, fontSize: '0.85rem' }}>Contact your administrator to assign patients to you.</p>
                            </div>
                        </div>
                    )}
                    {sortedPatients.length > 0 && filtered.length === 0 && (
                        <div className="card">
                            <div className="card-body" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                🔍 No patients match your search / filter.
                            </div>
                        </div>
                    )}
                    {filtered.map(p => {
                        const risk = p.risk || p.riskLevel || 'medium';
                        const unread = unreadRef.current[p.id] || 0;
                        const maxPain = (logsRef.current[p.id]?.[0]?.symptoms || [])
                            .reduce((m, s) => Math.max(m, s.severity ?? 0), 0);
                        const scoreStyle = scoreBg(p.priorityScore ?? 0);

                        return (
                            <div
                                key={p.id}
                                className={`patient-card risk-${risk}`}
                                onClick={() => { sessionStorage.setItem('rc_sel_patient', JSON.stringify(p)); navigate(`/doctor/patient/${p.id}`); }}
                            >
                                {/* Avatar */}
                                <div className={`pat-avatar av-${risk}`}>
                                    {p.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
                                </div>

                                {/* Main info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)' }}>{p.name}</span>

                                        {/* Risk badge */}
                                        <span className={`badge rb-${risk}`}>{risk.toUpperCase()}</span>

                                        {/* ⭐ AI Priority Score badge */}
                                        {p.priorityScore != null && (
                                            <span
                                                title={p.scoreBreakdown}
                                                style={{
                                                    cursor: 'help',
                                                    fontSize: '0.65rem', fontWeight: 800,
                                                    padding: '3px 9px', borderRadius: 99,
                                                    background: scoreStyle.bg,
                                                    color: scoreStyle.color,
                                                    border: `1px solid ${scoreStyle.color}44`,
                                                    letterSpacing: 0.3,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                🤖 {p.priorityScore}
                                            </span>
                                        )}

                                        {p.flagged && <span className="badge badge-danger alert-flash">🚩 ALERT</span>}
                                        {summariesRef.current[p.id]?.some(s => !s.read) && (
                                            <span style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: 99, padding: '2px 10px', fontSize: '0.65rem', fontWeight: 800, letterSpacing: 0.5 }}>
                                                ⚡ AI Alert
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 5 }}>
                                        {p.condition || p.diagnosis || '—'}
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        {p.recoveryDay != null && <span>📅 Day {p.recoveryDay}</span>}
                                        <span>Pain: <strong style={{ color: maxPain >= 8 ? 'var(--danger)' : maxPain >= 5 ? '#dd6b20' : 'var(--success)' }}>{maxPain}/10</strong></span>
                                        {logsRef.current[p.id]?.[0]?.date && (
                                            <span>Last log: {logsRef.current[p.id][0].date}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Right — unread + view */}
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
