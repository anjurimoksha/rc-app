import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const DEMO = {
    patient: { email: 'patient@demo.com', password: 'Patient@123' },
    doctor: { email: 'doctor@demo.com', password: 'Doctor@123' },
    admin: { email: 'admin@demo.com', password: 'Admin@123' },
};

const ROLE_REDIRECT = {
    patient: '/patient/dashboard',
    doctor: '/doctor/patients',
    admin: '/admin/dashboard',
};

export default function Login() {
    const [role, setRole] = useState('patient');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    function fillDemo() {
        setEmail(DEMO[role].email);
        setPassword(DEMO[role].password);
    }

    async function handleLogin(e) {
        e.preventDefault();
        setLoading(true);
        try {
            const { role: userRole } = await login(email, password);
            if (userRole === 'incomplete') {
                toast.error('Account setup incomplete. Please contact your administrator.');
                return;
            }
            toast.success('Login successful!');
            navigate(ROLE_REDIRECT[userRole] || '/');
        } catch (err) {
            toast.error('Invalid credentials. Try the demo login below.');
        } finally {
            setLoading(false);
        }
    }

    const roleLabels = { patient: '🏥 Patient', doctor: '👨‍⚕️ Doctor', admin: '🛡 Admin' };
    const loginLabel = { patient: 'Patient', doctor: 'Doctor', admin: 'Admin' };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🩺</div>
                    <h1>Recovery Companion</h1>
                    <p>Your post-operative care platform</p>
                </div>

                <div className="login-body">
                    {/* Role selector — 3 pills */}
                    <div className="role-pills">
                        {['patient', 'doctor', 'admin'].map(r => (
                            <div
                                key={r}
                                className={`role-pill ${role === r ? 'active' : ''}`}
                                onClick={() => { setRole(r); setEmail(''); setPassword(''); }}
                            >{roleLabels[r]}</div>
                        ))}
                    </div>

                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label className="form-label">Email</label>
                            <input
                                className="form-input"
                                type="email"
                                placeholder={DEMO[role].email}
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <input
                                className="form-input"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <button
                            className="btn btn-accent btn-full"
                            type="submit"
                            disabled={loading}
                            style={{ marginTop: '8px' }}
                        >
                            {loading ? 'Logging in...' : `Login as ${loginLabel[role]}`}
                        </button>
                    </form>

                    <div className="demo-hint" onClick={fillDemo}>
                        🚀 <strong>Demo:</strong> Click to auto-fill {DEMO[role].email} / {DEMO[role].password}
                    </div>
                </div>
            </div>
        </div>
    );
}
