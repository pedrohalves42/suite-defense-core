import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

/**
 * ADR-026 P1.2: Session Timeout Hook
 * Implements automatic session timeout based on user role:
 * - super_admin: 15 minutes
 * - admin: 60 minutes  
 * - user: 480 minutes (8 hours)
 */
export const useSessionTimeout = () => {
  const { user } = useAuth();
  const lastActivityRef = useRef(Date.now());
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const warningShownRef = useRef(false);
  const isSuperAdminRef = useRef(false);
  const serverCheckCountRef = useRef(0); // V-706: counter for server-side checks

  // Get timeout based on user role from app_metadata
  const getTimeoutMinutes = useCallback(() => {
    if (!user) return 480;
    
    const appMetadata = user.app_metadata || {};
    const isSuperAdmin = appMetadata.is_super_admin === true;
    isSuperAdminRef.current = isSuperAdmin;
    
    // Check tenants for admin role
    const tenants = appMetadata.tenants || [];
    const activeTenantId = appMetadata.active_tenant_id;
    const activeTenant = tenants.find((t: { id: string }) => t.id === activeTenantId);
    const role = activeTenant?.role || 'user';
    
    if (isSuperAdmin) return 60;      // was 15 → now 1 hour
    if (role === 'admin') return 480;   // was 60 → now 8 hours
    return 720;                         // was 480 → now 12 hours
  }, [user]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
  }, []);

  const checkTimeout = useCallback(async () => {
    if (!user) return;
    
    const timeoutMs = getTimeoutMinutes() * 60 * 1000;
    const elapsed = Date.now() - lastActivityRef.current;

    // V-706 FIX: Server-side session validation every 5 checks (~2.5 min)
    serverCheckCountRef.current += 1;
    if (serverCheckCountRef.current >= 5) {
      serverCheckCountRef.current = 0;
      try {
        const { data: session } = await supabase
          .from('active_sessions')
          .select('expires_at')
          .eq('user_id', user.id)
          .gt('expires_at', new Date().toISOString())
          .limit(1)
          .maybeSingle();
        
        if (!session) {
          logger.info('[SessionTimeout] Server-side session expired or not found');
          toast.warning('Sessão expirada pelo servidor', {
            description: 'Você será redirecionado para a tela de login.',
            duration: 5000
          });
          setTimeout(async () => { await supabase.auth.signOut(); }, 1500);
          return;
        }
      } catch (err) {
        // Non-blocking: if server check fails, fall through to client-side check
        logger.warn('[SessionTimeout] Server session check failed', err);
      }
    }

    // Client-side check (defense in depth)
    if (elapsed >= timeoutMs) {
      logger.info('[SessionTimeout] Session expired due to inactivity', { 
        role: isSuperAdminRef.current ? 'super_admin' : 'user',
        elapsed: Math.round(elapsed / 1000),
        timeoutMinutes: getTimeoutMinutes()
      });
      
      toast.warning('Sessão expirada por inatividade', {
        description: 'Você será redirecionado para a tela de login.',
        duration: 5000
      });
      
      setTimeout(async () => {
        await supabase.auth.signOut();
      }, 1500);
      return;
    }

    // Warning 5 minutes before expiration
    const remainingMs = timeoutMs - elapsed;
    if (remainingMs <= 300000 && !warningShownRef.current) {
      warningShownRef.current = true;
      toast.info('Sua sessão expirará em 5 minutos', {
        description: 'Mova o mouse ou pressione uma tecla para estender.',
        duration: 15000
      });
    }

    // Proactively refresh Supabase token to prevent JWT expiry
    if (remainingMs > 0) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.expires_at) {
          const tokenRemaining = session.expires_at - Math.floor(Date.now() / 1000);
          if (tokenRemaining < 600) {
            await supabase.auth.refreshSession();
            logger.debug('[SessionTimeout] Token refreshed proactively');
          }
        }
      } catch {
        // Non-blocking
      }
    }
  }, [user, getTimeoutMinutes]);




  useEffect(() => {
    if (!user) return;

    logger.debug('[SessionTimeout] Initializing session timeout', {
      timeoutMinutes: getTimeoutMinutes(),
      userId: user.id
    });

    // Activity event listeners
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    
    // Debounce activity reset to avoid excessive updates
    let activityDebounce: ReturnType<typeof setTimeout>;
    const handleActivity = () => {
      clearTimeout(activityDebounce);
      activityDebounce = setTimeout(resetTimer, 1000);
    };

    events.forEach(event => 
      document.addEventListener(event, handleActivity, { passive: true })
    );

    // Check timeout every 30 seconds
    timeoutRef.current = setInterval(checkTimeout, 30000);

    // Initial activity timestamp
    resetTimer();

    return () => {
      events.forEach(event => 
        document.removeEventListener(event, handleActivity)
      );
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
      }
      clearTimeout(activityDebounce);
    };
  }, [user, resetTimer, checkTimeout, getTimeoutMinutes]);

  return { 
    resetTimer,
    getTimeoutMinutes,
    getRemainingTime: () => {
      const timeoutMs = getTimeoutMinutes() * 60 * 1000;
      const elapsed = Date.now() - lastActivityRef.current;
      return Math.max(0, timeoutMs - elapsed);
    }
  };
};
