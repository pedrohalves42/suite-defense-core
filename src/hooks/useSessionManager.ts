import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';

// SEC: Session ID kept in memory only (useRef), never persisted to localStorage

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
  const userIdRef = useRef<string | null>(null);
  const activityIntervalRef = useRef<ReturnType<typeof setInterval>>();

  // Keep userIdRef in sync to allow cleanup even after logout
  useEffect(() => {
    if (user?.id) {
      userIdRef.current = user.id;
    }
  }, [user?.id]);

  const logSessionStart = useCallback(async () => {
    if (!user) return null;

    try {
      const userAgent = navigator.userAgent;
      const ipAddress = window.location.hostname;

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
        logger.info('[SessionManager] Session started', { sessionId });
      }

      return sessionId;
    } catch (err) {
      logger.error('[SessionManager] Error logging session start', { error: err });
      return null;
    }
  }, [user]);

  const updateActivity = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !user) return;

    try {
      await supabase.rpc('update_session_activity', { 
        _session_id: sessionId 
      });
      logger.debug('[SessionManager] Activity updated', { sessionId });
    } catch (err) {
      logger.debug('[SessionManager] Failed to update activity', { error: err });
    }
  }, [user]);

  const endSession = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const userId = userIdRef.current;
    
    if (sessionId && userId) {
      try {
        // BUG FIX: Use the captured userIdRef instead of auth.getUser()
        // because auth.getUser() returns null if called AFTER signOut(),
        // preventing the session from being deleted in the database.
        await supabase
          .from('active_sessions')
          .delete()
          .eq('id', sessionId)
          .eq('user_id', userId);
          
        logger.info('[SessionManager] Session ended', { sessionId });
      } catch (err) {
        logger.debug('[SessionManager] Failed to end session', { error: err });
      }
    }

    sessionIdRef.current = null;
    // Don't clear userIdRef here as it's used for cleanup
  }, []);

  useEffect(() => {
    if (user) {
      if (sessionIdRef.current) {
        updateActivity();
      } else {
        logSessionStart();
      }
      
      activityIntervalRef.current = setInterval(updateActivity, 5 * 60 * 1000);
      
      const events = ['mousedown', 'keydown'];
      let lastUpdate = Date.now();
      
      const handleActivity = () => {
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
          document.removeEventListener(event, handleActivity, { capture: false })
        );
      };
    } else {
      endSession();
    }
  }, [user, logSessionStart, updateActivity, endSession]);

  return { 
    sessionId: sessionIdRef.current,
    updateActivity,
    endSession
  };
};
