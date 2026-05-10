import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

/**
 * Hook that monitors auth session and handles expiration gracefully.
 * Shows a toast and redirects to login when session expires.
 */
export function useSessionGuard() {
  const navigate = useNavigate();
  const [sessionValid, setSessionValid] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const handleExpired = useCallback(() => {
    if (isRedirecting || !isMountedRef.current) return;
    
    setIsRedirecting(true);
    setSessionValid(false);
    toast.error("Sua sessão expirou. Faça login novamente.", {
      duration: 5000,
      id: "session-expired",
    });
    // Small delay so the toast is visible
    setTimeout(() => navigate("/login", { replace: true }), 1500);
  }, [navigate, isRedirecting]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Avoid showing "Session Expired" if the user signed out voluntarily
      if (event === "SIGNED_OUT" && sessionValid) {
        // If it was a manual sign out, we don't want to trigger the "Expired" toast
        // This is a common logic bug where manual logout triggers error messages
        setSessionValid(false);
        return;
      }
      
      if (event === "TOKEN_REFRESHED") {
        setSessionValid(true);
      }
    });

    // Check session periodically (every 120s - FinOps optimization)
    const interval = setInterval(async () => {
      if (!isMountedRef.current) return;
      
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        handleExpired();
      }
    }, 120000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [handleExpired]);

  return { sessionValid };
}
