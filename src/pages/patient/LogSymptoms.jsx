import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';
import toast from 'react-hot-toast';

const SYMPTOM_LIST = [
    { name: 'Pain', emoji: '🤕' },
    { name: 'Fatigue', emoji: '😴' },
    { name: 'Swelling', emoji: '🦵' },
    { name: 'Nausea', emoji: '🤢' },
    { name: 'Fever', emoji: '🌡️' },
    { name: 'Breathlessness', emoji: '😮‍💨' },
    { name: 'Headache', emoji: '🥴' },
    { name: 'Dizziness', emoji: '💫' },
];

// Hard-coded doctor ID for demo (seeded)
const DOCTOR_ID = 'DOCTOR_DEMO_UID';

export default function LogSymptoms() {
    const { currentUser, userData } = useAuth();
    const navigate = useNavigate();
    const [selected, setSelected] = useState([]);
    const [severities, setSeverities] = useState({});
    const [notes, setNotes] = useState({});
    const [vitals, setVitals] = useState({ temp: '', bpSys: '', bpDia: '', hr: '', spo2: '', sugar: '' });
    const [submitting, setSubmitting] = useState(false);

    function toggleSymptom(name) {
        setSelected(prev =>
            prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
        );
    }

    function sevColor(v) {
        if (!v) return 'var(--border)';
        if (v <= 3) return 'var(--success)';
        if (v <= 6) return 'var(--warning)';
        if (v <= 8) return '#dd6b20';
        return 'var(--danger)';
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (selected.length === 0) { toast.error('Select at least one symptom'); return; }
        setSubmitting(true);
        try {
            const symptoms = selected.map(name => ({
                name,
                emoji: SYMPTOM_LIST.find(s => s.name === name)?.emoji || '',
                severity: Number(severities[name] || 5),
                notes: notes[name] || '',
            }));
            const flagged = symptoms.some(s => s.severity >= 8);

            // Write log to Firestore
            const logRef = await addDoc(collection(db, 'symptomLogs'), {
                patientId: currentUser.uid,
                patientName: userData?.name,
                date: new Date().toISOString().split('T')[0],
                submittedAt: serverTimestamp(),
                symptoms,
                vitals: {
                    temp: Number(vitals.temp) || 36.8,
                    bpSys: Number(vitals.bpSys) || 120,
                    bpDia: Number(vitals.bpDia) || 80,
                    hr: Number(vitals.hr) || 72,
                    spo2: Number(vitals.spo2) || 98,
                    sugar: Number(vitals.sugar) || 100,
                },
                flagged,
                assignedDoctorId: DOCTOR_DEMO_ID,
            });

            // Notify doctor
            await addDoc(collection(db, 'notifications', DOCTOR_DEMO_ID, 'items'), {
                type: flagged ? 'critical_alert' : 'log_submitted',
                title: flagged ? '🚨 Critical Alert' : '📋 New Symptom Log',
                message: flagged
                    ? `${userData?.name} logged severity ≥ 8. Immediate review needed.`
                    : `${userData?.name} submitted their daily symptom log.`,
                patientId: currentUser.uid,
                patientName: userData?.name,
                logId: logRef.id,
                timestamp: serverTimestamp(),
                read: false,
            });

            toast.success('Symptom log submitted! Your doctor has been notified.');
            navigate('/patient/dashboard');
        } catch (err) {
            console.error(err);
            toast.error('Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <>
            <Navbar portalType="patient" />
            <div className="page" style={{ maxWidth: 700 }}>
                <div className="page-header">
                    <h1>📝 Log Today's Symptoms</h1>
                    <p>This information will be immediately visible to Dr. Priya Sharma</p>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Symptom Selection */}
                    <div className="card" style={{ marginBottom: '1.2rem' }}>
                        <div className="card-body">
                            <div className="section-heading">Select Symptoms</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8 }}>
                                {SYMPTOM_LIST.map(s => (
                                    <div
                                        key={s.name}
                                        onClick={() => toggleSymptom(s.name)}
                                        style={{
                                            padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                            border: selected.includes(s.name) ? '2px solid var(--accent)' : '1.5px solid var(--border)',
                                            background: selected.includes(s.name) ? 'var(--accent-pale)' : 'var(--bg)',
                                            transition: 'var(--transition)', display: 'flex', alignItems: 'center', gap: 6,
                                            fontWeight: 600, fontSize: '0.87rem',
                                        }}
                                    >
                                        <span>{s.emoji}</span> {s.name}
                                    </div>
                                ))}
                            </div>

                            {selected.length > 0 && (
                                <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {selected.map(name => (
                                        <div key={name} style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                <span style={{ fontWeight: 700 }}>
                                                    {SYMPTOM_LIST.find(s => s.name === name)?.emoji} {name}
                                                </span>
                                                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: sevColor(severities[name]) }}>
                                                    {severities[name] || 5}/10
                                                </span>
                                            </div>
                                            <input
                                                type="range" min={1} max={10}
                                                value={severities[name] || 5}
                                                onChange={e => setSeverities(p => ({ ...p, [name]: Number(e.target.value) }))}
                                                style={{ width: '100%', accentColor: sevColor(severities[name]) }}
                                            />
                                            <input
                                                className="form-input"
                                                style={{ marginTop: 8 }}
                                                type="text"
                                                placeholder="Add notes (optional)"
                                                value={notes[name] || ''}
                                                onChange={e => setNotes(p => ({ ...p, [name]: e.target.value }))}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Vitals */}
                    <div className="card" style={{ marginBottom: '1.2rem' }}>
                        <div className="card-body">
                            <div className="section-heading">Today's Vitals (optional)</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
                                {[
                                    ['temp', '🌡️ Temperature (°C)', '36.8'],
                                    ['bpSys', '↑ Systolic BP', '120'],
                                    ['bpDia', '↓ Diastolic BP', '80'],
                                    ['hr', '💓 Heart Rate (bpm)', '72'],
                                    ['spo2', '🫁 SpO2 (%)', '98'],
                                    ['sugar', '🩸 Sugar (mg/dL)', '100'],
                                ].map(([key, label, ph]) => (
                                    <div key={key}>
                                        <label className="form-label" style={{ fontSize: '0.75rem' }}>{label}</label>
                                        <input
                                            className="form-input"
                                            type="number"
                                            placeholder={ph}
                                            value={vitals[key]}
                                            onChange={e => setVitals(p => ({ ...p, [key]: e.target.value }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button className="btn btn-accent btn-full" type="submit" disabled={submitting}>
                        {submitting ? 'Submitting...' : '✅ Submit Symptom Log'}
                    </button>
                    <button type="button" className="btn btn-outline btn-full" style={{ marginTop: 8 }} onClick={() => navigate('/patient/dashboard')}>
                        Cancel
                    </button>
                </form>
            </div>
        </>
    );
}

// Export the doctor ID so it can be updated after seeding
export const DOCTOR_DEMO_ID = 'DOCTOR_DEMO_UID';
