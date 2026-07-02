import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.tsx';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { idToken, loading } = useAuth();

  if (loading) return null;
  if (!idToken) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
