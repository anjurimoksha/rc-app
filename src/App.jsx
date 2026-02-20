import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Auth Pages
import Login from './pages/Login';

// Patient Pages
import PatientDashboard from './pages/patient/Dashboard';
import SelectDoctor from './pages/patient/SelectDoctor';
import LogSymptoms from './pages/patient/LogSymptoms';
import PatientMedHistory from './pages/patient/MedicalHistory';
import PatientTrends from './pages/patient/Trends';

// Doctor Pages
import DoctorPatients from './pages/doctor/DoctorPatients';
import DoctorPatientDetail from './pages/doctor/DoctorPatientDetail';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminDoctors from './pages/admin/AdminDoctors';
import AdminPatients from './pages/admin/AdminPatients';
import AdminAssignments from './pages/admin/AdminAssignments';

// Shared
import Footer from './components/Footer';

const ROLE_HOME = {
  patient: '/patient/dashboard',
  doctor: '/doctor/patients',
  admin: '/admin/dashboard',
};

function PrivateRoute({ children, requiredRole }) {
  const { currentUser, userRole } = useAuth();
  if (!currentUser) return <Navigate to="/" replace />;
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
    <Routes>
      <Route
        path="/"
        element={
          currentUser
            ? <Navigate to={ROLE_HOME[userRole] || '/patient/dashboard'} replace />
            : <Login />
        }
      />

      {/* Patient Routes */}
      <Route path="/patient/dashboard" element={<PrivateRoute requiredRole="patient"><PatientLayout><PatientDashboard /></PatientLayout></PrivateRoute>} />
      <Route path="/patient/log" element={<PrivateRoute requiredRole="patient"><PatientLayout><SelectDoctor /></PatientLayout></PrivateRoute>} />
      <Route path="/patient/log/:doctorId" element={<PrivateRoute requiredRole="patient"><PatientLayout><LogSymptoms /></PatientLayout></PrivateRoute>} />
      <Route path="/patient/history" element={<PrivateRoute requiredRole="patient"><PatientLayout><PatientMedHistory /></PatientLayout></PrivateRoute>} />
      <Route path="/patient/trends" element={<PrivateRoute requiredRole="patient"><PatientLayout><PatientTrends /></PatientLayout></PrivateRoute>} />

      {/* Doctor Routes */}
      <Route path="/doctor/patients" element={<PrivateRoute requiredRole="doctor"><DoctorPatients /></PrivateRoute>} />
      <Route path="/doctor/patient/:patientId" element={<PrivateRoute requiredRole="doctor"><DoctorPatientDetail /></PrivateRoute>} />

      {/* Admin Routes */}
      <Route path="/admin/dashboard" element={<PrivateRoute requiredRole="admin"><AdminDashboard /></PrivateRoute>} />
      <Route path="/admin/doctors" element={<PrivateRoute requiredRole="admin"><AdminDoctors /></PrivateRoute>} />
      <Route path="/admin/patients" element={<PrivateRoute requiredRole="admin"><AdminPatients /></PrivateRoute>} />
      <Route path="/admin/assignments" element={<PrivateRoute requiredRole="admin"><AdminAssignments /></PrivateRoute>} />

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
