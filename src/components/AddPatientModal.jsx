import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { secondaryAuth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function AddPatientModal({ onClose, onPatientCreated }) {
    const { currentUser, userData } = useAuth();
    const [step, setStep] = useState('form'); // 'form' | 'loading' | 'success'
    const [error, setError] = useState('');
    const [credentials, setCredentials] = useState(null);
    const [newPatient, setNewPatient] = useState(null);
    const [copied, setCopied] = useState(false);

    const [form, setForm] = useState({
        name: '', age: '', gender: 'Male', email: '',
        phone: '', condition: '', admissionDate: new Date().toISOString().split('T')[0],
        riskLevel: 'medium',
    });

    function update(field, val) { setForm(p => ({ ...p, [field]: val })); }

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setStep('loading');
        const tempPassword = generatePassword();

        try {
            // 1. Create Firebase Auth account using the secondary app (doesn't sign out doctor)
            const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email, tempPassword);
            const uid = cred.user.uid;
            // Sign out the new patient from the secondary app immediately
            await secondaryAuth.signOut();

            // 2. Write to `users`
            await setDoc(doc(db, 'users', uid), {
                uid, email: form.email, name: form.name, role: 'patient',
                hospital: userData?.hospital || 'Apollo Hospitals',
                assignedDoctorId: currentUser.uid,
                createdAt: serverTimestamp(),
            });

            // 3. Write to `patients`
            await setDoc(doc(db, 'patients', uid), {
                uid, name: form.name, email: form.email,
                age: Number(form.age), gender: form.gender,
                phone: form.phone,
                diagnosis: form.condition,
                assignedDoctorId: currentUser.uid,
                assignedDoctorName: userData?.name || '',
                hospital: userData?.hospital || 'Apollo Hospitals',
                risk: form.riskLevel,
                recoveryDay: 0,
                admissionDate: form.admissionDate,
                nextAppt: form.admissionDate,
                lastLog: null, flagged: false,
                initials: form.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
                createdAt: serverTimestamp(),
            });

            // 4. Write initial medical visit
            await addDoc(collection(db, 'medicalVisits'), {
                patientId: uid, doctorId: currentUser.uid,
                doctorName: userData?.name || '',
                hospital: userData?.hospital || 'Apollo Hospitals',
                department: 'General Medicine',
                visitDate: form.admissionDate,
                diagnosis: form.condition,
                ward: 'OPD', duration: '—',
                tags: ['Admission'],
                medications: [], followUpInstructions: [],
                doctorNotes: `Patient admitted on ${form.admissionDate}. Condition: ${form.condition}.`,
                createdAt: serverTimestamp(),
            });

            // 5. Notify doctor
            await addDoc(collection(db, 'notifications', currentUser.uid, 'items'), {
                type: 'patient_registered',
                title: '✅ Patient Registered',
                message: `${form.name} has been successfully registered as your patient.`,
                timestamp: serverTimestamp(), read: false,
            });

            const patientData = { id: uid, name: form.name, email: form.email, assignedDoctorId: currentUser.uid };
            setNewPatient(patientData);
            setCredentials({ email: form.email, password: tempPassword });
            onPatientCreated?.(patientData);
            setStep('success');
        } catch (err) {
            console.error(err);
            setError(err.message || 'Registration failed.');
            setStep('form');
        }
    }

    function copyCredentials() {
        const text = `Email: ${credentials.email}\nPassword: ${credentials.password}`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    const inputStyle = { marginBottom: 0 };
    const labelStyle = { fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 4, display: 'block' };

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 560, width: '95vw' }}>

                {/* Loading */}
                {step === 'loading' && (
                    <div style={{ padding: '3rem', textAlign: 'center' }}>
                        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                        <p style={{ color: 'var(--text-muted)' }}>Creating patient account...</p>
                    </div>
                )}

                {/* Form */}
                {step === 'form' && (
                    <>
                        <div className="modal-header">
                            <div>
                                <h3>➕ Register New Patient</h3>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                    A login account will be created automatically.
                                </p>
                            </div>
                            <button className="modal-close" onClick={onClose}>✕</button>
                        </div>
                        <div className="modal-body">
                            {error && (
                                <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.83rem', marginBottom: '1rem' }}>
                                    {error}
                                </div>
                            )}
                            <form onSubmit={handleSubmit}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label style={labelStyle}>Full Name *</label>
                                        <input className="form-input" style={inputStyle} required placeholder="e.g. Arjun Mehta"
                                            value={form.name} onChange={e => update('name', e.target.value)} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Age *</label>
                                        <input className="form-input" style={inputStyle} type="number" required min="1" max="120"
                                            placeholder="e.g. 42" value={form.age} onChange={e => update('age', e.target.value)} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Gender *</label>
                                        <select className="form-input" style={inputStyle} value={form.gender} onChange={e => update('gender', e.target.value)}>
                                            <option>Male</option><option>Female</option><option>Other</option>
                                        </select>
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label style={labelStyle}>Email Address * (becomes login)</label>
                                        <input className="form-input" style={inputStyle} type="email" required
                                            placeholder="patient@example.com" value={form.email} onChange={e => update('email', e.target.value)} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Phone Number</label>
                                        <input className="form-input" style={inputStyle} placeholder="+91 9876543210"
                                            value={form.phone} onChange={e => update('phone', e.target.value)} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Risk Level</label>
                                        <select className="form-input" style={inputStyle} value={form.riskLevel} onChange={e => update('riskLevel', e.target.value)}>
                                            <option value="low">Low</option><option value="medium">Medium</option>
                                            <option value="high">High</option><option value="critical">Critical</option>
                                        </select>
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label style={labelStyle}>Condition / Reason for Visit *</label>
                                        <input className="form-input" style={inputStyle} required
                                            placeholder="e.g. Post Knee Replacement" value={form.condition} onChange={e => update('condition', e.target.value)} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Date of Admission *</label>
                                        <input className="form-input" style={inputStyle} type="date" required
                                            value={form.admissionDate} onChange={e => update('admissionDate', e.target.value)} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Assigned Doctor</label>
                                        <input className="form-input" style={{ ...inputStyle, background: 'var(--bg)', color: 'var(--text-muted)' }}
                                            value={`Dr. ${userData?.name || 'You'}`} readOnly />
                                    </div>
                                </div>
                                <button className="btn btn-accent btn-full" type="submit" style={{ marginTop: '1.5rem', padding: '14px', fontSize: '1rem', fontWeight: 700 }}>
                                    Register Patient
                                </button>
                            </form>
                        </div>
                    </>
                )}

                {/* Success */}
                {step === 'success' && credentials && (
                    <div style={{ padding: '2rem' }}>
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ fontSize: '3rem', marginBottom: 10 }}>🎉</div>
                            <h3 style={{ color: 'var(--primary)', marginBottom: 6 }}>Patient Registered!</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{form.name} is now in your patient list.</p>
                        </div>

                        <div style={{ background: '#f0f7ff', border: '1.5px solid #c3d5f0', borderRadius: 'var(--radius-sm)', padding: '1rem 1.2rem', marginBottom: '1.2rem' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
                                Share Credentials with Patient
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: 2 }}>
                                <div><span style={{ color: 'var(--text-muted)' }}>Email:</span> <strong>{credentials.email}</strong></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Password:</span> <strong>{credentials.password}</strong></div>
                            </div>
                            <button
                                onClick={copyCredentials}
                                style={{ marginTop: 10, background: copied ? 'var(--success)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}
                            >
                                {copied ? '✓ Copied!' : '📋 Copy Credentials'}
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
                            <button
                                className="btn btn-accent btn-full"
                                style={{ padding: '12px', fontWeight: 700 }}
                                onClick={() => onPatientCreated?.({ ...newPatient, openPrescription: true, onClose })}
                            >
                                📷 Add First Prescription →
                            </button>
                            <button className="btn btn-outline btn-full" onClick={onClose}>Done</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
