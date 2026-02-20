import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
    const [role, setRole] = useState('patient');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    function fillDemo() {
        if (role === 'patient') { setEmail('patient@demo.com'); setPassword('Patient@123'); }
        else { setEmail('doctor@demo.com'); setPassword('Doctor@123'); }
    }

    async function handleLogin(e) {
        e.preventDefault();
        setLoading(true);
        try {
            const { role: userRole } = await login(email, password);
            toast.success('Login successful!');
            navigate(userRole === 'patient' ? '/patient/dashboard' : '/doctor/patients');
        } catch (err) {
            toast.error('Invalid credentials. Try the demo login below.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🩺</div>
                    <h1>Recovery Companion</h1>
                    <p>Your post-operative care platform</p>
                </div>

                <div className="login-body">
                    <div className="role-pills">
                        <div
                            className={`role-pill ${role === 'patient' ? 'active' : ''}`}
                            onClick={() => { setRole('patient'); setEmail(''); setPassword(''); }}
                        >🏥 Patient</div>
                        <div
                            className={`role-pill ${role === 'doctor' ? 'active' : ''}`}
                            onClick={() => { setRole('doctor'); setEmail(''); setPassword(''); }}
                        >👨‍⚕️ Doctor</div>
                    </div>

                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label className="form-label">Email</label>
                            <input
                                className="form-input"
                                type="email"
                                placeholder={role === 'patient' ? 'patient@demo.com' : 'doctor@demo.com'}
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
                            {loading ? 'Logging in...' : `Login as ${role === 'patient' ? 'Patient' : 'Doctor'}`}
                        </button>
                    </form>

                    <div className="demo-hint" onClick={fillDemo}>
                        🚀 <strong>Demo:</strong> Click to auto-fill {role === 'patient' ? 'patient@demo.com / Patient@123' : 'doctor@demo.com / Doctor@123'}
                    </div>
                </div>
            </div>
        </div>
    );
}
