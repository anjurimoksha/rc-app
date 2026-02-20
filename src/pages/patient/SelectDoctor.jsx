import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';

export default function SelectDoctor() {
    const { currentUser, userData } = useAuth();
    const navigate = useNavigate();
    const [doctor, setDoctor] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAssignedDoctor() {
            try {
                // Get the patient's assigned doctor from their own user doc
                const assignedId = userData?.assignedDoctorId;
                if (!assignedId) {
                    setLoading(false);
                    return;
                }
                const snap = await getDoc(doc(db, 'users', assignedId));
                if (snap.exists()) {
                    setDoctor({ id: snap.id, ...snap.data() });
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchAssignedDoctor();
    }, [userData]);

    return (
        <>
            <Navbar portalType="patient" />
            <div className="page">
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                        📝 Log Symptoms & Chat
                    </h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Log your symptoms or send a message to your assigned doctor</p>
                </div>

                {loading ? (
                    <div className="spinner">Loading...</div>
                ) : !doctor ? (
                    <div className="card">
                        <div className="card-body" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>👨‍⚕️</div>
                            <strong>No doctor assigned yet.</strong>
                            <p style={{ marginTop: 8, fontSize: '0.85rem' }}>
                                Please contact your administrator. Once assigned, your doctor will appear here.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div style={{ maxWidth: 480, margin: '0 auto' }}>
                        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                            <div style={{ height: '4px', background: 'var(--accent)' }}></div>
                            <div className="card-body">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                                    <div className="avatar-circle" style={{ width: 50, height: 50, fontSize: '1rem' }}>
                                        {doctor.name?.split(' ').map(n => n[0]).join('')}
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                                            {doctor.name?.startsWith('Dr') ? doctor.name : `Dr. ${doctor.name}`}
                                        </h3>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 600 }}>
                                            {doctor.specialization || doctor.specialty || 'General Medicine'}
                                        </p>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '20px', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>🏢</span> {doctor.hospital || 'Apollo Hospitals'}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ background: '#e0f2fe', color: '#0277bd', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                                            ✅ Your assigned doctor
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        className="btn btn-primary"
                                        style={{ flex: 1, fontSize: '0.8rem' }}
                                        onClick={() => navigate(`/patient/log/${doctor.id}?tab=log`)}
                                    >
                                        📓 Log Symptoms
                                    </button>
                                    <button
                                        className="btn btn-accent"
                                        style={{ flex: 1, fontSize: '0.8rem' }}
                                        onClick={() => navigate(`/patient/log/${doctor.id}?tab=chat`)}
                                    >
                                        💬 Chat
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
