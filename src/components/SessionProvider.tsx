import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { useSessionManager } from '@/hooks/useSessionManager';

/**
 * ADR-026: Session Provider Component
 * Wraps the application to provide session timeout and session tracking
 * This component must be placed inside the auth context
 */
export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  // Initialize session timeout (P1.2)
  useSessionTimeout();
  
  // Initialize session manager (P2.2)
  useSessionManager();
  
  return <>{children}</>;
};
