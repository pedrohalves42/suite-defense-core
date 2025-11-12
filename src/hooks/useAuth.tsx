import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { toast } from '@/hooks/use-toast';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      // Check for clock skew
      if (error?.message?.includes('issued in the future')) {
        // Extract timestamps from error message
        const match = error.message.match(/(\d+)\s+(\d+)\s+(\d+)/);
        if (match) {
          const [_, issued, current, now] = match.map(Number);
          const skewSeconds = Math.abs(current - now);
          
          if (skewSeconds > 60) { // More than 1 minute difference
            toast({
              title: 'Relógio do Sistema Dessincronizado',
              description: `Diferença de ${Math.floor(skewSeconds / 60)} minutos detectada. Sincronize o relógio para evitar problemas de autenticação.`,
              variant: 'destructive',
              duration: 10000,
            });
          }
        }
      }
      
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
};
