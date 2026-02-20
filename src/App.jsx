import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Auth Pages
import Login from './pages/Login';

// Patient Pages
import PatientDashboard from './pages/patient/Dashboard';
import LogSymptoms from './pages/patient/LogSymptoms';
import PatientChat from './pages/patient/PatientChat';
import PatientMedHistory from './pages/patient/MedicalHistory';
import PatientTrends from './pages/patient/Trends';

// Doctor Pages
import DoctorPatients from './pages/doctor/DoctorPatients';
import DoctorPatientDetail from './pages/doctor/DoctorPatientDetail';

function PrivateRoute({ children, requiredRole }) {
  const { currentUser, userRole } = useAuth();
  if (!currentUser) return <Navigate to="/" replace />;
  if (requiredRole && userRole !== requiredRole) {
    return <Navigate to={userRole === 'patient' ? '/patient/dashboard' : '/doctor/patients'} replace />;
  }
  return children;
}

function AppRoutes() {
  const { currentUser, userRole } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={
          currentUser
            ? <Navigate to={userRole === 'patient' ? '/patient/dashboard' : '/doctor/patients'} replace />
            : <Login />
        }
      />

      {/* Patient Routes */}
      <Route path="/patient/dashboard" element={<PrivateRoute requiredRole="patient"><PatientDashboard /></PrivateRoute>} />
      <Route path="/patient/log" element={<PrivateRoute requiredRole="patient"><LogSymptoms /></PrivateRoute>} />
      <Route path="/patient/chat" element={<PrivateRoute requiredRole="patient"><PatientChat /></PrivateRoute>} />
      <Route path="/patient/history" element={<PrivateRoute requiredRole="patient"><PatientMedHistory /></PrivateRoute>} />
      <Route path="/patient/trends" element={<PrivateRoute requiredRole="patient"><PatientTrends /></PrivateRoute>} />

      {/* Doctor Routes */}
      <Route path="/doctor/patients" element={<PrivateRoute requiredRole="doctor"><DoctorPatients /></PrivateRoute>} />
      <Route path="/doctor/patient/:patientId" element={<PrivateRoute requiredRole="doctor"><DoctorPatientDetail /></PrivateRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
