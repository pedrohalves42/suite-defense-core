import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Shield, Lock, Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { SecurityFooter, BrandSignature } from '@/components/auth/SecurityFooter';
import { logger } from '@/lib/logger';

const passwordSchema = z.object({
  newPassword: z.string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(72, 'Senha muito longa')
    .regex(/[A-Z]/, 'Deve conter letra maiúscula')
    .regex(/[a-z]/, 'Deve conter letra minúscula')
    .regex(/[0-9]/, 'Deve conter número'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'As senhas não conferem',
  path: ['confirmPassword'],
});

export default function ForcePasswordChange() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  const passwordChecks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
  };

  const passwordStrength = Object.values(passwordChecks).filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const validation = passwordSchema.safeParse({ newPassword, confirmPassword });
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      setLoading(false);
      return;
    }

    try {
      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        data: {
          must_change_password: false,
        },
      });

      if (updateError) {
        toast({
          title: 'Erro ao atualizar senha',
          description: updateError.message,
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      toast({
        title: 'Senha atualizada com sucesso',
        description: 'Você será redirecionado para o dashboard.',
      });

      // Small delay before redirect
      setTimeout(() => {
        navigate('/dashboard');
      }, 1000);

    } catch (error) {
      logger.error('Password change error:', error);
      toast({
        title: 'Erro inesperado',
        description: 'Não foi possível atualizar a senha. Tente novamente.',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

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
            Atualização de Segurança
          </CardTitle>
          <CardDescription className="text-[13px] text-muted-foreground/70">
            Por segurança, defina uma nova senha para continuar
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 px-6 pb-6">
            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-xs font-medium text-muted-foreground/80">Nova Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 pl-10 pr-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.newPassword && (
                <p className="text-xs text-destructive">{errors.newPassword}</p>
              )}

              {/* Password Strength Indicator */}
              {newPassword && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          passwordStrength >= level
                            ? level <= 2
                              ? 'bg-destructive/60'
                              : level === 3
                              ? 'bg-warning/60'
                              : 'bg-primary/60'
                            : 'bg-muted/30'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className={`flex items-center gap-1 ${passwordChecks.length ? 'text-primary/80' : 'text-muted-foreground/50'}`}>
                      {passwordChecks.length ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                      8+ caracteres
                    </div>
                    <div className={`flex items-center gap-1 ${passwordChecks.upper ? 'text-primary/80' : 'text-muted-foreground/50'}`}>
                      {passwordChecks.upper ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                      Maiúscula
                    </div>
                    <div className={`flex items-center gap-1 ${passwordChecks.lower ? 'text-primary/80' : 'text-muted-foreground/50'}`}>
                      {passwordChecks.lower ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                      Minúscula
                    </div>
                    <div className={`flex items-center gap-1 ${passwordChecks.number ? 'text-primary/80' : 'text-muted-foreground/50'}`}>
                      {passwordChecks.number ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                      Número
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-xs font-medium text-muted-foreground/80">Confirmar Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 pl-10 pr-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword}</p>
              )}
              {confirmPassword && newPassword && confirmPassword === newPassword && (
                <p className="text-[10px] text-primary/80 flex items-center gap-1">
                  <CheckCircle2 size={10} />
                  Senhas conferem
                </p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-10 bg-primary/90 hover:bg-primary text-primary-foreground font-medium transition-all duration-200"
              disabled={loading || passwordStrength < 4}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Atualizando...
                </>
              ) : (
                'Definir Nova Senha'
              )}
            </Button>
            
            <SecurityFooter />
            <BrandSignature />
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
