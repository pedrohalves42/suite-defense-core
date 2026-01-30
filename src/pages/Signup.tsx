import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { logger } from '@/lib/logger';
import { SecurityFooter, BrandSignature } from '@/components/auth/SecurityFooter';

const signupSchema = z.object({
  email: z.string()
    .trim()
    .min(1, 'Email e obrigatorio')
    .email('Email invalido')
    .max(255, 'Email muito longo'),
  password: z.string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(72, 'Senha muito longa')
    .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiuscula')
    .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minuscula')
    .regex(/[0-9]/, 'Senha deve conter pelo menos um numero')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Senha deve conter pelo menos um caractere especial'),
  fullName: z.string()
    .trim()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome muito longo')
    .regex(/^[\p{L}\s'-]+$/u, 'Nome deve conter apenas letras, espacos, hifens ou apostrofos'),
  deviceCount: z.string().optional(),
});

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [deviceCount, setDeviceCount] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate inputs
    const validation = signupSchema.safeParse({ email, password, fullName, deviceCount });
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      toast({
        variant: 'destructive',
        title: 'Erro de validacao',
        description: firstError.message,
      });
      setLoading(false);
      return;
    }

    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email: validation.data.email,
      password: validation.data.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: validation.data.fullName,
          device_count: deviceCount || undefined,
        },
      },
    });

    // Send welcome email and create trial subscription
    if (!error && data.user) {
      try {
        // Send welcome email
        await supabase.functions.invoke('send-welcome-email', {
          body: {
            email: validation.data.email,
            fullName: validation.data.fullName,
            userId: data.user.id,
          },
        });

        // Create trial subscription (14 days)
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          await supabase.functions.invoke('create-trial-subscription', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
          });
        }
      } catch (emailError) {
        logger.error('Failed to send welcome email or create trial', emailError);
        // Don't block signup if these fail
      }
    }

    if (error) {
      // Log detailed error for debugging (P1 - improved diagnostics)
      console.error('[Signup Error]', {
        message: error.message,
        status: (error as any).status,
        code: (error as any).code,
        details: error
      });
      logger.error('Signup failed', { email: validation.data.email, error: error.message });
      
      // Generic error messages to prevent account enumeration
      const message = error.message.includes('already registered') || error.message.includes('already exists')
        ? 'Ja existe uma conta com este email'
        : 'Erro ao processar seu cadastro. Tente novamente.';
      
      toast({
        variant: 'destructive',
        title: 'Erro no cadastro',
        description: message,
      });
    } else {
      toast({
        title: 'Cadastro realizado com sucesso! 🎉',
        description: 'Trial de 14 dias ativado. Redirecionando...',
      });
      
      // Redirect to onboarding after 1.5s
      setTimeout(() => {
        navigate('/admin/dashboard?onboarding=true');
      }, 1500);
    }

    setLoading(false);
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
            Criar Conta Segura
          </CardTitle>
          <CardDescription className="text-[13px] text-muted-foreground/70">
            Junte-se ao ambiente protegido CyberShield Cloud
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4 px-6">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-xs font-medium text-muted-foreground/80">Nome Completo</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Seu nome"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
                maxLength={100}
                className="h-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground/80">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                className="h-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deviceCount" className="text-xs font-medium text-muted-foreground/80">Quantos computadores você quer proteger?</Label>
              <Select value={deviceCount} onValueChange={setDeviceCount}>
                <SelectTrigger className="h-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all">
                  <SelectValue placeholder="Selecione uma opção" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-3">1 a 3 computadores</SelectItem>
                  <SelectItem value="4-10">4 a 10 computadores</SelectItem>
                  <SelectItem value="11-30">11 a 30 computadores</SelectItem>
                  <SelectItem value="31-100">31 a 100 computadores</SelectItem>
                  <SelectItem value="100+">Mais de 100 computadores</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground/80">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={72}
                  className="h-10 pr-10 bg-background/50 border-border/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-1">
                Minimo 8 caracteres, incluindo maiuscula, minuscula, numero e caractere especial
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 px-6 pb-6">
            <Button 
              type="submit" 
              className="w-full h-10 bg-primary/90 hover:bg-primary text-primary-foreground font-medium transition-all duration-200" 
              disabled={loading}
            >
              {loading ? 'Criando conta...' : 'Iniciar Diagnóstico Seguro'}
            </Button>
            <p className="text-[10px] text-center text-muted-foreground/50">
              Planos a partir de R$ 150/mês após o diagnóstico.
            </p>
            <div className="text-xs text-center text-muted-foreground/60">
              Ja tem uma conta?{' '}
              <Link to="/login" className="text-primary/80 hover:text-primary transition-colors">
                Entrar
              </Link>
            </div>
            
            <SecurityFooter />
            <BrandSignature />
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
