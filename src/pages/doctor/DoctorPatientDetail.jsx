import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, doc, getDocs
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';
import ChatWindow from '../../components/ChatWindow';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, ReferenceLine,
} from 'recharts';

export default function DoctorPatientDetail() {
    const { patientId } = useParams();
    const { currentUser, userData } = useAuth();
    const navigate = useNavigate();

    // Load patient data from sessionStorage (passed by the list page)
    const [patient, setPatient] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('rc_sel_patient')); } catch { return null; }
    });

    const [logs, setLogs] = useState([]);
    const [visits, setVisits] = useState([]);
    const [activeView, setActiveView] = useState(null); // 'log' | 'history' | 'trends'
    const [showLogModal, setShowLogModal] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);
    const [responseText, setResponseText] = useState('');
    const [sendingResp, setSendingResp] = useState(false);

    const chatId = patient ? `${patient.id}_${currentUser?.uid}` : null;

    // Real-time symptom logs for this patient
    useEffect(() => {
        if (!patientId) return;
        const q = query(
            collection(db, 'symptomLogs'),
            where('patientId', '==', patientId),
            orderBy('submittedAt', 'desc')
        );
        return onSnapshot(q, snap => {
            const newLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setLogs(newLogs);
            // Auto-open modal for new flagged log
            const flagged = newLogs.find(l => l.flagged && !selectedLog);
            if (flagged && activeView === 'log') setSelectedLog(flagged);
        });
    }, [patientId]);

    // Medical visits
    useEffect(() => {
        if (!patientId) return;
        getDocs(query(collection(db, 'medicalVisits'), where('patientId', '==', patientId)))
            .then(snap => setVisits(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, [patientId]);

    async function sendResponse() {
        if (!responseText.trim() || !selectedLog) return;
        setSendingResp(true);
        try {
            await addDoc(collection(db, 'logResponses', selectedLog.id, 'responses'), {
                doctorId: currentUser.uid,
                doctorName: userData?.name || 'Dr.',
                message: responseText,
                timestamp: serverTimestamp(),
            });
            // Notify patient
            await addDoc(collection(db, 'notifications', patientId, 'items'), {
                type: 'doctor_response',
                title: 'Doctor Response',
                message: responseText.substring(0, 100),
                patientName: patient?.name,
                logId: selectedLog.id,
                timestamp: serverTimestamp(),
                read: false,
            });
            setResponseText('');
            alert('Response sent to patient ✅');
        } finally {
            setSendingResp(false);
        }
    }

    function sevColor(v) {
        if (v <= 3) return '#38a169'; if (v <= 6) return '#d69e2e'; if (v <= 8) return '#dd6b20'; return '#e53e3e';
    }
    function sevClass(v) {
        if (v <= 3) return 'green'; if (v <= 6) return 'yellow'; if (v <= 8) return 'orange'; return 'red';
    }
    function formatTime(ts) {
        if (!ts?.toDate) return ''; return ts.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    // Trend data from logs
    const trendData = [...logs].reverse().map((log, i) => {
        const avgSev = log.symptoms?.reduce((a, s) => a + s.severity, 0) / (log.symptoms?.length || 1);
        return { label: log.date || `Day ${i + 1}`, 'Recovery Score': Math.round(100 - avgSev * 10) };
    });

    if (!patient) return <div className="spinner">Loading patient...</div>;

    const riskColors = { critical: '#e53e3e', high: '#dd6b20', medium: '#d69e2e', low: '#38a169' };

    return (
        <>
            <Navbar portalType="doctor" patientName={patient.name} />

            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem' }}>
                {/* Patient Header */}
                <div className="card" style={{ marginBottom: '1.5rem', borderLeft: `5px solid ${riskColors[patient.risk] || '#ccc'}` }}>
                    <div className="card-body">
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ width: 54, height: 54, borderRadius: '50%', background: riskColors[patient.risk], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 700, flexShrink: 0 }}>
                                {patient.initials || patient.name?.slice(0, 2)}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>{patient.name}</span>
                                    <span className={`badge rb-${patient.risk}`}>{patient.risk?.toUpperCase()}</span>
                                    {patient.flagged && <span className="badge badge-danger alert-flash">🚩 Auto-Alert</span>}
                                </div>
                                <div className="vitals-strip">
                                    {patient.vitals && Object.entries({ '🌡️': `${patient.vitals.temp}°C`, '💓': `${patient.vitals.hr} bpm`, '🫀': patient.vitals.bp, '🫁': `SpO2 ${patient.vitals.spo2}%` }).map(([k, v]) => (
                                        <div key={k} className="vital-chip">{k} {v}</div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8, marginTop: '1rem' }}>
                            {[['Name', patient.name], ['Age', patient.age], ['Recovery Day', `Day ${patient.recoveryDay}`], ['Condition', patient.diagnosis], ['Risk', patient.risk?.toUpperCase()], ['Next Appt', patient.nextAppt]].map(([l, v]) => (
                                <div key={l} style={{ background: 'var(--bg)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                                    <div style={{ fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>{l}</div>
                                    <div style={{ fontSize: '0.87rem', fontWeight: 600, marginTop: 2 }}>{v}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main 2-col Layout */}
                <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', alignItems: 'start' }}>
                    {/* LEFT: Chat */}
                    {chatId && (
                        <ChatWindow
                            chatId={chatId}
                            recipientName={patient.name}
                            recipientId={patient.id}
                            recipientRole="patient"
                        />
                    )}

                    {/* RIGHT: Action Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {[
                            { key: 'log', icon: '📋', title: 'Log', sub: 'View patient symptom logs' },
                            { key: 'history', icon: '📁', title: 'Medical History', sub: 'Past visits & prescriptions' },
                            { key: 'trends', icon: '📈', title: 'Trend Analysis', sub: 'Recovery progress over time' },
                        ].map(btn => (
                            <div
                                key={btn.key}
                                className="card"
                                style={{ padding: '1.1rem 1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'var(--transition)', border: activeView === btn.key ? '2px solid var(--accent)' : '1.5px solid var(--border)', background: activeView === btn.key ? 'var(--accent-pale)' : 'var(--card)' }}
                                onClick={() => { setActiveView(prev => prev === btn.key ? null : btn.key); if (btn.key === 'log') setShowLogModal(false); }}
                            >
                                <div style={{ fontSize: '1.5rem', width: 44, height: 44, background: 'var(--bg)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{btn.icon}</div>
                                <div>
                                    <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.92rem' }}>{btn.title}</div>
                                    <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)' }}>{btn.sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Log Sub-view */}
                {activeView === 'log' && (
                    <div className="subview-panel">
                        <div className="subview-header">
                            <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1rem' }}>📋 Symptom Logs ({logs.length})</span>
                            <button className="btn btn-sm btn-outline" onClick={() => setActiveView(null)}>✕ Close</button>
                        </div>
                        {logs.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No logs yet for this patient.</div>}
                        {logs.map(log => (
                            <div key={log.id} className="card" style={{ marginBottom: '0.8rem', cursor: 'pointer', borderLeft: log.flagged ? '4px solid var(--danger)' : '4px solid var(--border)' }}
                                onClick={() => { setSelectedLog(log); setShowLogModal(true); }}>
                                <div className="card-body">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{log.date} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatTime(log.submittedAt)}</span></div>
                                            <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                                                {log.symptoms?.map(s => (
                                                    <span key={s.name} className="badge" style={{ background: s.severity >= 8 ? 'var(--danger-light)' : 'var(--bg)', color: s.severity >= 8 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                                                        {s.emoji} {s.name}: {s.severity}/10
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            {log.flagged && <span className="badge badge-danger">🚨 Critical</span>}
                                            <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>Open →</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Medical History Sub-view */}
                {activeView === 'history' && (
                    <div className="subview-panel">
                        <div className="subview-header">
                            <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1rem' }}>📁 Medical History</span>
                            <button className="btn btn-sm btn-outline" onClick={() => setActiveView(null)}>✕ Close</button>
                        </div>
                        {visits.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No visit records found.</div>}
                        {visits.map(v => (
                            <div key={v.id} className="card" style={{ marginBottom: '0.8rem' }}>
                                <div className="card-body">
                                    <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{v.hospital}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 3 }}>📅 {v.visitDate} · {v.department} · {v.doctorName}</div>
                                    <div style={{ fontSize: '0.87rem', marginTop: 8 }}><strong>Diagnosis:</strong> {v.diagnosis}</div>
                                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{v.tags?.map(t => <span key={t} className="badge badge-primary">{t}</span>)}</div>
                                    <details style={{ marginTop: 8 }}>
                                        <summary style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>Medications ({v.medications?.length})</summary>
                                        <div style={{ marginTop: 6 }}>{v.medications?.map((m, i) => (
                                            <div key={i} style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: '0.82rem' }}>
                                                <strong>{m.name}</strong> {m.dosage} · {m.frequency} · <span className={`badge ${m.status === 'active' ? 'badge-success' : 'badge-gray'}`}>{m.status}</span>
                                            </div>
                                        ))}</div>
                                    </details>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Trends Sub-view */}
                {activeView === 'trends' && (
                    <div className="subview-panel">
                        <div className="subview-header">
                            <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1rem' }}>📈 Trend Analysis</span>
                            <button className="btn btn-sm btn-outline" onClick={() => setActiveView(null)}>✕ Close</button>
                        </div>
                        {trendData.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No logs to show trends.</div>
                        ) : (
                            <>
                                <ResponsiveContainer width="100%" height={240}>
                                    <LineChart data={trendData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                                        <Tooltip />
                                        <Legend />
                                        <ReferenceLine y={70} stroke="#e53e3e" strokeDasharray="6 3" label={{ value: 'Alert Threshold', position: 'right', fill: '#e53e3e', fontSize: 10 }} />
                                        <Line type="monotone" dataKey="Recovery Score" stroke="#38a169" strokeWidth={2.5} dot={{ r: 4 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                                <div style={{ marginTop: '1rem', padding: '12px 16px', background: 'var(--accent-pale)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--primary)', borderLeft: '3px solid var(--accent)' }}>
                                    <strong>Clinical Insight:</strong> Patient's recovery score is{' '}
                                    {trendData.length > 1 && trendData[trendData.length - 1]['Recovery Score'] > trendData[0]['Recovery Score'] ? 'improving' : 'declining'}{' '}
                                    — from {trendData[0]?.['Recovery Score']} → {trendData[trendData.length - 1]?.['Recovery Score']} over {trendData.length} logs.
                                    {patient.flagged && ' ⚠ Auto-alert was triggered. Monitor closely.'}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Log Modal */}
            {showLogModal && selectedLog && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowLogModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <div>
                                <h3>📋 Patient Symptom Log</h3>
                                <p>{patient.name} · {selectedLog.date}</p>
                            </div>
                            <button className="modal-close" onClick={() => setShowLogModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {selectedLog.flagged && (
                                <div style={{ background: 'var(--danger-light)', border: '1.5px solid var(--danger)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '1rem', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600 }}>
                                    ⚠ Auto-alert triggered — severity ≥ 8 detected at {formatTime(selectedLog.submittedAt)}
                                </div>
                            )}
                            <div className="section-heading">Symptoms Logged</div>
                            {selectedLog.symptoms?.map(s => (
                                <div key={s.name} className="sym-card">
                                    <div className="sym-top">
                                        <span className="sym-name">{s.emoji} {s.name}</span>
                                        <span className={`sev-pill ${sevClass(s.severity)}`}>{s.severity}/10</span>
                                    </div>
                                    <div className="sev-bar-track">
                                        <div className="sev-bar-fill" style={{ width: `${s.severity * 10}%`, background: sevColor(s.severity) }} />
                                    </div>
                                    {s.notes && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 5 }}>💬 "{s.notes}"</div>}
                                </div>
                            ))}

                            {selectedLog.vitals && (
                                <>
                                    <div className="section-heading" style={{ marginTop: '1rem' }}>Vitals</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8 }}>
                                        {[['🌡️ Temp', `${selectedLog.vitals.temp}°C`], ['↑ Sys', `${selectedLog.vitals.bpSys} mmHg`], ['↓ Dia', `${selectedLog.vitals.bpDia} mmHg`], ['💓 HR', `${selectedLog.vitals.hr} bpm`], ['🫁 SpO2', `${selectedLog.vitals.spo2}%`], ['🩸 Sugar', `${selectedLog.vitals.sugar} mg/dL`]].map(([l, v]) => (
                                            <div key={l} style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                                                <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{v}</div>
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{l}</div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            <div style={{ marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                                <label className="form-label">🩺 Doctor Response Note</label>
                                <textarea
                                    className="form-input"
                                    placeholder="e.g., Increase ibuprofen dosage. Schedule follow-up within 48 hours..."
                                    value={responseText}
                                    onChange={e => setResponseText(e.target.value)}
                                />
                                <button className="btn btn-accent btn-full" style={{ marginTop: 8 }} onClick={sendResponse} disabled={sendingResp}>
                                    {sendingResp ? 'Sending...' : 'Send Response to Patient'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
