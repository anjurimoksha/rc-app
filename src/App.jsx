import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Footer from './components/Footer';

// ── Lazy-loaded pages (each becomes its own JS chunk) ──────────────────────
const Login = lazy(() => import('./pages/Login'));

const PatientDashboard = lazy(() => import('./pages/patient/Dashboard'));
const SelectDoctor = lazy(() => import('./pages/patient/SelectDoctor'));
const LogSymptoms = lazy(() => import('./pages/patient/LogSymptoms'));
const PatientMedHistory = lazy(() => import('./pages/patient/MedicalHistory'));
const PatientTrends = lazy(() => import('./pages/patient/Trends'));

const DoctorPatients = lazy(() => import('./pages/doctor/DoctorPatients'));
const DoctorPatientDetail = lazy(() => import('./pages/doctor/DoctorPatientDetail'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminDoctors = lazy(() => import('./pages/admin/AdminDoctors'));
const AdminPatients = lazy(() => import('./pages/admin/AdminPatients'));
const AdminAssignments = lazy(() => import('./pages/admin/AdminAssignments'));

// ── Role → home route mapping ───────────────────────────────────────────────
const ROLE_HOME = {
  patient: '/patient/dashboard',
  doctor: '/doctor/patients',
  admin: '/admin/dashboard',
};

// ── Minimal inline page-transition loader ──────────────────────────────────
function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 12, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
      <div className="spinner" style={{ width: 36, height: 36 }} />
      Loading…
    </div>
  );
}

function PrivateRoute({ children, requiredRole }) {
  const { currentUser, userRole } = useAuth();

  // Not logged in → go to login
  if (!currentUser) return <Navigate to="/" replace />;

  // Logged in but role not yet resolved (Firestore fetch in flight or error)
  // Show a spinner instead of redirecting — avoids the redirect loop
  if (!userRole || userRole === 'incomplete') return <PageLoader />;

  // Wrong role → send them to their own home
  if (requiredRole && userRole !== requiredRole) {
    return <Navigate to={ROLE_HOME[userRole] || '/'} replace />;
  }

  return children;
}

function PatientLayout({ children }) {
  return (
    <div className="patient-layout-wrapper">
      {children}
      <Footer />
    </div>
  );
}

function AppRoutes() {
  const { currentUser, userRole } = useAuth();

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route
          path="/"
          element={
            !currentUser
              ? <Login />
              : !userRole || userRole === 'incomplete'
                ? <PageLoader />   // role not known yet — wait, don't loop
                : <Navigate to={ROLE_HOME[userRole]} replace />
          }
        />

        {/* Patient */}
        <Route path="/patient/dashboard" element={<PrivateRoute requiredRole="patient"><PatientLayout><PatientDashboard /></PatientLayout></PrivateRoute>} />
        <Route path="/patient/log" element={<PrivateRoute requiredRole="patient"><PatientLayout><SelectDoctor /></PatientLayout></PrivateRoute>} />
        <Route path="/patient/log/:doctorId" element={<PrivateRoute requiredRole="patient"><PatientLayout><LogSymptoms /></PatientLayout></PrivateRoute>} />
        <Route path="/patient/history" element={<PrivateRoute requiredRole="patient"><PatientLayout><PatientMedHistory /></PatientLayout></PrivateRoute>} />
        <Route path="/patient/trends" element={<PrivateRoute requiredRole="patient"><PatientLayout><PatientTrends /></PatientLayout></PrivateRoute>} />

        {/* Doctor */}
        <Route path="/doctor/patients" element={<PrivateRoute requiredRole="doctor"><DoctorPatients /></PrivateRoute>} />
        <Route path="/doctor/patient/:patientId" element={<PrivateRoute requiredRole="doctor"><DoctorPatientDetail /></PrivateRoute>} />

        {/* Admin */}
        <Route path="/admin/dashboard" element={<PrivateRoute requiredRole="admin"><AdminDashboard /></PrivateRoute>} />
        <Route path="/admin/doctors" element={<PrivateRoute requiredRole="admin"><AdminDoctors /></PrivateRoute>} />
        <Route path="/admin/patients" element={<PrivateRoute requiredRole="admin"><AdminPatients /></PrivateRoute>} />
        <Route path="/admin/assignments" element={<PrivateRoute requiredRole="admin"><AdminAssignments /></PrivateRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
