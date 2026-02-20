import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const NAV = [
    { to: '/admin/dashboard', icon: '📊', label: 'Dashboard' },
    { to: '/admin/doctors', icon: '👨‍⚕️', label: 'Doctors' },
    { to: '/admin/patients', icon: '🏥', label: 'Patients' },
    { to: '/admin/assignments', icon: '🔗', label: 'Assignments' },
];

export default function AdminLayout({ children }) {
    const { userData, logout } = useAuth();
    const navigate = useNavigate();

    async function handleLogout() {
        await logout();
        navigate('/');
    }

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
            {/* ── Sidebar ── */}
            <aside style={{
                width: 220, flexShrink: 0, background: 'var(--primary)',
                display: 'flex', flexDirection: 'column',
                position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 200
            }}>
                {/* Logo */}
                <div style={{ padding: '1.4rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', lineHeight: 1.25 }}>
                        🩺 Recovery Companion
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)', marginTop: 3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        Admin Portal
                    </div>
                </div>

                {/* Nav links */}
                <nav style={{ flex: 1, padding: '1rem 0.6rem' }}>
                    {NAV.map(({ to, icon, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            style={({ isActive }) => ({
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                                marginBottom: 4, fontSize: '0.88rem', fontWeight: 600,
                                color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                                background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                                textDecoration: 'none', transition: 'all 0.15s',
                            })}
                        >
                            <span>{icon}</span>{label}
                        </NavLink>
                    ))}
                </nav>

                {/* Admin info + logout */}
                <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                        Logged in as <strong style={{ color: '#fff' }}>{userData?.name || 'Admin'}</strong>
                    </div>
                    <button
                        onClick={handleLogout}
                        style={{
                            width: '100%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff', borderRadius: 'var(--radius-sm)', padding: '8px 10px',
                            cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                        }}
                    >
                        🚪 Logout
                    </button>
                </div>
            </aside>

            {/* ── Main content area ── */}
            <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                {/* Top bar */}
                <header style={{
                    position: 'sticky', top: 0, zIndex: 100,
                    background: 'var(--card)', borderBottom: '1px solid var(--border)',
                    padding: '0.8rem 1.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.95rem' }}>
                        Recovery Companion — <span style={{ color: 'var(--accent)' }}>Admin Portal</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {userData?.name || 'Admin'}
                        </div>
                        <div className="avatar-circle" style={{ width: 34, height: 34, fontSize: '0.78rem' }}>
                            {(userData?.name || 'A').split(' ').map(w => w[0]).slice(0, 2).join('')}
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <main style={{ padding: '1.8rem', flex: 1 }}>
                    {children}
                </main>
            </div>
        </div>
    );
}
