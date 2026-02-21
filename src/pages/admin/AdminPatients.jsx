import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from './AdminLayout';
import toast from 'react-hot-toast';
import Tesseract from 'tesseract.js';

const RISK_COLORS = { critical: 'var(--danger)', high: '#dd6b20', medium: '#d69e2e', low: 'var(--success)' };
const EMPTY_MED = { name: '', dosage: '', frequency: '', duration: '' };

/* ─── Shared reusable field ─── */
function Field({ label, value, onChange, type = 'text', placeholder = '', required = true }) {
    return (
        <div className="form-group">
            <label className="form-label">{label}{required ? ' *' : ''}</label>
            <input className="form-input" type={type} placeholder={placeholder}
                value={value} onChange={onChange} required={required} />
        </div>
    );
}

/* ─── Prescription Modal (shared by Step2 of add and re-visit) ─── */
function PrescriptionModal({ patientId, patientName, assignedDoctorId, doctors, onClose, onDone, stepLabel }) {
    const fileInputRef = useRef(null);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [ocrStatus, setOcrStatus] = useState(null);
    const [extractedText, setExtractedText] = useState('');
    const [editedText, setEditedText] = useState('');
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        prescriptionDate: new Date().toISOString().split('T')[0],
        diagnosisNotes: '', followUpDate: '', documentType: 'Prescription',
        doctorId: assignedDoctorId || '',
        department: 'General Medicine', ward: 'OPD',
    });
    const [medications, setMedications] = useState([{ ...EMPTY_MED }]);

    function setF(k, v) { setForm(p => ({ ...p, [k]: v })); }

    async function handleImageChange(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        setOcrStatus('reading');
        try {
            const result = await Tesseract.recognize(file, 'eng');
            const text = result.data.text || '';
            setExtractedText(text); setEditedText(text);
        } catch { setExtractedText('OCR failed — type manually.'); }
        setOcrStatus('done');
    }
    function updateMed(i, field, val) { setMedications(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m)); }
    function addMed() { setMedications(prev => [...prev, { ...EMPTY_MED }]); }
    function removeMed(i) { setMedications(prev => prev.filter((_, idx) => idx !== i)); }

    const selectedDoc = doctors.find(d => d.id === form.doctorId);
    const inputSm = { fontSize: '0.83rem', padding: '7px 10px' };

    async function handleSave(e) {
        e.preventDefault();
        setSaving(true);
        try {
            let imageUrl = '';
            if (imageFile) {
                const storageRef = ref(storage, `prescriptions/${patientId}/${Date.now()}.jpg`);
                await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(storageRef);
            }
            await addDoc(collection(db, 'prescriptions'), {
                patientId, doctorId: form.doctorId, doctorName: selectedDoc?.name || '',
                prescriptionDate: form.prescriptionDate, imageUrl, extractedText, editedText,
                medications: medications.filter(m => m.name.trim()),
                diagnosisNotes: form.diagnosisNotes, documentType: form.documentType,
                followUpDate: form.followUpDate || null, createdAt: serverTimestamp(),
            });
            await addDoc(collection(db, 'medicalVisits'), {
                patientId, doctorId: form.doctorId, doctorName: selectedDoc?.name || '',
                hospital: selectedDoc?.hospital || 'Apollo Hospitals',
                department: form.department,
                visitDate: form.prescriptionDate,
                diagnosis: form.diagnosisNotes || editedText.slice(0, 80),
                tags: [form.documentType],
                medications: medications.filter(m => m.name.trim()).map(m => ({ ...m, status: 'active', instructions: '' })),
                followUpInstructions: form.followUpDate ? [`Follow-up on ${form.followUpDate}`] : [],
                doctorNotes: editedText, ward: form.ward, duration: '—',
                createdAt: serverTimestamp(),
            });
            await addDoc(collection(db, 'notifications', patientId, 'items'), {
                type: 'new_prescription',
                title: '💊 New Prescription Added',
                message: `Dr. ${selectedDoc?.name || ''} has added a ${form.documentType.toLowerCase()} for you.`,
                timestamp: serverTimestamp(), read: false,
            });
            toast.success('Prescription saved!');
            onDone();
        } catch (err) { toast.error('Failed: ' + err.message); }
        finally { setSaving(false); }
    }

    return createPortal(
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 700, width: '96vw', maxHeight: '92vh', overflowY: 'auto' }}>
                <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 10 }}>
                    <div>
                        <h3>📷 {stepLabel || 'Add Prescription'}</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{patientName}</p>
                    </div>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label className="form-label">Doctor for this prescription *</label>
                        <select className="form-input" value={form.doctorId} onChange={e => setF('doctorId', e.target.value)} required>
                            <option value="">— Select Doctor —</option>
                            {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.specialization || 'General'})</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
                        <div className="form-group">
                            <label className="form-label">Department</label>
                            <input className="form-input" value={form.department} onChange={e => setF('department', e.target.value)} placeholder="Orthopedics" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Ward / Unit</label>
                            <input className="form-input" value={form.ward} onChange={e => setF('ward', e.target.value)} placeholder="OPD / Surgical Ward A" />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, marginBottom: '1.2rem' }}>
                        <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                            onClick={() => { fileInputRef.current.removeAttribute('capture'); fileInputRef.current.click(); }}>📁 Upload Prescription Image</button>
                        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                    </div>
                    {imagePreview && (
                        <div style={{ display: 'flex', gap: 12, marginBottom: '1.2rem', alignItems: 'flex-start' }}>
                            <img src={imagePreview} alt="Prescription" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                {ocrStatus === 'reading' && <div style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 600 }}>🔍 Reading...</div>}
                                {ocrStatus === 'done' && (
                                    <textarea className="form-input" rows={5} style={{ fontSize: '0.82rem', resize: 'vertical' }}
                                        value={editedText} onChange={e => setEditedText(e.target.value)} placeholder="OCR text — edit if needed..." />
                                )}
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSave}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', marginBottom: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, display: 'block', marginBottom: 4 }}>Prescription Date</label>
                                <input className="form-input" type="date" style={inputSm} value={form.prescriptionDate} onChange={e => setF('prescriptionDate', e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, display: 'block', marginBottom: 4 }}>Document Type</label>
                                <select className="form-input" style={inputSm} value={form.documentType} onChange={e => setF('documentType', e.target.value)}>
                                    <option>Prescription</option><option>Lab Report</option><option>Discharge Summary</option><option>Other</option>
                                </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, display: 'block', marginBottom: 4 }}>Diagnosis / Clinical Notes</label>
                                <textarea className="form-input" style={{ ...inputSm, resize: 'vertical' }} rows={3}
                                    placeholder="e.g. ACL repair — post-op day 3"
                                    value={form.diagnosisNotes} onChange={e => setF('diagnosisNotes', e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, display: 'block', marginBottom: 4 }}>Follow-up Date (optional)</label>
                                <input className="form-input" type="date" style={inputSm} value={form.followUpDate} onChange={e => setF('followUpDate', e.target.value)} />
                            </div>
                        </div>
                        <div style={{ marginBottom: '1.2rem' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, marginBottom: 8 }}>💊 Medications</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1fr auto', gap: '4px 8px', marginBottom: 6 }}>
                                {['Medication', 'Dosage', 'Frequency', 'Duration', ''].map(h => (
                                    <div key={h} style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</div>
                                ))}
                            </div>
                            {medications.map((m, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1fr auto', gap: '4px 8px', marginBottom: 6 }}>
                                    <input className="form-input" style={inputSm} placeholder="Amoxicillin" value={m.name} onChange={e => updateMed(i, 'name', e.target.value)} />
                                    <input className="form-input" style={inputSm} placeholder="500mg" value={m.dosage} onChange={e => updateMed(i, 'dosage', e.target.value)} />
                                    <input className="form-input" style={inputSm} placeholder="Twice daily" value={m.frequency} onChange={e => updateMed(i, 'frequency', e.target.value)} />
                                    <input className="form-input" style={inputSm} placeholder="7 days" value={m.duration} onChange={e => updateMed(i, 'duration', e.target.value)} />
                                    <button type="button" onClick={() => removeMed(i)} style={{ background: 'var(--danger-light)', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--danger)', fontWeight: 700, padding: '4px 8px' }}>✕</button>
                                </div>
                            ))}
                            <button type="button" className="btn btn-sm btn-outline" onClick={addMed} style={{ marginTop: 4 }}>+ Add Medication</button>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button className="btn btn-accent" type="submit" disabled={saving} style={{ flex: 1, padding: '12px', fontWeight: 700 }}>
                                {saving ? 'Saving...' : '💾 Save Prescription'}
                            </button>
                            <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>Skip / Close</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>,
        document.body
    );
}

