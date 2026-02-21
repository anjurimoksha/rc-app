import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDocs, updateDoc
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';
import ChatWindow from '../../components/ChatWindow';
import LogAndAiModal from '../../components/LogAndAiModal';
import jsPDF from 'jspdf';
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
    // Medical history detail + edit state
    const [selectedVisit, setSelectedVisit] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [editedVisit, setEditedVisit] = useState(null);
    const [savingEdit, setSavingEdit] = useState(false);

    // AI Summaries
    const [aiSummaries, setAiSummaries] = useState([]);
    const [showAiCard, setShowAiCard] = useState(true);
    // Scroll
    const [showBackTop, setShowBackTop] = useState(false);
    const topRef = useRef(null);

    const chatId = patient ? `${patient.id}_${currentUser?.uid}` : null;

    // Real-time symptom logs for this patient
    // NOTE: No orderBy here — where+orderBy requires a composite Firestore index.
    // We sort client-side instead so it works without any index configuration.
    useEffect(() => {
        if (!patientId) return;
        const q = query(
            collection(db, 'symptomLogs'),
            where('patientId', '==', patientId)
        );
        return onSnapshot(q, snap => {
            const newLogs = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => {
                    const ta = a.submittedAt?.toMillis?.() ?? 0;
                    const tb = b.submittedAt?.toMillis?.() ?? 0;
                    return tb - ta; // newest first
                });
            setLogs(newLogs);
            // Auto-open modal for new flagged log
            const flagged = newLogs.find(l => l.flagged && !selectedLog);
            if (flagged && activeView === 'log') setSelectedLog(flagged);
        }, err => console.error('symptomLogs listener error:', err));
    }, [patientId]);

    // Medical visits (no orderBy — sort client-side)
    useEffect(() => {
        if (!patientId) return;
        getDocs(query(collection(db, 'medicalVisits'), where('patientId', '==', patientId)))
            .then(snap => {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
                setVisits(list);
            })
            .catch(err => console.error('medicalVisits fetch error:', err));
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

    async function saveVisitEdit() {
        if (!editedVisit?.id) return;
        setSavingEdit(true);
        try {
            const { id, ...data } = editedVisit;

            // Build a specific diff message
            const old = selectedVisit;
            const changes = [];
            if (old.diagnosis !== editedVisit.diagnosis)
                changes.push(`• Diagnosis changed to "${editedVisit.diagnosis}"`);
            if (old.doctorNotes !== editedVisit.doctorNotes)
                changes.push(`• Doctor notes updated`);

            // Medication changes
            const oldMeds = (old.medications || []).map(m => `${m.name} ${m.dosage}`);
            const newMeds = (editedVisit.medications || []).map(m => `${m.name} ${m.dosage}`);
            const addedMeds = newMeds.filter(m => !oldMeds.includes(m));
            const removedMeds = oldMeds.filter(m => !newMeds.includes(m));
            if (addedMeds.length) changes.push(`• Added medication(s): ${addedMeds.join(', ')}`);
            if (removedMeds.length) changes.push(`• Removed medication(s): ${removedMeds.join(', ')}`);
            // Status changes
            (editedVisit.medications || []).forEach(nm => {
                const om = (old.medications || []).find(m => m.name === nm.name && m.dosage === nm.dosage);
                if (om && om.status !== nm.status) changes.push(`• ${nm.name}: status changed to ${nm.status}`);
            });

            const oldInstr = (old.followUpInstructions || []).length;
            const newInstr = (editedVisit.followUpInstructions || []).length;
            if (oldInstr !== newInstr) changes.push(`• Follow-up instructions updated (${oldInstr} → ${newInstr} items)`);

            const notifMessage = changes.length
                ? `Dr. ${userData?.name} updated your record for "${editedVisit.diagnosis}":\n${changes.join('\n')}`
                : `Dr. ${userData?.name} made minor updates to your visit record.`;

            await updateDoc(doc(db, 'medicalVisits', id), data);
            await addDoc(collection(db, 'notifications', patientId, 'items'), {
                type: 'record_update',
                title: '🩺 Medical Record Updated',
                message: notifMessage,
                patientName: patient?.name,
                visitId: id,
                timestamp: serverTimestamp(),
                read: false,
            });
            setVisits(prev => prev.map(v => v.id === id ? editedVisit : v));
            setSelectedVisit(editedVisit);
            setEditMode(false);
            alert('Record saved and patient notified ✅');
        } catch (err) {
            console.error(err);
            alert('Failed to save.');
        } finally {
            setSavingEdit(false);
        }
    }

    function downloadPDF(v) {
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        const margin = 40;
        let y = margin;
        const pageWidth = pdf.internal.pageSize.getWidth();

        pdf.setFontSize(18); pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(26, 60, 110);
        pdf.text(v.diagnosis || 'Medical Record', margin, y); y += 26;

        pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100);
        pdf.text(`${v.hospital || ''} · ${v.department || ''} · ${v.doctorName || ''}`, margin, y); y += 20;
        pdf.text(`Date: ${v.visitDate || ''}   Ward: ${v.ward || '—'}   Duration: ${v.duration || '—'}`, margin, y); y += 30;

        pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(26, 60, 110);
        pdf.text('Hospital Report / Diagnosis', margin, y); y += 18;
        pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60);
        const noteLines = pdf.splitTextToSize(v.doctorNotes || 'No notes.', pageWidth - margin * 2);
        pdf.text(noteLines, margin, y); y += noteLines.length * 14 + 20;

        if (v.medications?.length) {
            pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(26, 60, 110);
            pdf.text('Prescribed Medications', margin, y); y += 18;
            pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60);
            v.medications.forEach((m, i) => {
                pdf.text(`${i + 1}. ${m.name} ${m.dosage} — ${m.frequency} — ${m.duration} [${m.status}]`, margin, y);
                y += 14;
            });
            y += 10;
        }

        if (v.followUpInstructions?.length) {
            pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(26, 60, 110);
            pdf.text('Follow-Up Instructions', margin, y); y += 18;
            pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60);
            v.followUpInstructions.forEach((inst, i) => {
                pdf.text(`✓ ${inst}`, margin, y); y += 14;
            });
        }

        pdf.save(`${v.diagnosis?.replace(/\s+/g, '_') || 'record'}_${v.visitDate || 'report'}.pdf`);
    }

    async function markAiRead(summaryId) {
        await updateDoc(doc(db, 'aiSummaries', summaryId), { read: true });
        setShowAiCard(false);
    }

    function scrollToSection(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('section-highlight');
        setTimeout(() => el.classList.remove('section-highlight'), 1100);
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
    const latestAi = aiSummaries[0];

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

                    {/* RIGHT: Action Buttons + AI Card */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                        {/* ⚡ AI Summary Card */}
                        {latestAi && showAiCard && (
                            <div style={{ borderLeft: '4px solid #7c3aed', background: '#faf5ff', borderRadius: 'var(--radius)', padding: '1rem 1.2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        ⚡ AI Generated Summary
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                            {latestAi.generatedDate}
                                        </span>
                                    </div>
                                    <span style={{
                                        fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99,
                                        background: latestAi.urgencyLevel === 'Urgent' ? '#fee2e2' : latestAi.urgencyLevel === 'Soon' ? '#ffedd5' : '#dcfce7',
                                        color: latestAi.urgencyLevel === 'Urgent' ? '#dc2626' : latestAi.urgencyLevel === 'Soon' ? '#c2410c' : '#16a34a',
                                    }}>
                                        {latestAi.urgencyLevel === 'Urgent' ? '🔴' : latestAi.urgencyLevel === 'Soon' ? '🟡' : '🟢'} {latestAi.urgencyLevel}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7c3aed', marginBottom: 6 }}>
                                    {latestAi.symptomName} · {latestAi.consecutiveDays} consecutive days · Severity: {latestAi.severityTrend?.join(' → ')}
                                </div>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: '0 0 10px' }}>
                                    {latestAi.aiSummary}
                                </p>
                                <div style={{ fontSize: '0.68rem', color: '#7c3aed', fontStyle: 'italic', borderTop: '1px solid #e9d5ff', paddingTop: 8, marginBottom: 8 }}>
                                    Final medical decision rests with the treating physician.
                                </div>
                                <button
                                    onClick={() => markAiRead(latestAi.id)}
                                    style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '6px 14px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                                >
                                    ✓ Mark as Reviewed
                                </button>
                            </div>
                        )}

                        {/* Log button — opens unified log + AI modal */}
                        <div className="card" style={{ padding: '1.1rem 1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, border: '1.5px solid var(--border)' }}
                            onClick={() => setShowLogModal(true)}>
                            <div style={{ fontSize: '1.5rem', width: 44, height: 44, background: 'var(--bg)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📋</div>
                            <div>
                                <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.92rem' }}>Symptom Logs</div>
                                <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)' }}>View patient daily logs</div>
                            </div>
                        </div>

                        {/* Medical History — scroll */}
                        <div className="card" style={{ padding: '1.1rem 1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, border: '1.5px solid var(--border)' }}
                            onClick={() => scrollToSection('medical-history-section')}>
                            <div style={{ fontSize: '1.5rem', width: 44, height: 44, background: 'var(--bg)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🗂️</div>
                            <div>
                                <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.92rem' }}>Medical History</div>
                                <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)' }}>Past visits & prescriptions ↓</div>
                            </div>
                        </div>

                        {/* Trend Analysis — scroll */}
                        <div className="card" style={{ padding: '1.1rem 1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, border: '1.5px solid var(--border)' }}
                            onClick={() => scrollToSection('trend-analysis-section')}>
                            <div style={{ fontSize: '1.5rem', width: 44, height: 44, background: 'var(--bg)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📈</div>
                            <div>
                                <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.92rem' }}>Trend Analysis</div>
                                <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)' }}>Recovery progress charts ↓</div>
                            </div>
                        </div>


                    </div>
                </div>

                {/* ── Symptom Log Sub-view (Log button opens this inline panel) ── */}
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

                {/* ═══ Medical History Section (always rendered, scroll target) ═══ */}
                <div id="medical-history-section" className="subview-panel" style={{ marginTop: '2rem', scrollMarginTop: '80px' }}>
                    {/* Visit list */}
                    {!selectedVisit && (
                        <>
                            <div className="subview-header">
                                <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1rem' }}>🗂️ Medical History — {patient.name}</span>
                            </div>
                            {visits.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No visit records found.</div>}
                            {visits.sort((a, b) => b.visitDate > a.visitDate ? 1 : -1).map(v => (
                                <div key={v.id} className="card" style={{ marginBottom: '0.8rem', cursor: 'pointer' }} onClick={() => { setSelectedVisit(v); setEditMode(false); setEditedVisit({ ...v }); }}>
                                    <div style={{ height: 3, background: 'linear-gradient(90deg, var(--primary), var(--accent))' }} />
                                    <div className="card-body">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                                            <div>
                                                <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>{v.diagnosis}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>📅 {v.visitDate} · {v.hospital} · {v.doctorName}</div>
                                                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                    {v.tags?.map(t => <span key={t} className="badge badge-primary">{t}</span>)}
                                                    <span className="badge badge-accent">{v.medications?.length || 0} medications</span>
                                                </div>
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>Open →</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}

                    {/* Visit detail view (same as patient) */}
                    {selectedVisit && !editMode && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem' }} onClick={() => setSelectedVisit(null)}>← All Records</button>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {selectedVisit.tags?.map(t => <span key={t} className="badge badge-primary">{t}</span>)}
                                    <button className="btn btn-accent btn-sm" onClick={() => setEditMode(true)}>✏️ Edit Record</button>
                                    <button className="btn btn-sm btn-outline" onClick={() => downloadPDF(selectedVisit)}>⬇️ PDF</button>
                                </div>
                            </div>

                            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary)', marginBottom: 4 }}>{selectedVisit.diagnosis}</h2>
                            <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: '1.2rem' }}>{selectedVisit.hospital} · {selectedVisit.department}</p>

                            {/* Visit Summary */}
                            <div className="card" style={{ marginBottom: '1rem' }}>
                                <div className="card-body">
                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 14 }}>🗒️ Visit Summary</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '14px 20px' }}>
                                        {[['DATE', selectedVisit.visitDate], ['HOSPITAL', selectedVisit.hospital], ['DOCTOR', selectedVisit.doctorName], ['DEPARTMENT', selectedVisit.department], ['WARD / UNIT', selectedVisit.ward || '—']].map(([l, val]) => (
                                            <div key={l}>
                                                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>{l}</div>
                                                <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '0.88rem' }}>{val}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Diagnosis */}
                            <div className="card" style={{ marginBottom: '1rem' }}>
                                <div className="card-body">
                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 12 }}>📋 Hospital Report / Diagnosis</div>
                                    <div style={{ background: '#f0f7ff', border: '1px solid #c3d5f0', borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>{selectedVisit.doctorNotes}</div>
                                </div>
                            </div>

                            {/* Medications table */}
                            <div className="card" style={{ marginBottom: '1rem' }}>
                                <div className="card-body">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>💊 Prescribed Medications</div>
                                        <span className="badge badge-accent">{selectedVisit.medications?.length || 0} medications</span>
                                    </div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                                {['MEDICATION', 'DOSAGE', 'FREQUENCY', 'DURATION', 'STATUS'].map(h => (
                                                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedVisit.medications?.map((m, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--primary)' }}>{m.name}</td>
                                                    <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{m.dosage}</td>
                                                    <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{m.frequency}</td>
                                                    <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{m.duration}</td>
                                                    <td style={{ padding: '8px 10px' }}><span style={{ color: m.status === 'active' ? 'var(--success)' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.75rem' }}>{m.status === 'active' ? '● Active' : '✓ Done'}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Follow-up instructions */}
                            {selectedVisit.followUpInstructions?.length > 0 && (
                                <div className="card" style={{ marginBottom: '1rem' }}>
                                    <div className="card-body">
                                        <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 12 }}>📌 Follow-Up Instructions</div>
                                        {selectedVisit.followUpInstructions.map((inst, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < selectedVisit.followUpInstructions.length - 1 ? '1px solid var(--border)' : 'none', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                                                <div style={{ width: 18, height: 18, borderRadius: 3, background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}>✓</div>
                                                {inst}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Edit mode */}
                    {selectedVisit && editMode && editedVisit && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem' }} onClick={() => setEditMode(false)}>← Cancel Edit</button>
                                <button className="btn btn-accent btn-sm" onClick={saveVisitEdit} disabled={savingEdit}>{savingEdit ? 'Saving...' : '💾 Save & Notify Patient'}</button>
                            </div>

                            <div className="card" style={{ marginBottom: '1rem' }}>
                                <div className="card-body">
                                    <label className="form-label">Diagnosis Title</label>
                                    <input className="form-input" value={editedVisit.diagnosis || ''} onChange={e => setEditedVisit(p => ({ ...p, diagnosis: e.target.value }))} />
                                    <label className="form-label" style={{ marginTop: 12 }}>Doctor Notes / Report</label>
                                    <textarea className="form-input" rows={5} value={editedVisit.doctorNotes || ''} onChange={e => setEditedVisit(p => ({ ...p, doctorNotes: e.target.value }))} />
                                </div>
                            </div>

                            <div className="card" style={{ marginBottom: '1rem' }}>
                                <div className="card-body">
                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 12 }}>💊 Medications</div>
                                    {editedVisit.medications?.map((m, i) => (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                                            <input className="form-input" placeholder="Name" value={m.name} onChange={e => { const ms = [...editedVisit.medications]; ms[i] = { ...ms[i], name: e.target.value }; setEditedVisit(p => ({ ...p, medications: ms })); }} />
                                            <input className="form-input" placeholder="Dosage" value={m.dosage} onChange={e => { const ms = [...editedVisit.medications]; ms[i] = { ...ms[i], dosage: e.target.value }; setEditedVisit(p => ({ ...p, medications: ms })); }} />
                                            <input className="form-input" placeholder="Frequency" value={m.frequency} onChange={e => { const ms = [...editedVisit.medications]; ms[i] = { ...ms[i], frequency: e.target.value }; setEditedVisit(p => ({ ...p, medications: ms })); }} />
                                            <input className="form-input" placeholder="Duration" value={m.duration} onChange={e => { const ms = [...editedVisit.medications]; ms[i] = { ...ms[i], duration: e.target.value }; setEditedVisit(p => ({ ...p, medications: ms })); }} />
                                            <select className="form-input" value={m.status} onChange={e => { const ms = [...editedVisit.medications]; ms[i] = { ...ms[i], status: e.target.value }; setEditedVisit(p => ({ ...p, medications: ms })); }}>
                                                <option value="active">Active</option>
                                                <option value="completed">Completed</option>
                                            </select>
                                            <button style={{ background: 'var(--danger-light)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--danger)', fontWeight: 700, padding: '0 10px' }} onClick={() => setEditedVisit(p => ({ ...p, medications: p.medications.filter((_, j) => j !== i) }))}>✕</button>
                                        </div>
                                    ))}
                                    <button className="btn btn-sm btn-outline" style={{ marginTop: 6 }} onClick={() => setEditedVisit(p => ({ ...p, medications: [...(p.medications || []), { name: '', dosage: '', frequency: '', duration: '', status: 'active' }] }))}>+ Add Medication</button>
                                </div>
                            </div>

                            <div className="card" style={{ marginBottom: '1rem' }}>
                                <div className="card-body">
                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 12 }}>📌 Follow-Up Instructions</div>
                                    {(editedVisit.followUpInstructions || []).map((inst, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                            <input className="form-input" style={{ flex: 1 }} value={inst} onChange={e => { const arr = [...editedVisit.followUpInstructions]; arr[i] = e.target.value; setEditedVisit(p => ({ ...p, followUpInstructions: arr })); }} />
                                            <button style={{ background: 'var(--danger-light)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--danger)', fontWeight: 700, padding: '0 10px' }} onClick={() => setEditedVisit(p => ({ ...p, followUpInstructions: p.followUpInstructions.filter((_, j) => j !== i) }))}>✕</button>
                                        </div>
                                    ))}
                                    <button className="btn btn-sm btn-outline" style={{ marginTop: 6 }} onClick={() => setEditedVisit(p => ({ ...p, followUpInstructions: [...(p.followUpInstructions || []), ''] }))}>+ Add Instruction</button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div id="trend-analysis-section" className="subview-panel" style={{ marginTop: '2rem', scrollMarginTop: '80px' }}>
                    <div className="subview-header">
                        <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1rem' }}>📈 Trend Analysis</span>
                    </div>
                    {trendData.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No logs to show trends yet.</div>
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

            </div>

            {/* Unified Log + AI Modal */}
            {showLogModal && (
                <LogAndAiModal
                    patient={patient}
                    patientId={patientId}
                    logs={logs}
                    aiSummaries={aiSummaries}
                    currentUser={currentUser}
                    userData={userData}
                    onClose={() => setShowLogModal(false)}
                />
            )}

            {/* Back to Top */}
            {showBackTop && (
                <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    style={{
                        position: 'fixed', bottom: 28, right: 24, zIndex: 200,
                        background: 'var(--primary)', color: '#fff',
                        border: 'none', borderRadius: '50%', width: 48, height: 48,
                        cursor: 'pointer', boxShadow: '0 4px 18px rgba(0,0,0,0.25)',
                        fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: 'fadeIn 0.2s ease',
                    }}
                    title="Back to top"
                >
                    ↑
                </button>
            )}
        </>
    );
}
