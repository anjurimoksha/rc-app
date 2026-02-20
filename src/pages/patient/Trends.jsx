import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    BarChart, Bar, ResponsiveContainer, ReferenceLine,
} from 'recharts';

export default function PatientTrends() {
    const { currentUser } = useAuth();
    const [logs, setLogs] = useState([]);
    const [range, setRange] = useState(14);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(
            collection(db, 'symptomLogs'),
            where('patientId', '==', currentUser.uid),
            orderBy('submittedAt', 'asc')
        );
        return onSnapshot(q, snap => {
            setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [currentUser]);

    const displayLogs = logs.slice(-range);

    const lineData = displayLogs.map((log, i) => {
        const avgSev = log.symptoms?.reduce((a, s) => a + s.severity, 0) / (log.symptoms?.length || 1);
        const score = Math.round(Math.max(0, 100 - avgSev * 10));
        const painSym = log.symptoms?.find(s => s.name === 'Pain');
        return {
            label: log.date || `Day ${i + 1}`,
            'Recovery Score': score,
            Pain: painSym?.severity || 0,
            Fatigue: log.symptoms?.find(s => s.name === 'Fatigue')?.severity || 0,
        };
    });

    // Symptom frequency
    const freqMap = {};
    logs.forEach(log => log.symptoms?.forEach(s => {
        freqMap[s.name] = (freqMap[s.name] || 0) + 1;
    }));
    const freqData = Object.entries(freqMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    return (
        <>
            <Navbar portalType="patient" />
            <div className="page">
                <div className="page-header">
                    <h1>📈 Recovery Trends</h1>
                    <p>Your symptom trends and recovery progress over time</p>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
                    {[7, 14, 30].map(d => (
                        <button key={d} className={`range-btn ${range === d ? 'active' : ''}`} onClick={() => setRange(d)}>
                            {d} Days
                        </button>
                    ))}
                </div>

                {lineData.length === 0 ? (
                    <div className="card">
                        <div className="card-body" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
                            <p>No symptom logs yet. Start logging to see your trends!</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="card" style={{ marginBottom: '1.2rem' }}>
                            <div className="card-body">
                                <div className="section-heading" style={{ marginBottom: '1rem' }}>Recovery Score Over Time</div>
                                <ResponsiveContainer width="100%" height={240}>
                                    <LineChart data={lineData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                                        <Tooltip />
                                        <Legend />
                                        <ReferenceLine y={70} stroke="#e53e3e" strokeDasharray="6 4" label={{ value: 'Alert Threshold', position: 'right', fontSize: 10, fill: '#e53e3e' }} />
                                        <Line type="monotone" dataKey="Recovery Score" stroke="#38a169" strokeWidth={2.5} dot={{ r: 4, fill: '#38a169' }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="card" style={{ marginBottom: '1.2rem' }}>
                            <div className="card-body">
                                <div className="section-heading" style={{ marginBottom: '1rem' }}>Symptom Severity Trend</div>
                                <ResponsiveContainer width="100%" height={220}>
                                    <LineChart data={lineData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                        <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                                        <Tooltip />
                                        <Legend />
                                        <Line type="monotone" dataKey="Pain" stroke="#e53e3e" strokeWidth={2} dot={{ r: 3 }} />
                                        <Line type="monotone" dataKey="Fatigue" stroke="#dd6b20" strokeWidth={2} dot={{ r: 3 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-body">
                                <div className="section-heading" style={{ marginBottom: '1rem' }}>Symptom Frequency</div>
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={freqData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip />
                                        <Bar dataKey="count" fill="#0D7A7A" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
