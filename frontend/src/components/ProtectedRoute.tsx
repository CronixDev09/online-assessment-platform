import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';

export function ProtectedRoute({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: 'ADMIN' | 'CANDIDATE';
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Restoring session..." />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/candidate/dashboard'} replace />;
  }
  return <>{children}</>;
}
