import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import jsPDF from 'jspdf';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';

export default function PatientMedHistory() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [visits, setVisits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        if (!currentUser) return;
        async function fetchVisits() {
            try {
                const q = query(
                    collection(db, 'medicalVisits'),
                    where('patientId', '==', currentUser.uid)
                );
                const snap = await getDocs(q);
                const raw = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => (b.visitDate > a.visitDate ? 1 : -1));

                // Deduplicate: keep first occurrence of each visitDate+diagnosis+hospital combo
                const seen = new Set();
                const data = raw.filter(v => {
                    const key = `${v.visitDate}||${v.diagnosis}||${v.hospital}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });

                console.log('Medical visits found:', data.length, '(after dedup) for UID:', currentUser.uid);
                setVisits(data);
            } catch (err) {
                console.error('Failed to fetch medical visits:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchVisits();
    }, [currentUser]);

    function downloadPDF(v) {
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        const margin = 40;
        let y = margin;
        const pageWidth = pdf.internal.pageSize.getWidth();
        pdf.setFontSize(18); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(26, 60, 110);
        pdf.text(v.diagnosis || 'Medical Record', margin, y); y += 26;
        pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100);
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
            v.medications.forEach((m, i) => { pdf.text(`${i + 1}. ${m.name} ${m.dosage} — ${m.frequency} — ${m.duration} [${m.status}]`, margin, y); y += 14; });
            y += 10;
        }
        if (v.followUpInstructions?.length) {
            pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(26, 60, 110);
            pdf.text('Follow-Up Instructions', margin, y); y += 18;
            pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60);
            v.followUpInstructions.forEach(inst => { pdf.text(`✓ ${inst}`, margin, y); y += 14; });
        }
        pdf.save(`${v.diagnosis?.replace(/\s+/g, '_') || 'record'}_${v.visitDate || 'report'}.pdf`);
    }


    // ── Detail view ──────────────────────────────────────────────────────────
    if (selected) {
        const v = selected;
        const followUpInstructions = v.followUpInstructions || [
            'Avoid heavy lifting (>5 kg) for 4 weeks.',
            'Keep incision site clean and dry. Change dressing every 2 days.',
            'Light walking 15–20 minutes twice daily is encouraged.',
            'Diet: Start with liquids, progress to soft foods. Avoid spicy/oily food for 2 weeks.',
            `Scheduled follow-up: February 22, 2026 — Apollo Hospitals OPD, Dr. Sharma.`,
        ];

        return (
            <>
                <Navbar portalType="patient" />
                <div className="page" style={{ maxWidth: 860, paddingBottom: 120 }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
                            onClick={() => setSelected(null)}
                        >
                            ← Back to Medical History
                        </button>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {v.tags?.map(t => <span key={t} className="badge badge-primary">{t}</span>)}
                            <button className="btn btn-primary btn-sm" onClick={() => downloadPDF(v)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                ⬇️ Download PDF
                            </button>
                        </div>
                    </div>

                    {/* Title */}
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', marginBottom: 4 }}>{v.diagnosis}</h1>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.8rem' }}>{v.hospital} · {v.department}</p>

                    {/* Visit Summary */}
                    <div className="card" style={{ marginBottom: '1.2rem' }}>
                        <div className="card-body">
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                🗒️ Visit Summary
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px 24px' }}>
                                {[
                                    ['DATE', v.visitDate],
                                    ['HOSPITAL', v.hospital],
                                    ['DOCTOR', v.doctorName],
                                    ['DEPARTMENT', v.department],
                                    ['WARD / UNIT', v.ward || 'Surgical Ward B'],
                                ].map(([label, val]) => (
                                    <div key={label}>
                                        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--primary)' }}>{val}</div>
                                    </div>
                                ))}
                            </div>
                            {v.duration && (
                                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>DURATION OF STAY</div>
                                    <div style={{ fontWeight: 600 }}>{v.duration}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Hospital Report / Diagnosis */}
                    <div className="card" style={{ marginBottom: '1.2rem' }}>
                        <div className="card-body">
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                                📋 Hospital Report / Diagnosis
                            </div>
                            <div style={{
                                background: '#f0f7ff', border: '1px solid #c3d5f0', borderRadius: 'var(--radius-sm)',
                                padding: '14px 16px', fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)'
                            }}>
                                {v.doctorNotes || 'No report available.'}
                            </div>
                        </div>
                    </div>

                    {/* Prescribed Medications */}
                    <div className="card" style={{ marginBottom: '1.2rem' }}>
                        <div className="card-body">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <div style={{ fontSize: '0.88rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>💊 Prescribed Medications</div>
                                <span className="badge badge-accent">{v.medications?.length || 0} medications</span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                            {['MEDICATION', 'DOSAGE', 'FREQUENCY', 'DURATION', 'INSTRUCTIONS', 'STATUS'].map(h => (
                                                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {v.medications?.map((m, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--primary)' }}>{m.name}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{m.dosage}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{m.frequency}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{m.duration}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{m.instructions || '—'}</td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        fontSize: '0.72rem', fontWeight: 700,
                                                        color: m.status === 'active' ? 'var(--success)' : 'var(--text-muted)',
                                                    }}>
                                                        {m.status === 'active' ? '● Active' : '✓ Done'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Doctor's Notes */}
                    {v.doctorNotes && (
                        <div className="card" style={{ marginBottom: '1.2rem' }}>
                            <div className="card-body">
                                <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>📝 Doctor's Notes</div>
                                <blockquote style={{
                                    borderLeft: '3px solid var(--accent)', paddingLeft: 16,
                                    fontStyle: 'italic', fontSize: '0.87rem', color: 'var(--text-secondary)',
                                    lineHeight: 1.7, margin: 0,
                                }}>
                                    "{v.doctorNotes}"
                                </blockquote>
                                <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-muted)' }}>— {v.doctorName}, {v.department}</div>
                            </div>
                        </div>
                    )}

                    {/* Follow-Up Instructions */}
                    <div className="card" style={{ marginBottom: '1.2rem' }}>
                        <div className="card-body">
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>📌 Follow-Up Instructions</div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {followUpInstructions.map((inst, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 10,
                                        padding: '10px 0', borderBottom: i < followUpInstructions.length - 1 ? '1px solid var(--border)' : 'none',
                                        fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                                    }}>
                                        <div style={{ width: 20, height: 20, borderRadius: 4, background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.7rem', color: '#fff', fontWeight: 700 }}>✓</div>
                                        {inst}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Action Bar */}
                    <div style={{
                        position: 'fixed', bottom: 50, left: 0, right: 0,
                        background: 'var(--primary)', padding: '14px 2rem',
                        display: 'flex', gap: 12, justifyContent: 'center',
                        zIndex: 300,
                    }}>
                        <button className="btn btn-accent" onClick={() => navigate('/patient/log')} style={{ flex: '0 0 auto' }}>📓 Log Today's Symptoms</button>
                        <button className="btn btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', flex: '0 0 auto' }} onClick={() => navigate('/patient/log')}>💬 Message Dr. Sharma</button>
                        <button className="btn btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', flex: '0 0 auto' }} onClick={() => navigate('/patient/trends')}>📈 View Recovery Trends</button>
                    </div>
                </div>
            </>
        );
    }

    // ── List view (all visits) ───────────────────────────────────────────────
    return (
        <>
            <Navbar portalType="patient" />
            <div className="page" style={{ paddingBottom: 100 }}>
                <div className="page-header">
                    <h1>🗂️ Medical History</h1>
                    <p>Your past visits, diagnoses, and medications</p>
                </div>

                {visits.length === 0 && (
                    <div className="card">
                        <div className="card-body" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
                            <p>No medical visit records yet.</p>
                        </div>
                    </div>
                )}

                {visits.map(v => (
                    <div key={v.id} className="card" style={{ marginBottom: '1rem', cursor: 'pointer' }} onClick={() => setSelected(v)}>
                        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--primary), var(--accent))' }} />
                        <div className="card-body">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--primary)', marginBottom: 4 }}>{v.diagnosis}</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                        📅 {v.visitDate} · {v.hospital} · {v.doctorName}
                                    </div>
                                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {v.tags?.map(t => <span key={t} className="badge badge-primary">{t}</span>)}
                                        <span className="badge badge-accent">{v.medications?.length || 0} medications</span>
                                    </div>
                                </div>
                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', color: 'var(--primary)' }}>
                                    →
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}
