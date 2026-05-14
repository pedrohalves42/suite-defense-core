import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, LogOut, RefreshCw, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

/**
 * ADR-026 FIX: NoTenant page for users without associated tenant
 * Displays when authenticated user has no tenant in user_roles table
 */
export default function NoTenant() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Force session refresh to check for new tenant assignments
      const { error } = await supabase.auth.refreshSession();
      if (error) throw error;
      
      // Redirect back - ProtectedRoute will re-evaluate with state persistence
      const destination = location.state?.from?.pathname || '/dashboard';
      navigate(destination, { replace: true });
      toast({
        title: "Sessão atualizada",
        description: "Verificando associação de empresa...",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
      {/* Strategic Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,20%,10%)] via-[hsl(200,18%,12%)] to-[hsl(160,15%,10%)] z-0" />
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.03] z-0" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--primary-foreground)) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      <Card className="w-full max-w-[460px] border border-white/10 bg-[hsl(220,20%,10%)]/60 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10 rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-700 ease-out">
        {/* Magnet Top Border */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cta-positive/50 to-transparent" />
        
        <CardHeader className="text-center space-y-6 pb-2 pt-12">
          <div className="mx-auto w-20 h-20 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center shadow-2xl">
            <Building2 className="w-10 h-10 text-cta-positive" />
          </div>
          <div className="space-y-3">
            <CardTitle className="text-4xl font-extrabold tracking-tight text-white leading-tight px-4 text-balance">
              Protocolo Pendente
            </CardTitle>
            <CardDescription className="text-base text-white/50 font-medium max-w-[320px] leading-relaxed mx-auto">
              Sua conta ainda não foi associada a um ambiente corporativo.
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-10 px-10 pb-12 pt-8">
          <div className="bg-white/[0.03] backdrop-blur-md p-6 rounded-2xl border border-white/5 space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/30 text-center">
              Requisitos de Acesso
            </p>
            <ul className="text-sm text-white/50 space-y-3 font-medium">
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cta-positive mt-1.5 flex-shrink-0" />
                <span>Receber um convite formal de um administrador corporativo.</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cta-positive mt-1.5 flex-shrink-0" />
                <span>Validar seu acesso através do link enviado ao seu e-mail.</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <Button 
              variant="default" 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full h-14 bg-white text-black hover:bg-white/90 font-bold rounded-2xl shadow-[0_10px_25px_rgba(255,255,255,0.1)] transition-all duration-500 text-sm uppercase tracking-[0.1em]"
            >
              {isRefreshing ? (
                <RefreshCw className="w-4 h-4 mr-3 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-3" />
              )}
              Revalidar Credenciais
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleLogout}
              className="w-full h-14 border-white/5 bg-white/[0.02] hover:bg-white/[0.05] text-white/70 font-bold rounded-2xl transition-all duration-500 text-sm uppercase tracking-[0.1em]"
            >
              <LogOut className="w-4 h-4 mr-3" />
              Encerrar Sessão
            </Button>
          </div>

          <div className="pt-8 border-t border-white/5">
            <p className="text-[10px] text-center text-white/20 flex items-center justify-center gap-3 font-medium uppercase tracking-widest leading-relaxed">
              <Mail className="w-3.5 h-3.5 text-cta-positive/50" />
              Suporte Técnico 24/7 disponível para auxílio imediato.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
