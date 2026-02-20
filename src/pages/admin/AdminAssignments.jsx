import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import AdminLayout from './AdminLayout';
import toast from 'react-hot-toast';

const RISK_COLORS = { critical: 'var(--danger)', high: '#dd6b20', medium: '#d69e2e', low: 'var(--success)' };

export default function AdminAssignments() {
    const [patients, setPatients] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [assigningId, setAssigningId] = useState(null); // patientId being assigned
    const [selectedDoctor, setSelectedDoctor] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const unsub1 = onSnapshot(collection(db, 'patients'), snap =>
            setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const unsub2 = onSnapshot(query(collection(db, 'users'), where('role', '==', 'doctor')), snap =>
            setDoctors(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => { unsub1(); unsub2(); };
    }, []);

    const unassigned = patients.filter(p => !p.assignedDoctorId);
    const doctorMap = Object.fromEntries(doctors.map(d => [d.id, d]));

    async function confirmAssign(patientId, patientName) {
        if (!selectedDoctor) { toast.error('Please select a doctor.'); return; }
        setSaving(true);
        try {
            const docObj = doctorMap[selectedDoctor];
            await updateDoc(doc(db, 'patients', patientId), { assignedDoctorId: selectedDoctor });
            await updateDoc(doc(db, 'users', patientId), { assignedDoctorId: selectedDoctor });
            await addDoc(collection(db, 'notifications', patientId, 'items'), {
                type: 'doctor_response',
                title: '🩺 Doctor Assigned',
                message: `You have been assigned to ${docObj?.name || 'your doctor'}. You can now chat with your doctor.`,
                timestamp: serverTimestamp(), read: false,
            });
            toast.success(`${patientName} assigned to ${docObj?.name}!`);
            setAssigningId(null);
            setSelectedDoctor('');
        } catch (e) { toast.error('Assignment failed.'); console.error(e); }
        setSaving(false);
    }

    return (
        <AdminLayout>
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>Patient Assignments</h1>
                <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '0.85rem' }}>
                    Assign patients to doctors or reassign them
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1.5rem', alignItems: 'start' }}>
                {/* ── Left: Unassigned patients ── */}
                <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--danger)', marginBottom: '0.8rem' }}>
                        ⚠ Unassigned Patients ({unassigned.length})
                    </div>
                    {unassigned.length === 0 && (
                        <div className="card"><div className="card-body" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>All patients are assigned ✓</div></div>
                    )}
                    {unassigned.map(p => (
                        <div key={p.id} className="card" style={{ marginBottom: '0.8rem', border: '1.5px solid var(--danger)' }}>
                            <div className="card-body">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 2 }}>{p.name}</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{p.condition || p.diagnosis || '—'}</div>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99, marginTop: 6, display: 'inline-block', background: (RISK_COLORS[p.risk] || '#999') + '22', color: RISK_COLORS[p.risk] || '#999', textTransform: 'capitalize' }}>
                                            {p.risk || p.riskLevel || 'medium'}
                                        </span>
                                    </div>
                                    <button className="btn btn-accent btn-sm" onClick={() => { setAssigningId(p.id); setSelectedDoctor(''); }}>
                                        Assign
                                    </button>
                                </div>

                                {/* Inline assignment dropdown */}
                                {assigningId === p.id && (
                                    <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                                        <select className="form-input" style={{ marginBottom: 8 }} value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)}>
                                            <option value="">— Select Doctor —</option>
                                            {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.specialization || 'General'})</option>)}
                                        </select>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button className="btn btn-accent btn-sm" onClick={() => confirmAssign(p.id, p.name)} disabled={saving}>
                                                {saving ? '...' : '✓ Confirm'}
                                            </button>
                                            <button className="btn btn-outline btn-sm" onClick={() => setAssigningId(null)}>Cancel</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Right: Doctors with assigned patients ── */}
                <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--primary)', marginBottom: '0.8rem' }}>
                        👨‍⚕️ Doctors & Their Patients
                    </div>
                    {doctors.length === 0 && (
                        <div className="card"><div className="card-body" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No doctors registered yet</div></div>
                    )}
                    {doctors.map(d => {
                        const assigned = patients.filter(p => p.assignedDoctorId === d.id);
                        return (
                            <div key={d.id} className="card" style={{ marginBottom: '0.8rem' }}>
                                <div className="card-body">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: assigned.length ? 10 : 0 }}>
                                        <div className="avatar-circle" style={{ width: 32, height: 32, fontSize: '0.72rem', flexShrink: 0 }}>
                                            {(d.name || 'D').split(' ').map(w => w[0]).slice(0, 2).join('')}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.88rem' }}>{d.name}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{d.specialization || 'General'} · {assigned.length} patient{assigned.length !== 1 ? 's' : ''}</div>
                                        </div>
                                    </div>
                                    {assigned.map(p => (
                                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', marginBottom: 4 }}>
                                            <div>
                                                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--primary)' }}>{p.name}</span>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 6 }}>{p.condition || p.diagnosis || '—'}</span>
                                            </div>
                                            <button className="btn btn-outline btn-sm" style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                                                onClick={() => { setAssigningId(p.id + '_reassign'); setSelectedDoctor(''); }}>
                                                Reassign
                                            </button>
                                            {/* Reassign dropdown */}
                                            {assigningId === p.id + '_reassign' && (
                                                <div style={{ position: 'absolute', zIndex: 50, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10, minWidth: 200, boxShadow: 'var(--shadow)' }}>
                                                    <select className="form-input" style={{ marginBottom: 8, fontSize: '0.8rem' }} value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)}>
                                                        <option value="">— Select Doctor —</option>
                                                        {doctors.filter(doc => doc.id !== d.id).map(doc => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
                                                    </select>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button className="btn btn-accent btn-sm" style={{ fontSize: '0.75rem' }} onClick={() => confirmAssign(p.id, p.name)} disabled={saving}>✓</button>
                                                        <button className="btn btn-outline btn-sm" style={{ fontSize: '0.75rem' }} onClick={() => setAssigningId(null)}>✕</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {assigned.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '6px 0' }}>No patients assigned yet</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </AdminLayout>
    );
}
