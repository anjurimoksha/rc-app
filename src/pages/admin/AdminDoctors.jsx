import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from './AdminLayout';
import toast from 'react-hot-toast';

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

/* ── Modal rendered via Portal so parent re-renders don't affect it ── */
function AddDoctorModal({ onClose, onSuccess }) {
    const { adminCreateUser } = useAuth();
    const [form, setForm] = useState({ name: '', email: '', specialization: '', phone: '', password: '', confirm: '' });
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
                name: form.name, role: 'doctor',
                specialization: form.specialization, phone: form.phone,
                hospital: 'Apollo Hospitals',
            });
            toast.success(`Dr. ${form.name} registered!`);
            onSuccess({ ...form });
        } catch (err) {
            toast.error(err.message || 'Failed to register doctor.');
        } finally {
            setSaving(false);
        }
    }

    return createPortal(
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 480 }}>
                <div className="modal-header">
                    <h3>➕ Add Doctor</h3>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    <form onSubmit={handleSubmit} autoComplete="off">
                        <Field label="Full Name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Dr. Arjun Mehta" />
                        <Field label="Email Address" value={form.email} onChange={e => set('email', e.target.value)} type="email" placeholder="arjun@hospital.com" />
                        <Field label="Specialization" value={form.specialization} onChange={e => set('specialization', e.target.value)} placeholder="Orthopedics" />
                        <Field label="Phone" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98xxx xxxxx" required={false} />
                        <div className="form-group">
                            <label className="form-label">Password *</label>
                            <div style={{ position: 'relative' }}>
                                <input className="form-input" type={showPw ? 'text' : 'password'}
                                    placeholder="Min 6 characters" value={form.password}
                                    onChange={e => set('password', e.target.value)} required />
                                <button type="button" onClick={() => setShowPw(v => !v)}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>
                                    {showPw ? '🙈' : '👁'}
                                </button>
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Confirm Password *</label>
                            <input className="form-input" type="password" placeholder="Repeat password"
                                value={form.confirm} onChange={e => set('confirm', e.target.value)} required />
                        </div>
                        <button className="btn btn-accent btn-full" type="submit" disabled={saving} style={{ marginTop: 8 }}>
                            {saving ? 'Registering...' : '✓ Register Doctor'}
                        </button>
                    </form>
                </div>
            </div>
        </div>,
        document.body
    );
}

function CredentialsModal({ doctor, onClose }) {
    return createPortal(
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 420 }}>
                <div className="modal-header">
                    <h3>✅ Doctor Registered</h3>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        Share these credentials with <strong>{doctor.name}</strong>:
                    </p>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontFamily: 'monospace', fontSize: '0.88rem' }}>
                        <div><strong>Email:</strong> {doctor.email}</div>
                        <div><strong>Password:</strong> {doctor.password}</div>
                    </div>
                    <button className="btn btn-accent btn-full" onClick={onClose} style={{ marginTop: '1rem' }}>Got it</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default function AdminDoctors() {
    const [doctors, setDoctors] = useState([]);
    const [patientCounts, setPatientCounts] = useState({});
    const [showAdd, setShowAdd] = useState(false);
    const [createdDoctor, setCreatedDoctor] = useState(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'users'), where('role', '==', 'doctor'));
        return onSnapshot(q, snap => {
            setDoctors(snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)));
        });
    }, []);

    useEffect(() => {
        if (!doctors.length) return;
        (async () => {
            const counts = {};
            for (const doc of doctors) {
                const snap = await getDocs(query(collection(db, 'patients'), where('assignedDoctorId', '==', doc.id)));
                counts[doc.id] = snap.size;
            }
            setPatientCounts(counts);
        })();
    }, [doctors]);

    function handleSuccess(doctor) {
        setShowAdd(false);
        setCreatedDoctor(doctor);
    }

    const filtered = doctors.filter(d => {
        const q = search.toLowerCase();
        return !q || d.name?.toLowerCase().includes(q) || d.email?.toLowerCase().includes(q) || d.specialization?.toLowerCase().includes(q);
    });

    return (
        <AdminLayout>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>Doctors</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '0.85rem' }}>{doctors.length} registered</p>
                </div>
                <button className="btn btn-accent" onClick={() => setShowAdd(true)}>+ Add Doctor</button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '1.2rem', maxWidth: 400 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
                <input className="form-input" style={{ paddingLeft: 36 }}
                    type="text" placeholder="Search doctors by name, email, specialization..."
                    value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            <div className="card">
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg)' }}>
                                {['Name', 'Email', 'Specialization', 'Patients', 'Date Added'].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    {search ? 'No doctors match your search.' : 'No doctors registered yet.'}
                                </td></tr>
                            )}
                            {filtered.map(doc => (
                                <tr key={doc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--primary)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div className="avatar-circle" style={{ width: 32, height: 32, fontSize: '0.72rem', flexShrink: 0 }}>
                                                {(doc.name || 'D').split(' ').map(w => w[0]).slice(0, 2).join('')}
                                            </div>
                                            {doc.name}
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{doc.email}</td>
                                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{doc.specialization || '—'}</td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <span className="badge badge-primary">{patientCounts[doc.id] ?? '…'} patients</span>
                                    </td>
                                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                        {doc.createdAt?.toDate?.().toLocaleDateString('en-IN') || '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showAdd && <AddDoctorModal onClose={() => setShowAdd(false)} onSuccess={handleSuccess} />}
            {createdDoctor && <CredentialsModal doctor={createdDoctor} onClose={() => setCreatedDoctor(null)} />}
        </AdminLayout>
    );
}
