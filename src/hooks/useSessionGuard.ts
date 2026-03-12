import { useEffect, useState, useCallback } from "react";
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

  const handleExpired = useCallback(() => {
    setSessionValid(false);
    toast.error("Sua sessão expirou. Faça login novamente.", {
      duration: 5000,
      id: "session-expired",
    });
    // Small delay so the toast is visible
    setTimeout(() => navigate("/auth", { replace: true }), 1500);
  }, [navigate]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        if (event === "SIGNED_OUT") {
          handleExpired();
        }
      }
    });

    // Check session periodically (every 60s)
    const interval = setInterval(async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        handleExpired();
      }
    }, 60000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [handleExpired]);

  return { sessionValid };
}
