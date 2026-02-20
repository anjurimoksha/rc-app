import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from './AdminLayout';
import toast from 'react-hot-toast';

const RISK_COLORS = { critical: 'var(--danger)', high: '#dd6b20', medium: '#d69e2e', low: 'var(--success)' };

/* ── Field lives at module scope so React never recreates it ── */
function Field({ label, value, onChange, type = 'text', placeholder = '', required = true }) {
    return (
        <div className="form-group">
            <label className="form-label">{label}{required ? ' *' : ''}</label>
            <input className="form-input" type={type} placeholder={placeholder}
                value={value} onChange={onChange} required={required} />
        </div>
    );
}

/* ── Modal via Portal — completely isolated from parent re-renders ── */
function AddPatientModal({ doctors, onClose, onSuccess }) {
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
            await adminCreateUser(form.email, form.password, {
                name: form.name, role: 'patient',
                age: form.age, gender: form.gender, phone: form.phone,
                condition: form.condition, admissionDate: form.admissionDate,
                riskLevel: form.riskLevel, assignedDoctorId: form.assignedDoctorId || null,
            });
            toast.success(`Patient ${form.name} registered!`);
            onSuccess({ ...form });
        } catch (err) {
            toast.error(err.message || 'Failed to register patient.');
        } finally {
            setSaving(false);
        }
    }

    return createPortal(
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-header">
                    <h3>➕ Add Patient</h3>
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
                            {saving ? 'Registering...' : '✓ Register Patient'}
                        </button>
                    </form>
                </div>
            </div>
        </div>,
        document.body
    );
}

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

export default function AdminPatients() {
    const [patients, setPatients] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [doctorMap, setDoctorMap] = useState({});
    const [showAdd, setShowAdd] = useState(false);
    const [createdPatient, setCreatedPatient] = useState(null);

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

    function handleSuccess(patient) { setShowAdd(false); setCreatedPatient(patient); }

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

            {showAdd && <AddPatientModal doctors={doctors} onClose={() => setShowAdd(false)} onSuccess={handleSuccess} />}
            {createdPatient && <CredentialsModal patient={createdPatient} onClose={() => setCreatedPatient(null)} />}
        </AdminLayout>
    );
}
