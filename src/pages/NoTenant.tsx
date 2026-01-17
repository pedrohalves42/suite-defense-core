import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, LogOut, RefreshCw, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

/**
 * ADR-026 FIX: NoTenant page for users without associated tenant
 * Displays when authenticated user has no tenant in user_roles table
 */
export default function NoTenant() {
  const navigate = useNavigate();
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
      
      // Redirect to dashboard - ProtectedRoute will re-evaluate
      navigate('/dashboard');
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
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted p-4">
      <Card className="max-w-md w-full shadow-lg">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Building2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Nenhuma Empresa Associada</CardTitle>
          <CardDescription className="text-base">
            Sua conta não está associada a nenhuma empresa no momento.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6 pt-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              Para acessar o sistema, você precisa:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Receber um convite de um administrador</li>
              <li>Aceitar o convite através do link enviado por e-mail</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <Button 
              variant="default" 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full"
            >
              {isRefreshing ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Verificar Novamente
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleLogout}
              className="w-full"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
              <Mail className="w-3 h-3" />
              Não recebeu o convite? Entre em contato com o administrador.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
