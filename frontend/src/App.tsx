import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout, CandidateLayout, PublicLayout } from './components/layouts';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

import CandidateDashboard from './pages/candidate/Dashboard';
import Instructions from './pages/candidate/Instructions';
import SystemCheck from './pages/candidate/SystemCheck';
import Attempt from './pages/candidate/Attempt';
import Submitted from './pages/candidate/Submitted';
import CandidateResults from './pages/candidate/Results';
import CandidateResultDetail from './pages/candidate/ResultDetail';
import Submissions from './pages/candidate/Submissions';
import Profile from './pages/candidate/Profile';
import Notifications from './pages/candidate/Notifications';
import CandidateLeaderboard from './pages/candidate/Leaderboard';

import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminUserDetail from './pages/admin/UserDetail';
import AdminTests from './pages/admin/Tests';
import TestEditor from './pages/admin/TestEditor';
import TestDetail from './pages/admin/TestDetail';
import AdminQuestions from './pages/admin/Questions';
import QuestionEditor from './pages/admin/QuestionEditor';
import AdminResults from './pages/admin/Results';
import AdminResultDetail from './pages/admin/ResultDetail';
import AdminLeaderboard from './pages/admin/Leaderboard';
import Monitoring from './pages/admin/Monitoring';
import Violations from './pages/admin/Violations';
import Reports from './pages/admin/Reports';
import Settings from './pages/admin/Settings';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/candidate/dashboard'} replace />;
  return <Landing />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />

      <Route element={<PublicLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>

      {/* Full-screen exam interface (proctored, no app chrome) */}
      <Route
        path="/attempt/:sessionId"
        element={
          <ProtectedRoute role="CANDIDATE">
            <Attempt />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute role="CANDIDATE">
            <CandidateLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/candidate/dashboard" element={<CandidateDashboard />} />
        <Route path="/candidate/tests/:id/instructions" element={<Instructions />} />
        <Route path="/candidate/tests/:id/system-check" element={<SystemCheck />} />
        <Route path="/candidate/tests/:id/submitted" element={<Submitted />} />
        <Route path="/candidate/results" element={<CandidateResults />} />
        <Route path="/candidate/results/:sessionId" element={<CandidateResultDetail />} />
        <Route path="/candidate/submissions" element={<Submissions />} />
        <Route path="/candidate/profile" element={<Profile />} />
        <Route path="/candidate/notifications" element={<Notifications />} />
        <Route path="/candidate/leaderboard/:testId" element={<CandidateLeaderboard />} />
      </Route>

      <Route
        path="/admin"
        element={
          <ProtectedRoute role="ADMIN">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="users/:id" element={<AdminUserDetail />} />
        <Route path="tests" element={<AdminTests />} />
        <Route path="tests/create" element={<TestEditor />} />
        <Route path="tests/:id/edit" element={<TestEditor />} />
        <Route path="tests/:id" element={<TestDetail />} />
        <Route path="questions" element={<AdminQuestions />} />
        <Route path="questions/create" element={<QuestionEditor />} />
        <Route path="questions/:id/edit" element={<QuestionEditor />} />
        <Route path="results" element={<AdminResults />} />
        <Route path="results/:id" element={<AdminResultDetail />} />
        <Route path="leaderboard" element={<AdminLeaderboard />} />
        <Route path="monitoring" element={<Monitoring />} />
        <Route path="violations" element={<Violations />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
