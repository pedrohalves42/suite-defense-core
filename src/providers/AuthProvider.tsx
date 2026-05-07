import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const isInitialized = useRef(false);

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;

    const initializeAuth = async () => {
      if (isInitialized.current) return;
      
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        if (!isMounted) return;

        if (error) {
          logger.error('[AuthProvider] Session fetch error', error);
          
          // Clock skew detection
          if (error.message.includes('issued in the future')) {
            const match = error.message.match(/(\d+)\s+(\d+)\s+(\d+)/);
            let description = 'Detectamos uma diferença significativa entre o relógio do seu computador e o servidor.';
            if (match) {
              const [, , current, now] = match.map(Number);
              const skewMinutes = Math.floor(Math.abs(current - now) / 60);
              description = `Seu relógio está ${skewMinutes} minutos fora de sincronia. Isso impede o login seguro.`;
            }
            toast({
              title: 'Relógio do Sistema Dessincronizado',
              description,
              variant: 'destructive',
              duration: 10000,
            });
          }

          if (retryCount < 2) {
            retryCount++;
            setTimeout(initializeAuth, 1000 * retryCount);
            return;
          }
        }

        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setLoading(false);
        isInitialized.current = true;
      } catch (err) {
        logger.error('[AuthProvider] Unexpected initialization error', err);
        if (isMounted) setLoading(false);
      }
    };

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      logger.debug('[AuthProvider] Auth event', { event, hasSession: !!currentSession });
      
      if (isMounted) {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);
        isInitialized.current = true;
      }
    });

    initializeAuth();

    // Supabase autoRefreshToken handles token refresh automatically.
    // Redundant interval removed to prevent race conditions and unnecessary gateway calls.

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    } catch (error) {
      logger.error('[AuthProvider] Sign out error', error);
    }
  };

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
