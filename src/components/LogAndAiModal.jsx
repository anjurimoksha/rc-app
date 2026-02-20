import { useState, useEffect } from 'react';
import {
    collection, addDoc, getDocs, serverTimestamp, updateDoc, doc
} from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';

/* ─── helpers ──────────────────────────────────────────── */
function sevColor(v) {
    if (v <= 3) return '#38a169'; if (v <= 6) return '#d69e2e';
    if (v <= 8) return '#dd6b20'; return '#e53e3e';
}
function sevLabel(v) {
    if (v <= 3) return 'green'; if (v <= 6) return 'yellow';
    if (v <= 8) return 'orange'; return 'red';
}
function fmt(ts) {
    if (!ts?.toDate) return '';
    return ts.toDate().toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtFull(ts) {
    if (!ts?.toDate) return '';
    return ts.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function LogAndAiModal({ patient, patientId, logs, aiSummaries, currentUser, userData, onClose }) {
    /* ── AI state ── */
    const latestAi = aiSummaries[0] ?? null;
    const [showAiBanner, setShowAiBanner] = useState(true);
    const [markingRead, setMarkingRead] = useState(false);

    /* ── Date navigation ── */
    const allDates = [...new Set(logs.map(l => l.date).filter(Boolean))]
        .sort((a, b) => b.localeCompare(a)); // newest first
    const [dateIdx, setDateIdx] = useState(0);
    const selectedDate = allDates[dateIdx];

    // All submissions on the selected date, chronological (earliest first)
    const logsForDate = logs
        .filter(l => l.date === selectedDate)
        .sort((a, b) => (a.submittedAt?.toMillis?.() || 0) - (b.submittedAt?.toMillis?.() || 0));

    /* ── Per-log responses ── */
    const [responsesMap, setResponsesMap] = useState({}); // logId → []
    const [responseTexts, setResponseTexts] = useState({});
    const [sendingMap, setSendingMap] = useState({});

    useEffect(() => {
        if (!logsForDate.length) return;
        (async () => {
            const map = {};
            for (const log of logsForDate) {
                try {
                    const snap = await getDocs(collection(db, 'logResponses', log.id, 'responses'));
                    map[log.id] = snap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
                } catch { map[log.id] = []; }
            }
            setResponsesMap(prev => ({ ...prev, ...map }));
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, logs.length]);

    /* ── Mark AI as reviewed ── */
    async function markAiRead() {
        if (!latestAi) return;
        setMarkingRead(true);
        try {
            await updateDoc(doc(db, 'aiSummaries', latestAi.id), { read: true });
            setShowAiBanner(false);
            toast.success('Summary marked as reviewed.');
        } catch (e) { console.error(e); }
        setMarkingRead(false);
    }

    /* ── Send doctor response ── */
    async function sendResponse(log) {
        const txt = (responseTexts[log.id] || '').trim();
        if (!txt) return;
        setSendingMap(p => ({ ...p, [log.id]: true }));
        try {
            const newResp = {
                doctorId: currentUser.uid,
                doctorName: userData?.name || 'Dr.',
                message: txt,
                timestamp: serverTimestamp(),
            };
            await addDoc(collection(db, 'logResponses', log.id, 'responses'), newResp);
            await addDoc(collection(db, 'notifications', patientId, 'items'), {
                type: 'doctor_response',
                title: '🩺 Doctor Response',
                message: `Dr. ${userData?.name || ''}: "${txt.length > 120 ? txt.slice(0, 117) + '…' : txt}"`,
                doctorId: currentUser.uid, logId: log.id,
                timestamp: serverTimestamp(), read: false,
            });
            setResponsesMap(p => ({
                ...p, [log.id]: [...(p[log.id] || []), { id: Date.now(), doctorName: userData?.name || 'Dr.', message: txt }]
            }));
            setResponseTexts(p => ({ ...p, [log.id]: '' }));
            toast.success('Response sent to patient.');
        } catch { toast.error('Failed to send.'); }
        setSendingMap(p => ({ ...p, [log.id]: false }));
    }

    /* ── Does this log card badge "triggered AI"? ── */
    function isAiTriggerLog(log) {
        if (!latestAi) return false;
        return log.symptoms?.some(s => s.name === latestAi.symptomName);
    }

    /* ────────────────────── JSX ────────────────────── */
    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 720, width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Modal header */}
                <div className="modal-header">
                    <div>
                        <h3>📋 Patient Logs</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>{patient?.name} · {logs.length} total submissions</p>
                    </div>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                {/* Scrollable body */}
                <div style={{ overflowY: 'auto', flex: 1 }}>

                    {/* ══ SECTION 1 — AI Summary Banner ══ */}
                    {latestAi && showAiBanner && (
                        <div style={{ background: 'linear-gradient(135deg, #3b0764 0%, #6d28d9 100%)', padding: '1.2rem 1.5rem', color: '#fff' }}>
                            {/* Banner header row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: 0.3 }}>⚡ AI Generated Summary</span>
                                    <span style={{
                                        fontSize: '0.68rem', fontWeight: 800, padding: '3px 12px', borderRadius: 99,
                                        background: latestAi.urgencyLevel === 'Urgent' ? '#fca5a5' : latestAi.urgencyLevel === 'Soon' ? '#fcd34d' : '#86efac',
                                        color: latestAi.urgencyLevel === 'Urgent' ? '#7f1d1d' : latestAi.urgencyLevel === 'Soon' ? '#78350f' : '#14532d',
                                    }}>
                                        {latestAi.urgencyLevel === 'Urgent' ? '🔴' : latestAi.urgencyLevel === 'Soon' ? '🟡' : '🟢'} {latestAi.urgencyLevel}
                                    </span>
                                </div>
                                <button
                                    onClick={markAiRead}
                                    disabled={markingRead}
                                    style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', borderRadius: 'var(--radius-sm)', padding: '6px 14px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}
                                >
                                    {markingRead ? '...' : '✓ Mark as Reviewed'}
                                </button>
                            </div>

                            {/* Symptom meta */}
                            <div style={{ fontSize: '0.8rem', color: '#ddd6fe', fontWeight: 600, marginBottom: 10 }}>
                                {latestAi.symptomName} · {latestAi.consecutiveCount || latestAi.consecutiveDays} consecutive submissions · Severity: {latestAi.severityTrend?.join(' → ')}
                            </div>

                            {/* AI summary text */}
                            <p style={{ fontSize: '0.82rem', lineHeight: 1.7, color: '#ede9fe', whiteSpace: 'pre-wrap', margin: '0 0 10px' }}>
                                {latestAi.aiSummary}
                            </p>

                            {/* Disclaimer */}
                            <div style={{ fontSize: '0.7rem', color: '#c4b5fd', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 8 }}>
                                Final medical decision rests with the treating physician.
                            </div>
                        </div>
                    )}

                    {/* ── Divider ── */}
                    {latestAi && showAiBanner && (
                        <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, padding: '10px 0', background: 'var(--bg)', letterSpacing: 1, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                            ─── Patient Logs Below ───
                        </div>
                    )}

                    {/* ══ SECTION 2 — Symptom Logs ══ */}
                    <div style={{ padding: '1rem 1.5rem' }}>

                        {/* Date navigation */}
                        {allDates.length > 0 ? (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary)' }}>
                                        Symptom Logs
                                        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                            ({logsForDate.length} submission{logsForDate.length !== 1 ? 's' : ''} this day)
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <button
                                            onClick={() => setDateIdx(i => Math.min(i + 1, allDates.length - 1))}
                                            disabled={dateIdx >= allDates.length - 1}
                                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem', color: dateIdx >= allDates.length - 1 ? '#ccc' : 'var(--primary)', fontWeight: 700 }}
                                        >← Prev</button>
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)', minWidth: 100, textAlign: 'center' }}>{selectedDate}</span>
                                        <button
                                            onClick={() => setDateIdx(i => Math.max(i - 1, 0))}
                                            disabled={dateIdx === 0}
                                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem', color: dateIdx === 0 ? '#ccc' : 'var(--primary)', fontWeight: 700 }}
                                        >Next →</button>
                                    </div>
                                </div>

                                {/* Log cards */}
                                {logsForDate.map((log, idx) => {
                                    const responses = responsesMap[log.id] || [];
                                    const aiTriggered = isAiTriggerLog(log);
                                    return (
                                        <div key={log.id} className="card" style={{ marginBottom: '1rem', border: log.flagged ? '1.5px solid var(--danger)' : '1.5px solid var(--border)' }}>
                                            {/* Card top stripe */}
                                            <div style={{ height: 3, background: log.flagged ? 'var(--danger)' : 'linear-gradient(90deg, var(--primary), var(--accent))' }} />
                                            <div className="card-body">

                                                {/* Submission meta */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                        Submission {idx + 1} · Submitted at {fmt(log.submittedAt)}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        {log.flagged && <span className="badge badge-danger">🚨 Auto-alert sent at {fmt(log.submittedAt)}</span>}
                                                        {aiTriggered && <span style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: 99, padding: '2px 10px', fontSize: '0.65rem', fontWeight: 800 }}>⚡ Triggered AI analysis</span>}
                                                    </div>
                                                </div>

                                                {/* Flagged alert banner */}
                                                {log.flagged && (
                                                    <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 10, fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 600 }}>
                                                        ⚠ Auto-alert was sent to you at {fmtFull(log.submittedAt)} for this submission
                                                    </div>
                                                )}

                                                {/* Symptoms */}
                                                <div style={{ marginBottom: 12 }}>
                                                    {log.symptoms?.map(s => (
                                                        <div key={s.name} style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 8 }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--primary)' }}>{s.emoji} {s.name}</span>
                                                                <span className={`sev-pill ${sevLabel(s.severity)}`}>{s.severity}/10</span>
                                                            </div>
                                                            <div className="sev-bar-track">
                                                                <div className="sev-bar-fill" style={{ width: `${s.severity * 10}%`, background: sevColor(s.severity) }} />
                                                            </div>
                                                            {s.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 5 }}>💬 "{s.notes}"</div>}
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Vitals */}
                                                {log.vitals && Object.values(log.vitals).some(v => v) && (
                                                    <div style={{ marginBottom: 12 }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Vitals</div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6 }}>
                                                            {[['🌡️', 'Temp', log.vitals.temp ? `${log.vitals.temp}°C` : '—'],
                                                            ['↑', 'Sys', log.vitals.bpSys ? `${log.vitals.bpSys}` : '—'],
                                                            ['↓', 'Dia', log.vitals.bpDia ? `${log.vitals.bpDia}` : '—'],
                                                            ['💓', 'HR', log.vitals.hr ? `${log.vitals.hr} bpm` : '—'],
                                                            ['🫁', 'SpO2', log.vitals.spo2 ? `${log.vitals.spo2}%` : '—'],
                                                            ['🩸', 'Sugar', log.vitals.sugar ? `${log.vitals.sugar}` : '—'],
                                                            ].filter(([, , v]) => v !== '—').map(([emoji, label, val]) => (
                                                                <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 6px', textAlign: 'center' }}>
                                                                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--primary)' }}>{emoji} {val}</div>
                                                                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Doctor response area */}
                                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Doctor's Response</div>

                                                    {/* Existing responses */}
                                                    {responses.map(r => (
                                                        <div key={r.id} style={{ background: 'var(--accent-pale)', border: '1px solid #b2dfdf', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 8, fontSize: '0.8rem', color: 'var(--accent)' }}>
                                                            <div style={{ fontWeight: 700, marginBottom: 3 }}>🩺 {r.doctorName || 'Dr.'}</div>
                                                            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.message}</div>
                                                        </div>
                                                    ))}

                                                    {/* New response input */}
                                                    <textarea
                                                        className="form-input"
                                                        rows={2}
                                                        placeholder="Add a response for this log..."
                                                        value={responseTexts[log.id] || ''}
                                                        onChange={e => setResponseTexts(p => ({ ...p, [log.id]: e.target.value }))}
                                                        style={{ fontSize: '0.82rem', resize: 'vertical' }}
                                                    />
                                                    <button
                                                        className="btn btn-accent btn-sm"
                                                        style={{ marginTop: 6, width: '100%' }}
                                                        onClick={() => sendResponse(log)}
                                                        disabled={sendingMap[log.id] || !responseTexts[log.id]?.trim()}
                                                    >
                                                        {sendingMap[log.id] ? 'Sending...' : 'Send Response'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem', fontSize: '0.9rem' }}>
                                No symptom logs yet for this patient.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
