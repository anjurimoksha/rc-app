import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import Navbar from '../../components/Navbar';

export default function SelectDoctor() {
    const navigate = useNavigate();
    const [doctors, setDoctors] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchDoctors() {
            try {
                const q = query(collection(db, 'users'), where('role', '==', 'doctor'));
                const snap = await getDocs(q);
                setDoctors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchDoctors();
    }, []);

    return (
        <>
            <Navbar portalType="patient" />
            <div className="page">
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                        📝 Log Symptoms & Chat
                    </h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Select a doctor to log your symptoms or send a message</p>
                </div>

                {loading ? (
                    <div className="spinner">Loading doctors...</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2rem', paddingBottom: '80px' }}>
                        {doctors.map(doc => (
                            <div key={doc.id} className="card" style={{ padding: '0', overflow: 'hidden' }}>
                                <div style={{ height: '4px', background: 'var(--accent)' }}></div>
                                <div className="card-body">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                                        <div className="avatar-circle" style={{ width: 50, height: 50, fontSize: '1rem' }}>
                                            {doc.name?.split(' ').map(n => n[0]).join('')}
                                        </div>
                                        <div>
                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>Dr. {doc.name}</h3>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 600 }}>{doc.specialty || 'General Medicine'}</p>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '20px', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>🏢</span> {doc.hospital || 'Apollo Hospitals, Delhi'}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ opacity: 0.7 }}>🏥</span> <span style={{ background: 'var(--bg)', padding: '2px 8px', borderRadius: '4px' }}>Last visit: 8 February 2026</span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button
                                            className="btn btn-primary"
                                            style={{ flex: 1, fontSize: '0.8rem' }}
                                            onClick={() => navigate(`/patient/log/${doc.id}?tab=log`)}
                                        >
                                            📓 Log Symptoms
                                        </button>
                                        <button
                                            className="btn btn-accent"
                                            style={{ flex: 1, fontSize: '0.8rem' }}
                                            onClick={() => navigate(`/patient/log/${doc.id}?tab=chat`)}
                                        >
                                            💬 Chat
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div >
        </>
    );
}
