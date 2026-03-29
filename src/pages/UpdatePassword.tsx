import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import logoImage from '@/assets/logo-cybshield-new.png';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { SecurityFooter, BrandSignature } from '@/components/auth/SecurityFooter';

const passwordSchema = z.object({
  password: z
    .string()
    .min(8, 'A senha deve ter no minimo 8 caracteres')
    .max(72, 'A senha deve ter no maximo 72 caracteres')
    .regex(/[A-Z]/, 'A senha deve conter pelo menos uma letra maiuscula')
    .regex(/[a-z]/, 'A senha deve conter pelo menos uma letra minuscula')
    .regex(/[0-9]/, 'A senha deve conter pelo menos um numero'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas nao coincidem',
  path: ['confirmPassword'],
});

const UpdatePassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validToken, setValidToken] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if we have a valid session (from password recovery link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidToken(true);
      } else {
        toast({
          title: 'Erro',
          description: 'Link de recuperacao invalido ou expirado',
          variant: 'destructive',
        });
        navigate('/login');
      }
    });
  }, [navigate, toast]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate password
      passwordSchema.parse({ password, confirmPassword });

      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Sucesso',
        description: 'Sua senha foi atualizada com sucesso',
      });

      // Sign out to force new login with new password
      await supabase.auth.signOut();
      navigate('/login');
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Erro de validacao',
          description: error.issues[0].message,
          variant: 'destructive',
        });
      } else {
        logger.error('Error updating password', error);
        toast({
          title: 'Erro',
          description: 'Ocorreu um erro ao atualizar sua senha',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!validToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,158,140,0.02),transparent_60%)] pointer-events-none" />
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          <p className="text-sm text-muted-foreground/60">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Subtle enterprise background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(45,158,140,0.02),transparent_60%)] pointer-events-none" />
      
      <Card className="w-full max-w-[460px] backdrop-blur-xl bg-card/95 border border-white/[0.06] shadow-[0_0_0_1px_rgba(0,255,200,0.05),0_30px_80px_rgba(0,0,0,0.7)] rounded-[14px] relative z-10">
        <CardHeader className="space-y-1 text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-accent/20 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000" />
              <img src={logoImage} alt="CyberShield" className="relative h-12 w-12 object-contain" />
            </div>
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight text-foreground/90">
            Definir Nova Senha Segura
          </CardTitle>
          <CardDescription className="text-[13px] text-muted-foreground/70">
            Crie uma senha forte para proteger seu acesso
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground/80">Nova senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Digite sua nova senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                disabled={loading}
                className="h-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-xs font-medium text-muted-foreground/80">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirme sua nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                disabled={loading}
                className="h-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full h-10 bg-primary/90 hover:bg-primary text-primary-foreground font-medium transition-all duration-200" 
              disabled={loading}
            >
              {loading ? 'Atualizando...' : 'Atualizar Senha'}
            </Button>
            
            <SecurityFooter />
            <BrandSignature />
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default UpdatePassword;
