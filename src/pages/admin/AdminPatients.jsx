import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
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
            toast.success(`Patient ${form.name} registered! You can now add their prescription.`);
            // Move to step 2 — prescription
            onRegistered({ uid, ...form });
        } catch (err) {
            toast.error(err.message || 'Failed to register patient.');
        } finally {
            setSaving(false);
        }
    }

    const selectedDoctor = doctors.find(d => d.id === form.assignedDoctorId);

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
                                <option value="critical">Critical</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Assign Doctor (optional)</label>
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
                        <button type="button" className="btn btn-outline btn-full" onClick={onClose} style={{ marginTop: 8, fontSize: '0.82rem' }}>
                            Skip Prescription — Register Only
                        </button>
                    </form>
                </div>
            </div>
        </div>,
        document.body
    );
}

/* ─── Step 2: Add Prescription ─── */
function AdminPrescriptionModal({ patientId, patientName, assignedDoctorId, doctors, onClose, onDone }) {
    const fileInputRef = useRef(null);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [ocrStatus, setOcrStatus] = useState(null);
    const [extractedText, setExtractedText] = useState('');
    const [editedText, setEditedText] = useState('');
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        prescriptionDate: new Date().toISOString().split('T')[0],
        diagnosisNotes: '',
        followUpDate: '',
        documentType: 'Prescription',
        doctorId: assignedDoctorId || '',
        department: 'General Medicine',
        ward: 'OPD',
    });
    const [medications, setMedications] = useState([{ ...EMPTY_MED }]);

    function handleImageChange(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        runOCR(file);
    }
    async function runOCR(file) {
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
                patientId, doctorId: form.doctorId,
                doctorName: selectedDoc?.name || '',
                prescriptionDate: form.prescriptionDate, imageUrl,
                extractedText, editedText,
                medications: medications.filter(m => m.name.trim()),
                diagnosisNotes: form.diagnosisNotes,
                documentType: form.documentType,
                followUpDate: form.followUpDate || null,
                createdAt: serverTimestamp(),
            });
            await addDoc(collection(db, 'medicalVisits'), {
                patientId, doctorId: form.doctorId,
                doctorName: selectedDoc?.name || '',
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
            toast.success('Prescription saved to patient record!');
            onDone();
        } catch (err) {
            toast.error('Failed to save prescription: ' + err.message);
        } finally {
            setSaving(false);
        }
    }

    return createPortal(
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 700, width: '96vw', maxHeight: '92vh', overflowY: 'auto' }}>
                <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 10 }}>
                    <div>
                        <h3>📷 Add Prescription — Step 2 of 2</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {patientName} · Upload or take a photo; OCR will extract the text.
                        </p>
                    </div>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {/* Doctor selector (admin can pick which doctor's prescription this is) */}
                    <div className="form-group">
                        <label className="form-label">Doctor for this prescription *</label>
                        <select className="form-input" value={form.doctorId} onChange={e => setForm(p => ({ ...p, doctorId: e.target.value }))}>
                            <option value="">— Select Doctor —</option>
                            {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.specialization || 'General'})</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
                        <div className="form-group">
                            <label className="form-label">Department</label>
                            <input className="form-input" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} placeholder="Orthopedics" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Ward / Unit</label>
                            <input className="form-input" value={form.ward} onChange={e => setForm(p => ({ ...p, ward: e.target.value }))} placeholder="OPD / Surgical Ward A" />
                        </div>
                    </div>

                    {/* Image Upload */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: '1.2rem' }}>
                        <button type="button" className="btn btn-outline"
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                            onClick={() => { fileInputRef.current.removeAttribute('capture'); fileInputRef.current.click(); }}>
                            📁 Upload Image
                        </button>
                        <button type="button" className="btn btn-outline"
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                            onClick={() => { fileInputRef.current.setAttribute('capture', 'environment'); fileInputRef.current.click(); }}>
                            📷 Take Photo
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                    </div>

                    {/* Preview + OCR */}
                    {imagePreview && (
                        <div style={{ display: 'flex', gap: 12, marginBottom: '1.2rem', alignItems: 'flex-start' }}>
                            <img src={imagePreview} alt="Prescription" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                {ocrStatus === 'reading' && <div style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 600 }}>🔍 Reading prescription...</div>}
                                {ocrStatus === 'done' && (
                                    <textarea className="form-input" rows={5} style={{ fontSize: '0.82rem', resize: 'vertical' }}
                                        value={editedText} onChange={e => setEditedText(e.target.value)}
                                        placeholder="OCR extracted text — correct any errors..." />
                                )}
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSave}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', marginBottom: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, display: 'block', marginBottom: 4 }}>Prescription Date</label>
                                <input className="form-input" type="date" style={inputSm} value={form.prescriptionDate} onChange={e => setForm(p => ({ ...p, prescriptionDate: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, display: 'block', marginBottom: 4 }}>Document Type</label>
                                <select className="form-input" style={inputSm} value={form.documentType} onChange={e => setForm(p => ({ ...p, documentType: e.target.value }))}>
                                    <option>Prescription</option><option>Lab Report</option>
                                    <option>Discharge Summary</option><option>Other</option>
                                </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, display: 'block', marginBottom: 4 }}>Diagnosis / Clinical Notes</label>
                                <textarea className="form-input" style={{ ...inputSm, resize: 'vertical' }} rows={3}
                                    placeholder="e.g. Acute Appendicitis — post-surgical recovery"
                                    value={form.diagnosisNotes} onChange={e => setForm(p => ({ ...p, diagnosisNotes: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, display: 'block', marginBottom: 4 }}>Follow-up Date (optional)</label>
                                <input className="form-input" type="date" style={inputSm} value={form.followUpDate} onChange={e => setForm(p => ({ ...p, followUpDate: e.target.value }))} />
                            </div>
                        </div>

                        {/* Medications */}
                        <div style={{ marginBottom: '1.2rem' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, marginBottom: 8 }}>💊 Medication(s)</div>
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
                            <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>
                                Skip for Now
                            </button>
                        </div>
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
                        Share these credentials with <strong>{patient.name}</strong>:
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

    // Flow state: null → showAdd → showPrescription → showCredentials
    const [showAdd, setShowAdd] = useState(false);
    const [registeredPatient, setRegisteredPatient] = useState(null); // after step 1
    const [createdPatient, setCreatedPatient] = useState(null);       // after step 2 (or skip)

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

    // After patient registration → show prescription modal
    function handleRegistered(patient) {
        setShowAdd(false);
        setRegisteredPatient(patient);
    }

    // After prescription saved or skipped → show credentials
    function handlePrescriptionDone() {
        setCreatedPatient(registeredPatient);
        setRegisteredPatient(null);
    }

    // Close from prescription (skip) → show credentials
    function handlePrescriptionClose() {
        setCreatedPatient(registeredPatient);
        setRegisteredPatient(null);
    }

    return (
        <AdminLayout>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>Patients</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '0.85rem' }}>{patients.length} registered</p>
                </div>
                <button className="btn btn-accent" onClick={() => setShowAdd(true)}>+ Add Patient</button>
            </div>

            <div className="card">
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg)' }}>
                                {['Name', 'Email', 'Age / Gender', 'Condition', 'Assigned Doctor', 'Risk', 'Added'].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {patients.length === 0 && (
                                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No patients registered yet</td></tr>
                            )}
                            {patients.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--primary)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div className="avatar-circle" style={{ width: 30, height: 30, fontSize: '0.68rem', flexShrink: 0, background: RISK_COLORS[p.risk] || RISK_COLORS[p.riskLevel] || 'var(--primary)' }}>
                                                {(p.name || 'P').split(' ').map(w => w[0]).slice(0, 2).join('')}
                                            </div>
                                            {p.name}
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

            {/* Step 1 — Registration */}
            {showAdd && (
                <AddPatientModal
                    doctors={doctors}
                    onClose={() => setShowAdd(false)}
                    onRegistered={handleRegistered}
                />
            )}

            {/* Step 2 — Prescription */}
            {registeredPatient && (
                <AdminPrescriptionModal
                    patientId={registeredPatient.uid}
                    patientName={registeredPatient.name}
                    assignedDoctorId={registeredPatient.assignedDoctorId}
                    doctors={doctors}
                    onClose={handlePrescriptionClose}
                    onDone={handlePrescriptionDone}
                />
            )}

            {/* Step 3 — Credentials */}
            {createdPatient && (
                <CredentialsModal patient={createdPatient} onClose={() => setCreatedPatient(null)} />
            )}
        </AdminLayout>
    );
}