/* ─── Patient Detail Drawer (re-visit flow) ─── */
function PatientDetailDrawer({ patient, doctors, onClose }) {
    const [prescriptions, setPrescriptions] = useState([]);
    const [showRx, setShowRx] = useState(false);
    const doctorMap = Object.fromEntries(doctors.map(d => [d.id, d]));

    useEffect(() => {
        if (!patient) return;
        const q = query(collection(db, 'prescriptions'), where('patientId', '==', patient.id));
        return onSnapshot(q, snap => {
            setPrescriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
        });
    }, [patient]);

    if (!patient) return null;

    return createPortal(
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 580, maxHeight: '92vh', overflowY: 'auto' }}>
                <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 10 }}>
                    <div>
                        <h3>👤 {patient.name}</h3>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                            {patient.age && `Age ${patient.age} · `}{patient.gender} · {patient.condition || patient.diagnosis || '—'}
                        </p>
                    </div>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {/* Patient info */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.2rem' }}>
                        {[
                            ['Email', patient.email],
                            ['Phone', patient.phone],
                            ['Risk Level', <span style={{ textTransform: 'capitalize', fontWeight: 700, color: RISK_COLORS[patient.risk] || RISK_COLORS[patient.riskLevel] || '#999' }}>{patient.risk || patient.riskLevel || '—'}</span>],
                            ['Admission', patient.admissionDate || '—'],
                            ['Primary Doctor', patient.assignedDoctorId ? doctorMap[patient.assignedDoctorId]?.name || '—' : 'Unassigned'],
                        ].map(([k, v]) => (
                            <div key={k}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.6, marginBottom: 2 }}>{k}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 500 }}>{v || '—'}</div>
                            </div>
                        ))}
                    </div>

                    {/* New visit / prescription button */}
                    <button className="btn btn-accent btn-full" onClick={() => setShowRx(true)} style={{ marginBottom: '1.2rem', fontWeight: 700 }}>
                        ➕ Add New Visit / Prescription
                    </button>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', marginTop: -8 }}>
                        You can assign a different doctor for each new visit.
                    </p>

                    {/* Prescription history */}
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--primary)', marginBottom: 8 }}>
                        📋 Visit & Prescription History ({prescriptions.length})
                    </div>
                    {prescriptions.length === 0 && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: '1rem 0' }}>No prescriptions yet</div>
                    )}
                    {prescriptions.map(rx => (
                        <div key={rx.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)' }}>
                                    {rx.documentType || 'Prescription'}
                                </div>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{rx.prescriptionDate}</span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                                Dr. {doctorMap[rx.doctorId]?.name || rx.doctorName || '—'}
                            </div>
                            {rx.diagnosisNotes && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{rx.diagnosisNotes}</div>
                            )}
                            {rx.medications?.length > 0 && (
                                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {rx.medications.map((m, i) => (
                                        <span key={i} style={{ fontSize: '0.7rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 99, padding: '2px 8px', color: 'var(--accent)', fontWeight: 600 }}>
                                            💊 {m.name} {m.dosage}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            {showRx && (
                <PrescriptionModal
                    patientId={patient.id}
                    patientName={patient.name}
                    assignedDoctorId={patient.assignedDoctorId}
                    doctors={doctors}
                    onClose={() => setShowRx(false)}
                    onDone={() => { setShowRx(false); toast.success('Prescription saved!'); }}
                    stepLabel="New Visit / Prescription"
                />
            )}
        </div>,
        document.body
    );
}

/* ─── Step 1: Register Patient ─── */
function AddPatientModal({ doctors, onClose, onRegistered }) {
    const { adminCreateUser } = useAuth();
    const [form, setForm] = useState({
        name: '', age: '', gender: 'Male', email: '', phone: '',
        condition: '', admissionDate: '', riskLevel: 'medium',
        assignedDoctorId: '', password: '', confirm: '',
    });
    const [showPw, setShowPw] = useState(false);
    const [saving, setSaving] = useState(false);
    function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

    async function handleSubmit(e) {
        e.preventDefault();
        if (form.password !== form.confirm) { toast.error('Passwords do not match.'); return; }
        if (form.password.length < 6) { toast.error('Password must be at least 6 characters.'); return; }
        setSaving(true);
        try {
            const { uid } = await adminCreateUser(form.email, form.password, {
                name: form.name, role: 'patient',
                age: form.age, gender: form.gender, phone: form.phone,
                condition: form.condition, admissionDate: form.admissionDate,
                riskLevel: form.riskLevel, assignedDoctorId: form.assignedDoctorId || null,
            });
            toast.success(`Patient ${form.name} registered!`);
            onRegistered({ uid, ...form });
        } catch (err) {
            toast.error(err.message || 'Failed to register patient.');
        } finally {
            setSaving(false);
        }
    }

    return createPortal(
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 540, maxHeight: '92vh', overflowY: 'auto' }}>
                <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 10 }}>
                    <div>
                        <h3>➕ Add Patient — Step 1 of 2</h3>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Registration details</p>
                    </div>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    <form onSubmit={handleSubmit} autoComplete="off">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Field label="Full Name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Sneha Rao" />
                            <Field label="Age" value={form.age} onChange={e => set('age', e.target.value)} type="number" placeholder="34" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Gender *</label>
                            <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
                                <option>Male</option><option>Female</option><option>Other</option>
                            </select>
                        </div>
                        <Field label="Email Address" value={form.email} onChange={e => set('email', e.target.value)} type="email" placeholder="sneha@example.com" />
                        <Field label="Phone" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98xxx xxxxx" required={false} />
                        <Field label="Condition / Reason for Visit" value={form.condition} onChange={e => set('condition', e.target.value)} placeholder="Post Knee Replacement" />
                        <Field label="Date of Admission" value={form.admissionDate} onChange={e => set('admissionDate', e.target.value)} type="date" />
                        <div className="form-group">
                            <label className="form-label">Risk Level *</label>
                            <select className="form-input" value={form.riskLevel} onChange={e => set('riskLevel', e.target.value)}>
                                <option value="critical">Critical</option><option value="high">High</option>
                                <option value="medium">Medium</option><option value="low">Low</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Assign Primary Doctor (optional)</label>
                            <select className="form-input" value={form.assignedDoctorId} onChange={e => set('assignedDoctorId', e.target.value)}>
                                <option value="">— Unassigned —</option>
                                {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.specialization || 'General'})</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Password *</label>
                            <div style={{ position: 'relative' }}>
                                <input className="form-input" type={showPw ? 'text' : 'password'}
                                    placeholder="Min 6 characters" value={form.password}
                                    onChange={e => set('password', e.target.value)} required />
                                <button type="button" onClick={() => setShowPw(v => !v)}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                    {showPw ? '🙈' : '👁'}
                                </button>
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Confirm Password *</label>
                            <input className="form-input" type="password" value={form.confirm}
                                onChange={e => set('confirm', e.target.value)} required />
                        </div>
                        <button className="btn btn-accent btn-full" type="submit" disabled={saving} style={{ marginTop: 8 }}>
                            {saving ? 'Registering...' : '→ Register & Add Prescription'}
                        </button>
                    </form>
                </div>
            </div>
        </div>,
        document.body
    );
}

/* ─── Credentials after registration ─── */
function CredentialsModal({ patient, onClose }) {
    return createPortal(
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 420 }}>
                <div className="modal-header"><h3>✅ Patient Registered</h3><button className="modal-close" onClick={onClose}>✕</button></div>
                <div className="modal-body">
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        Share these login credentials with <strong>{patient.name}</strong>:
                    </p>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontFamily: 'monospace', fontSize: '0.88rem' }}>
                        <div><strong>Email:</strong> {patient.email}</div>
                        <div><strong>Password:</strong> {patient.password}</div>
                    </div>
                    <button className="btn btn-accent btn-full" onClick={onClose} style={{ marginTop: '1rem' }}>Got it</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

