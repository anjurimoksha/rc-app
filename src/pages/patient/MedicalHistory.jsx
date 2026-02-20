import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';

export default function PatientMedHistory() {
    const { currentUser } = useAuth();
    const [visits, setVisits] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) return;
        async function fetchVisits() {
            const q = query(
                collection(db, 'medicalVisits'),
                where('patientId', '==', currentUser.uid),
                orderBy('visitDate', 'desc')
            );
            const snap = await getDocs(q);
            setVisits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }
        fetchVisits();
    }, [currentUser]);

    if (loading) return <div className="spinner">Loading medical history...</div>;

    return (
        <>
            <Navbar portalType="patient" />
            <div className="page">
                <div className="page-header">
                    <h1>📁 Medical History</h1>
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
                    <div key={v.id} className="card" style={{ marginBottom: '1rem' }}>
                        <div className="card-body">
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--primary)' }}>{v.hospital}</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                        📅 {v.visitDate} · {v.department} · {v.doctorName}
                                    </div>
                                    <div style={{ marginTop: 8, fontSize: '0.87rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        <strong>Diagnosis:</strong> {v.diagnosis}
                                    </div>
                                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {v.tags?.map(t => <span key={t} className="badge badge-primary">{t}</span>)}
                                    </div>
                                </div>
                            </div>

                            <details style={{ marginTop: '1rem' }}>
                                <summary style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>
                                    Medications ({v.medications?.length || 0})
                                </summary>
                                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {v.medications?.map((m, i) => (
                                        <div key={i} style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.87rem' }}>{m.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{m.dosage}</span></div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.frequency} · {m.duration}</div>
                                            </div>
                                            <span className={`badge ${m.status === 'active' ? 'badge-success' : 'badge-gray'}`}>{m.status}</span>
                                        </div>
                                    ))}
                                </div>
                            </details>

                            <details style={{ marginTop: '6px' }}>
                                <summary style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>Doctor's Notes</summary>
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6, padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)' }}>
                                    {v.doctorNotes}
                                </div>
                            </details>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}
