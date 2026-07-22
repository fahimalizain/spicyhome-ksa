import { Navigate, Outlet } from 'react-router-dom';
import { isAuthenticated } from '../api';

export function ProtectedRoute() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
