import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';

const SESSION_ID_KEY = 'cybershield_session_id';

/**
 * ADR-026 P2.2: Session Manager Hook
 * Tracks active sessions for audit purposes:
 * - Logs session start on login
 * - Updates activity every 5 minutes
 * - Cleans up on logout
 */
export const useSessionManager = () => {
  const { user } = useAuth();
  const sessionIdRef = useRef<string | null>(null);
  const activityIntervalRef = useRef<ReturnType<typeof setInterval>>();

  const logSessionStart = useCallback(async () => {
    if (!user) return null;

    try {
      // Get client info
      const userAgent = navigator.userAgent;
      
      // Try to get IP from a simple service (fallback to 'unknown')
      let ipAddress = 'unknown';
      try {
        // In production, IP would come from edge function headers
        ipAddress = window.location.hostname;
      } catch {
        // Ignore IP fetch errors
      }

      const { data: sessionId, error } = await supabase.rpc('log_session_start', {
        _ip_address: ipAddress,
        _user_agent: userAgent
      });

      if (error) {
        logger.warn('[SessionManager] Failed to log session start', { error: error.message });
        return null;
      }

      if (sessionId) {
        sessionIdRef.current = sessionId;
        localStorage.setItem(SESSION_ID_KEY, sessionId);
        logger.info('[SessionManager] Session started', { sessionId });
      }

      return sessionId;
    } catch (err) {
      logger.error('[SessionManager] Error logging session start', { error: err });
      return null;
    }
  }, [user]);

  const updateActivity = useCallback(async () => {
    const sessionId = sessionIdRef.current || localStorage.getItem(SESSION_ID_KEY);
    
    if (!sessionId || !user) return;

    try {
      await supabase.rpc('update_session_activity', { 
        _session_id: sessionId 
      });
      
      logger.debug('[SessionManager] Activity updated', { sessionId });
    } catch (err) {
      // Non-critical error, just log
      logger.debug('[SessionManager] Failed to update activity', { error: err });
    }
  }, [user]);

  const endSession = useCallback(async () => {
    const sessionId = sessionIdRef.current || localStorage.getItem(SESSION_ID_KEY);
    
    if (sessionId) {
      try {
        // Delete session from active_sessions
        await supabase
          .from('active_sessions')
          .delete()
          .eq('id', sessionId);
          
        logger.info('[SessionManager] Session ended', { sessionId });
      } catch (err) {
        logger.debug('[SessionManager] Failed to end session', { error: err });
      }
    }

    sessionIdRef.current = null;
    localStorage.removeItem(SESSION_ID_KEY);
  }, []);

  useEffect(() => {
    if (user) {
      // Check if we already have a session
      const existingSessionId = localStorage.getItem(SESSION_ID_KEY);
      
      if (existingSessionId) {
        sessionIdRef.current = existingSessionId;
        // Update activity for existing session
        updateActivity();
      } else {
        // Start new session
        logSessionStart();
      }
      
      // Update activity every 5 minutes
      activityIntervalRef.current = setInterval(updateActivity, 5 * 60 * 1000);
      
      // Activity listeners for immediate updates on interaction
      const events = ['mousedown', 'keydown'];
      let lastUpdate = Date.now();
      
      const handleActivity = () => {
        // Throttle updates to max once per minute
        if (Date.now() - lastUpdate > 60000) {
          lastUpdate = Date.now();
          updateActivity();
        }
      };
      
      events.forEach(event => 
        document.addEventListener(event, handleActivity, { passive: true })
      );
      
      return () => {
        if (activityIntervalRef.current) {
          clearInterval(activityIntervalRef.current);
        }
        events.forEach(event => 
          document.removeEventListener(event, handleActivity)
        );
      };
    } else {
      // User logged out - end session
      endSession();
    }
  }, [user, logSessionStart, updateActivity, endSession]);

  return { 
    sessionId: sessionIdRef.current,
    updateActivity,
    endSession
  };
};
