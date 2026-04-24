import { useAuthContext } from '@/providers/AuthProvider';

/**
 * Hook for consuming authentication state.
 * Refactored to use AuthProvider for global state consistency.
 */
export const useAuth = () => {
  const { user, loading, session, signOut } = useAuthContext();
  return { user, loading, session, signOut };
};
