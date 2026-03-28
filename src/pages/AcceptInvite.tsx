import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Shield, Loader2, AlertCircle } from 'lucide-react';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { SecurityFooter, BrandSignature } from '@/components/auth/SecurityFooter';
import { TrustIndicators } from '@/components/auth/TrustIndicators';

const passwordSchema = z.string()
  .min(8, 'Senha deve ter pelo menos 8 caracteres')
  .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiuscula')
  .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minuscula')
  .regex(/[0-9]/, 'Senha deve conter pelo menos um numero')
  .regex(/[^A-Za-z0-9]/, 'Senha deve conter pelo menos um caractere especial');

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = searchParams.get('token');

  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  useEffect(() => {
    const fetchInvite = async () => {
      if (!token) {
        toast({ title: 'Token invalido', variant: 'destructive' });
        navigate('/login');
        return;
      }

      try {
        // SECURITY: Use Edge Function to validate invite - never query invites table directly
        // This prevents token exposure to frontend (Phase 3 RLS Hardening)
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          toast({ title: 'Erro ao validar convite', variant: 'destructive' });
          navigate('/login');
          return;
        }

        const data = await response.json();

        if (!data.is_valid) {
          const message = data.error_code === 'EXPIRED' 
            ? 'Convite expirado' 
            : 'Convite nao encontrado ou expirado';
          toast({ title: message, variant: 'destructive' });
          navigate('/login');
          return;
        }

        // Store safe invite data (no token exposed)
        setInvite({
          email: data.email,
          role: data.role,
          expires_at: data.expires_at,
          tenant_name: data.tenant_name,
        });
      } catch (error) {
        logger.error('Error fetching invite', error);
        toast({ title: 'Erro ao carregar convite', variant: 'destructive' });
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchInvite();
  }, [token, navigate, toast]);

  const validatePassword = (value: string) => {
    const result = passwordSchema.safeParse(value);
    if (!result.success) {
      setPasswordErrors(result.error.issues.map(e => e.message));
      return false;
    }
    setPasswordErrors([]);
    return true;
  };

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fullName || !password) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }

    if (!validatePassword(password)) {
      toast({ 
        title: 'Senha nao atende aos requisitos', 
        description: passwordErrors[0],
        variant: 'destructive' 
      });
      return;
    }

    setSubmitting(true);

    try {
      // Create user account
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (signUpError) throw signUpError;

      if (!authData.user) {
        throw new Error('Failed to create user');
      }

      // Accept invite via edge function
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        throw new Error('Failed to accept invite');
      }

      toast({ title: 'Conta criada com sucesso!' });
      navigate('/dashboard');
    } catch (error) {
      logger.error('Error accepting invite', error);
      toast({ 
        title: 'Erro ao criar conta', 
        description: error.message,
        variant: 'destructive' 
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,158,140,0.02),transparent_60%)] pointer-events-none" />
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          <p className="text-sm text-muted-foreground/60">Verificando convite...</p>
        </div>
      </div>
    );
  }

  if (!invite) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Subtle enterprise background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,158,140,0.02),transparent_60%)] pointer-events-none" />
      
      <Card className="w-full max-w-[460px] backdrop-blur-xl bg-card/95 border border-white/[0.06] shadow-[0_0_0_1px_rgba(0,255,200,0.05),0_30px_80px_rgba(0,0,0,0.7)] rounded-[14px] relative z-10">
        <CardHeader className="space-y-1 text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/15 to-accent/15 rounded-full blur-xl" />
              <div className="relative bg-gradient-to-br from-primary/10 to-accent/10 p-3.5 rounded-full backdrop-blur-sm border border-primary/10">
                <Shield className="h-8 w-8 text-primary/80" />
              </div>
            </div>
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight text-foreground/90">
            Ativar Acesso Seguro
          </CardTitle>
          <CardDescription className="text-[13px] text-muted-foreground/70">
            Bem-vindo ao ambiente CyberShield Cloud
          </CardDescription>
          
          <div className="pt-2">
            <TrustIndicators />
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <form onSubmit={handleAccept} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground/80">Email</Label>
              <Input
                id="email"
                type="email"
                value={invite.email}
                disabled
                className="h-10 bg-background/30 border-border/30 text-muted-foreground/70"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role" className="text-xs font-medium text-muted-foreground/80">Função</Label>
              <Input
                id="role"
                type="text"
                value={invite.role}
                disabled
                className="h-10 bg-background/30 border-border/30 text-muted-foreground/70 capitalize"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-xs font-medium text-muted-foreground/80">Nome Completo</Label>
              <Input
                id="fullName"
                placeholder="Seu nome completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="h-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground/80">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimo 8 caracteres"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  validatePassword(e.target.value);
                }}
                required
                minLength={8}
                className="h-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
              />
              {passwordErrors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {passwordErrors.map((error, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[10px] text-destructive/80">
                      <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/50 mt-2">
                8+ caracteres, maiuscula, minuscula, numero e caractere especial
              </p>
            </div>
            <Button 
              type="submit" 
              className="w-full h-10 bg-primary/90 hover:bg-primary text-primary-foreground font-medium transition-all duration-200" 
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando conta...
                </>
              ) : (
                'Ativar Acesso e Criar Conta'
              )}
            </Button>
            
            <SecurityFooter />
            <BrandSignature />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
