import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasHydrated, setHasHydrated] = useState(false);
  const isInitialized = useRef(false);

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    const abortController = new AbortController();

    const initializeAuth = async (abortController?: AbortController) => {
      if (isInitialized.current) return;
      
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        if (abortController?.signal.aborted) return;
        if (!isMounted) return;

        if (error) {
          logger.error('[AuthProvider] Session fetch error', error);
          
          // Clock skew detection - Critical for JWT validation
          if (error.message.includes('issued in the future') || error.message.includes('future')) {
            toast({
              title: 'Relógio do Sistema Dessincronizado',
              description: 'Detectamos uma diferença entre o relógio do seu computador e o servidor. Isso impede o login seguro. Por favor, ajuste o horário do seu sistema.',
              variant: 'destructive',
              duration: Infinity, // Persistent until reload
            });
            // Stop initialization to prevent loops or weird states
            setLoading(false);
            setHasHydrated(true);
            return;
          }

          if (retryCount < 2) {
            retryCount++;
            setTimeout(() => initializeAuth(abortController), 1000 * retryCount);
            return;
          }
        }

        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setLoading(false);
        setHasHydrated(true);
        isInitialized.current = true;
      } catch (err) {
        logger.error('[AuthProvider] Unexpected initialization error', err);
        if (isMounted) {
          setLoading(false);
          setHasHydrated(true);
        }
      }
    };

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      logger.debug('[AuthProvider] Auth event', { event, hasSession: !!currentSession });
      
      if (!isMounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
      setHasHydrated(true);
      isInitialized.current = true;
      
      // V-FIX: Consistent cache clearing on major auth events to prevent data leakage
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
        setUser(null);
        setSession(null);
      }
      
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setLoading(false);
      }
    });

    initializeAuth(abortController);

    // Supabase autoRefreshToken handles token refresh automatically.
    // Redundant interval removed to prevent race conditions and unnecessary gateway calls.

    return () => {
      isMounted = false;
      abortController.abort();
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      // V-FIX: Clear state explicitly after signOut
      setUser(null);
      setSession(null);
      isInitialized.current = false;
      // V-FIX: Invalidate and clear all queries on logout to prevent stale data leaking
      queryClient.clear();
      // V-FIX: Clear localStorage to remove cached preferences/UI states
      localStorage.clear();
      sessionStorage.clear();
    } catch (error) {
      logger.error('[AuthProvider] Sign out error', error);
    }
  };

  if (!hasHydrated && loading) {
    return null; // Don't even mount the tree until the first session check is done
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