/* ─── Main AdminPatients page ─── */
export default function AdminPatients() {
    const [patients, setPatients] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [doctorMap, setDoctorMap] = useState({});
    const [search, setSearch] = useState('');

    const [showAdd, setShowAdd] = useState(false);
    const [registeredPatient, setRegisteredPatient] = useState(null);
    const [createdPatient, setCreatedPatient] = useState(null);
    const [selectedPatient, setSelectedPatient] = useState(null); // for re-visit drawer

    useEffect(() => {
        const pq = query(collection(db, 'patients'));
        const dq = query(collection(db, 'users'), where('role', '==', 'doctor'));
        const unsub1 = onSnapshot(pq, snap => {
            setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
        });
        const unsub2 = onSnapshot(dq, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setDoctors(list);
            setDoctorMap(Object.fromEntries(list.map(d => [d.id, d.name])));
        });
        return () => { unsub1(); unsub2(); };
    }, []);

    function handleRegistered(patient) { setShowAdd(false); setRegisteredPatient(patient); }
    function handlePrescriptionClose() { setCreatedPatient(registeredPatient); setRegisteredPatient(null); }
    function handlePrescriptionDone() { setCreatedPatient(registeredPatient); setRegisteredPatient(null); }

    const filtered = patients.filter(p => {
        const q = search.toLowerCase();
        return !q || p.name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.condition?.toLowerCase().includes(q) || p.diagnosis?.toLowerCase().includes(q);
    });

    return (
        <AdminLayout>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>Patients</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '0.85rem' }}>{patients.length} registered · click a row to view / add visit</p>
                </div>
                <button className="btn btn-accent" onClick={() => setShowAdd(true)}>+ Add Patient</button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '1.2rem', maxWidth: 400 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
                <input className="form-input" style={{ paddingLeft: 36 }}
                    type="text" placeholder="Search patients by name, email, condition..."
                    value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            <div className="card">
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg)' }}>
                                {['Name', 'Email', 'Age / Gender', 'Condition', 'Assigned Doctor', 'Risk', 'Admitted'].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    {search ? 'No patients match your search.' : 'No patients registered yet.'}
                                </td></tr>
                            )}
                            {filtered.map(p => (
                                <tr key={p.id}
                                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                                    onClick={() => setSelectedPatient(p)}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                                    <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--primary)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div className="avatar-circle" style={{ width: 30, height: 30, fontSize: '0.68rem', flexShrink: 0, background: RISK_COLORS[p.risk] || RISK_COLORS[p.riskLevel] || 'var(--primary)' }}>
                                                {(p.name || 'P').split(' ').map(w => w[0]).slice(0, 2).join('')}
                                            </div>
                                            <span style={{ color: 'var(--accent)', textDecoration: 'none' }}>{p.name}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{p.email || '—'}</td>
                                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{p.age || '—'} / {p.gender || '—'}</td>
                                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{p.condition || p.diagnosis || '—'}</td>
                                    <td style={{ padding: '12px 14px' }}>
                                        {p.assignedDoctorId && doctorMap[p.assignedDoctorId]
                                            ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{doctorMap[p.assignedDoctorId]}</span>
                                            : <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Unassigned</span>}
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: (RISK_COLORS[p.risk] || RISK_COLORS[p.riskLevel] || '#999') + '22', color: RISK_COLORS[p.risk] || RISK_COLORS[p.riskLevel] || '#999', textTransform: 'capitalize' }}>
                                            {p.risk || p.riskLevel || 'medium'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                        {p.createdAt?.toDate?.().toLocaleDateString('en-IN') || p.admissionDate || '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Patient Detail Drawer (re-visit / prescription) */}
            {selectedPatient && (
                <PatientDetailDrawer
                    patient={selectedPatient}
                    doctors={doctors}
                    onClose={() => setSelectedPatient(null)}
                />
            )}

            {/* New patient flow */}
            {showAdd && <AddPatientModal doctors={doctors} onClose={() => setShowAdd(false)} onRegistered={handleRegistered} />}
            {registeredPatient && (
                <PrescriptionModal
                    patientId={registeredPatient.uid}
                    patientName={registeredPatient.name}
                    assignedDoctorId={registeredPatient.assignedDoctorId}
                    doctors={doctors}
                    onClose={handlePrescriptionClose}
                    onDone={handlePrescriptionDone}
                    stepLabel="Add Prescription — Step 2 of 2"
                />
            )}
            {createdPatient && <CredentialsModal patient={createdPatient} onClose={() => setCreatedPatient(null)} />}
        </AdminLayout>
    );
}
