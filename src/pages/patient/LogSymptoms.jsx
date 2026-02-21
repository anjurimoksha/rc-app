import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, addDoc, serverTimestamp, getDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';
import ChatWindow from '../../components/ChatWindow';
import VoiceInput from '../../components/VoiceInput';
import toast from 'react-hot-toast';
import { checkConsecutiveSymptomsAndSummarize } from '../../utils/aiSymptomCheck';


const SYMPTOM_LIST = [
    { name: 'Nausea', emoji: '🤢' },
    { name: 'Fatigue', emoji: '😴' },
    { name: 'Pain', emoji: '🤕' },
    { name: 'Headache', emoji: '🥴' },
    { name: 'Swelling', emoji: '🦵' },
    { name: 'Fever', emoji: '🌡️' },
    { name: 'Low Mood', emoji: '😔' },
    { name: 'Breathlessness', emoji: '😮‍💨' },
    { name: 'Dizziness', emoji: '💫' },
    { name: 'Appetite', emoji: '🍽️' },
    { name: 'Other', emoji: '➕' },
];

export default function LogSymptoms() {
    const { currentUser, userData } = useAuth();
    const navigate = useNavigate();
    const { doctorId: paramDocId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'log';

    const [selected, setSelected] = useState([]);
    const [severities, setSeverities] = useState({});
    const [notes, setNotes] = useState({});
    const [vitals, setVitals] = useState({ temp: '', bpSys: '', bpDia: '', hr: '', spo2: '', sugar: '' });
    const [submitting, setSubmitting] = useState(false);
    const [doctorData, setDoctorData] = useState(null);

    useEffect(() => {
        if (!paramDocId) return;
        getDoc(doc(db, 'users', paramDocId)).then(snap => {
            if (snap.exists()) setDoctorData(snap.data());
        });
    }, [paramDocId]);

    function toggleSymptom(name) {
        setSelected(prev =>
            prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
        );
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

            const logRef = await addDoc(collection(db, 'symptomLogs'), {
                patientId: currentUser.uid,
                patientName: userData?.name,
                date: new Date().toISOString().split('T')[0],
                submittedAt: serverTimestamp(),
                symptoms,
                vitals: {
                    temp: Number(vitals.temp) || null,
                    bpSys: Number(vitals.bpSys) || null,
                    bpDia: Number(vitals.bpDia) || null,
                    hr: Number(vitals.hr) || null,
                    spo2: Number(vitals.spo2) || null,
                    sugar: Number(vitals.sugar) || null,
                },
                flagged,
                assignedDoctorId: paramDocId,
            });

            if (paramDocId) {
                await addDoc(collection(db, 'notifications', paramDocId, 'items'), {
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
            }

            toast.success('Symptom log submitted!');

            // Fire-and-forget: check consecutive symptoms and trigger AI summary if needed
            if (paramDocId) {
                const patSnap = await getDoc(doc(db, 'patients', currentUser.uid));
                const patInfo = patSnap.exists() ? patSnap.data() : { name: userData?.name, age: '—', diagnosis: '—' };
                // Grab latest medications from most recent medicalVisit
                let latestMeds = [];
                try {
                    const medQ = query(collection(db, 'medicalVisits'), where('patientId', '==', currentUser.uid));
                    const medSnap = await getDocs(medQ);
                    if (!medSnap.empty) {
                        const sorted = medSnap.docs
                            .map(d => d.data())
                            .sort((a, b) => (b.visitDate > a.visitDate ? 1 : -1));
                        latestMeds = sorted[0]?.medications || [];
                    }
                } catch (_) { }
                checkConsecutiveSymptomsAndSummarize({
                    patientId: currentUser.uid,
                    doctorId: paramDocId,
                    patientInfo: patInfo,
                    currentLog: { symptoms },
                    latestMedications: latestMeds,
                }).catch(console.error);
            }

            navigate('/patient/dashboard');
        } catch (err) {
            console.error(err);
            toast.error('Failed to submit.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <>
            <Navbar portalType="patient" />
            <div className="page" style={{ paddingBottom: '100px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>🩺 Log & Connect</h1>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate('/patient/log')}>← All Doctors</button>
                </div>

                {doctorData && (
                    <div className="card" style={{ marginBottom: '1.5rem', background: 'var(--accent)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '20px', padding: '15px 25px' }}>
                        <div className="avatar-circle" style={{ width: 50, height: 50, background: 'rgba(255,255,255,0.2)', border: '2px solid #fff' }}>
                            {doctorData.name?.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Dr. {doctorData.name}</h3>
                            <p style={{ fontSize: '0.85rem', opacity: 0.9 }}>{doctorData.specialty || 'General Medicine'}</p>
                        </div>
                        <div className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                            <div className="online-dot" style={{ background: '#4ade80' }}></div> Online
                        </div>
                    </div>
                )}

                <div className="tab-header">
                    <button className={`tab-btn ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setSearchParams({ tab: 'log' })}>📝 Log Your Day</button>
                    <button className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setSearchParams({ tab: 'chat' })}>💬 Chat with Doctor</button>
                </div>

                {activeTab === 'log' ? (
                    <form onSubmit={handleSubmit}>
                        <div className="card" style={{ marginBottom: '1.5rem' }}>
                            <div className="card-body">
                                <div className="section-heading">Quick Add Symptoms</div>
                                <div className="chips-container">
                                    {SYMPTOM_LIST.map(s => (
                                        <div
                                            key={s.name}
                                            className={`symptom-chip ${selected.includes(s.name) ? 'active' : ''}`}
                                            onClick={() => toggleSymptom(s.name)}
                                        >
                                            <span>{s.emoji}</span> {s.name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {selected.length === 0 ? (
                            <div className="card" style={{ marginBottom: '1.5rem', padding: '4rem 1rem', textAlign: 'center', borderStyle: 'dashed' }}>
                                <div style={{ fontSize: '3rem', color: 'var(--accent)', marginBottom: '15px', opacity: 0.6 }}>➕</div>
                                <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Tap the chips above to add symptoms to your log</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                {selected.map(name => (
                                    <div key={name} className="card">
                                        <div className="card-body">
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{ fontSize: '1.5rem' }}>{SYMPTOM_LIST.find(s => s.name === name)?.emoji}</span>
                                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{name}</h3>
                                                </div>
                                                <div className="badge badge-accent" style={{ fontSize: '0.9rem' }}>{severities[name] || 5} / 10</div>
                                                <button type="button" onClick={() => toggleSymptom(name)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}>✕</button>
                                            </div>
                                            <input
                                                type="range" min="1" max="10"
                                                style={{ width: '100%', marginBottom: '15px', accentColor: 'var(--accent)' }}
                                                value={severities[name] || 5}
                                                onChange={e => setSeverities(p => ({ ...p, [name]: e.target.value }))}
                                            />
                                            <div style={{ background: 'var(--bg)', padding: '10px', borderRadius: 'var(--radius-sm)', display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <input
                                                    className="form-input"
                                                    style={{ border: 'none', background: 'transparent', padding: '5px', flex: 1 }}
                                                    placeholder="Optional notes... or tap 🎙️ to speak"
                                                    value={notes[name] || ''}
                                                    onChange={e => setNotes(p => ({ ...p, [name]: e.target.value }))}
                                                />
                                                <VoiceInput onResult={transcript => setNotes(p => ({ ...p, [name]: p[name] ? p[name] + ' ' + transcript : transcript }))} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="card" style={{ marginBottom: '1.5rem' }}>
                            <div className="card-body">
                                <div className="section-heading">Today's Vitals <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></div>
                                <div className="vitals-grid">
                                    {[
                                        { id: 'temp', icon: '🌡️', label: 'Temperature', unit: '°C' },
                                        { id: 'bpSys', icon: '💓', label: 'Systolic BP', unit: 'mmHg' },
                                        { id: 'bpDia', icon: '💓', label: 'Diastolic BP', unit: 'mmHg' },
                                        { id: 'hr', icon: '❤️', label: 'Heart Rate', unit: 'bpm' },
                                        { id: 'sugar', icon: '🩸', label: 'Sugar Level', unit: 'mg/dL' },
                                        { id: 'spo2', icon: '🫁', label: 'SpO2', unit: '%' },
                                    ].map(v => (
                                        <div key={v.id} className="vital-item">
                                            <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>{v.icon}</div>
                                            <div className="vital-label">{v.label}</div>
                                            <input
                                                type="text"
                                                className="form-input"
                                                style={{ border: 'none', textAlign: 'center', fontSize: '0.9rem', padding: '0', fontWeight: 700 }}
                                                placeholder="--"
                                                value={vitals[v.id]}
                                                onChange={e => setVitals(p => ({ ...p, [v.id]: e.target.value }))}
                                            />
                                            <div className="vital-unit">{v.unit}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button className="btn btn-accent btn-full" type="submit" disabled={submitting} style={{ padding: '15px', fontSize: '1rem' }}>
                            {submitting ? 'Submitting...' : '✅ Submit Today\'s Log'}
                        </button>
                    </form>
                ) : (
                    <div className="card" style={{ minHeight: '400px' }}>
                        <ChatWindow
                            doctorId={paramDocId}
                            recipientName={doctorData ? `Dr. ${doctorData.name}` : 'Doctor'}
                            recipientId={paramDocId}
                        />
                    </div>
                )}
            </div>
        </>
    );
}
