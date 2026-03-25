import { useState, useCallback, useRef } from 'react';
import { useMFA } from '@/hooks/useMFA';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

/**
 * ADR-008: Step-up Authentication for Critical Actions
 * 
 * Requires MFA re-verification before executing sensitive operations.
 * Implements a time window (default 5 min) during which repeated
 * step-up is not required.
 * 
 * Usage:
 *   const { executeWithStepUp, needsVerification, StepUpDialog } = useStepUpAuth();
 *   
 *   const handleCriticalAction = () => {
 *     executeWithStepUp(async () => {
 *       // your critical action here
 *     });
 *   };
 */

interface StepUpOptions {
  /** Time window in ms where re-verification is skipped (default: 5 min) */
  windowMs?: number;
  /** Reason shown to user */
  reason?: string;
}

const DEFAULT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export const useStepUpAuth = (options?: StepUpOptions) => {
  const { hasMFA } = useMFA();
  const { user } = useAuth();
  const [needsVerification, setNeedsVerification] = useState(false);
  const lastVerifiedAt = useRef<number>(0);
  const pendingAction = useRef<(() => Promise<void>) | null>(null);
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const reason = options?.reason ?? 'Esta ação requer confirmação de segurança adicional.';

  const isWithinWindow = useCallback(() => {
    if (lastVerifiedAt.current === 0) return false;
    return Date.now() - lastVerifiedAt.current < windowMs;
  }, [windowMs]);

  /**
   * Execute an action that requires step-up authentication.
   * If user has MFA and is outside the verification window, shows MFA dialog.
   * If user has no MFA, executes directly (MFA enforcement is handled elsewhere).
   */
  const executeWithStepUp = useCallback(async (action: () => Promise<void>) => {
    if (!user) {
      logger.warn('useStepUpAuth: No user, cannot execute');
      return;
    }

    // If no MFA configured, execute directly
    // (MFA enforcement for admins is handled by AdminMFAGuard)
    if (!hasMFA) {
      logger.debug('useStepUpAuth: No MFA configured, executing directly');
      await action();
      return;
    }

    // If within verification window, execute directly
    if (isWithinWindow()) {
      logger.debug('useStepUpAuth: Within verification window, executing directly');
      await action();
      return;
    }

    // Require MFA verification
    logger.info('useStepUpAuth: Requiring step-up verification');
    pendingAction.current = action;
    setNeedsVerification(true);
  }, [user, hasMFA, isWithinWindow]);

  const onVerificationSuccess = useCallback(async () => {
    lastVerifiedAt.current = Date.now();
    setNeedsVerification(false);

    if (pendingAction.current) {
      try {
        await pendingAction.current();
      } catch (err) {
        logger.error('useStepUpAuth: Action failed after verification', err);
        throw err;
      } finally {
        pendingAction.current = null;
      }
    }
  }, []);

  const onVerificationCancel = useCallback(() => {
    setNeedsVerification(false);
    pendingAction.current = null;
    logger.debug('useStepUpAuth: Verification cancelled');
  }, []);

  return {
    executeWithStepUp,
    needsVerification,
    reason,
    onVerificationSuccess,
    onVerificationCancel,
  };
};
