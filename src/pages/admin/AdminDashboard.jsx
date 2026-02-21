import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import AdminLayout from './AdminLayout';

export default function AdminDashboard() {
    const [stats, setStats] = useState({ doctors: 0, patients: 0, unassigned: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            try {
                const [doctorsSnap, patientsSnap, unassignedSnap] = await Promise.all([
                    getDocs(query(collection(db, 'users'), where('role', '==', 'doctor'))),
                    getDocs(query(collection(db, 'users'), where('role', '==', 'patient'))),
                    getDocs(query(collection(db, 'patients'), where('assignedDoctorId', '==', null))),
                ]);
                setStats({
                    doctors: doctorsSnap.size,
                    patients: patientsSnap.size,
                    unassigned: unassignedSnap.size,
                });
            } catch (e) {
                console.error('Stats fetch failed:', e);
            } finally {
                setLoading(false);
            }
        }
        fetchStats();
    }, []);

    const cards = [
        { label: 'Total Doctors', value: stats.doctors, icon: '👨‍⚕️', color: 'var(--primary)' },
        { label: 'Total Patients', value: stats.patients, icon: '🏥', color: 'var(--accent)' },
        { label: 'Unassigned Patients', value: stats.unassigned, icon: '⚠️', color: '#d69e2e' },
    ];

    return (
        <AdminLayout>
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>Dashboard</h1>
                <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '0.85rem' }}>System overview at a glance</p>
            </div>

            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {cards.map(c => (
                    <div key={c.label} className="card">
                        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 'var(--radius-sm)',
                                background: c.color + '18', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0
                            }}>
                                {c.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: c.color, lineHeight: 1 }}>
                                    {loading ? '—' : c.value}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 3 }}>
                                    {c.label}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick links */}
            <div className="card">
                <div className="card-body">
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--primary)', marginBottom: '1rem' }}>
                        Quick Actions
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <a href="/admin/doctors" className="btn btn-primary btn-sm">👨‍⚕️ Manage Doctors</a>
                        <a href="/admin/patients" className="btn btn-accent btn-sm">🏥 Manage Patients</a>
                        <a href="/admin/assignments" className="btn btn-outline btn-sm" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>🔗 Manage Assignments</a>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
