import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import logoImage from '@/assets/logo-cybshield-new.png';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { SecurityFooter, BrandSignature } from '@/components/auth/SecurityFooter';

const emailSchema = z.object({
  email: z.string().email('E-mail invalido').max(255, 'E-mail muito longo'),
});

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate email
      emailSchema.parse({ email });

      const redirectUrl = `${window.location.origin}/update-password`;

      // Always show success message regardless of whether email exists
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      toast({
        title: 'Instrucoes enviadas',
        description: 'Se o e-mail existir, enviaremos instrucoes para redefinir sua senha.',
      });

      setEmail('');
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Erro',
          description: error.issues[0].message,
          variant: 'destructive',
        });
      } else {
        // Generic message - don't reveal if email exists
        toast({
          title: 'Instrucoes enviadas',
          description: 'Se o e-mail existir, enviaremos instrucoes para redefinir sua senha.',
        });
      }
    } finally {
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
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-accent/20 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000" />
              <img src={logoImage} alt="CyberShield" className="relative h-12 w-12 object-contain" />
            </div>
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight text-foreground/90">
            Recuperação Segura de Acesso
          </CardTitle>
          <CardDescription className="text-[13px] text-muted-foreground/70">
            Digite seu email para iniciar o processo de verificação
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground/80">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                disabled={loading}
                className="h-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full h-10 bg-primary/90 hover:bg-primary text-primary-foreground font-medium transition-all duration-200" 
              disabled={loading}
            >
              {loading ? 'Enviando...' : 'Iniciar Recuperação'}
            </Button>
            <div className="text-center text-xs">
              <Link to="/login" className="text-primary/80 hover:text-primary transition-colors">
                Voltar para o login
              </Link>
            </div>
            
            <SecurityFooter />
            <BrandSignature />
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
