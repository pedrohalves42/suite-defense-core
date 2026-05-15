import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import logoImage from '@/assets/logo-cybshield-new.webp';
import { logger } from '@/lib/logger';
import { useTranslation } from 'react-i18next';

const signupSchema = z.object({
  email: z.string()
    .trim()
    .min(1, 'Email é obrigatório')
    .email('Email inválido')
    .max(255, 'Email muito longo'),
  password: z.string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(72, 'Senha muito longa'),
  fullName: z.string()
    .trim()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome muito longo'),
});

export default function Signup() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const validation = signupSchema.safeParse({ email, password, fullName });
    if (!validation.success) {
      toast({
        variant: 'destructive',
        title: t('signupPage.validationError') || 'Erro de validação',
        description: validation.error.issues[0].message,
      });
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: validation.data.email,
      password: validation.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: validation.data.fullName,
          trial_signup: true,
        },
      },
    });

    if (error) {
      logger.error('Signup failed', error);
      toast({
        variant: 'destructive',
        title: t('signupPage.signupError') || 'Erro no cadastro',
        description: error.message,
      });
    } else {
      toast({
        title: t('signupPage.successTitle') || 'Conta criada!',
        description: t('signupPage.successDesc') || 'Verifique seu e-mail para confirmar a conta.',
      });
      setTimeout(() => navigate('/login'), 2000);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,20%,10%)] via-[hsl(200,18%,12%)] to-[hsl(160,15%,10%)] z-0" />
      <Card className="w-full max-w-[460px] border border-white/10 bg-[hsl(220,20%,10%)]/60 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10 rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-700 ease-out">
        <CardHeader className="space-y-6 text-center pb-2 pt-12">
          <Link to="/" className="inline-flex justify-center group mb-2">
            <img src={logoImage} alt="CyberShield" className="h-16 w-16 object-contain" />
          </Link>
          <div className="space-y-3">
            <CardTitle className="text-4xl font-extrabold tracking-tight text-white leading-tight">
              {t('signupPage.trialTitle', 'Trial 15 Dias')}
            </CardTitle>
            <p className="text-white/60">{t('signupPage.trialSubtitle', 'Até 2 endpoints inclusos')}</p>
          </div>
        </CardHeader>

        <form onSubmit={handleSignup}>
          <CardContent className="space-y-6 px-10 pt-8">
            <div className="space-y-3">
              <Label className="text-white/70">Nome Completo</Label>
              <Input
                placeholder="Seu nome"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="space-y-3">
              <Label className="text-white/70">E-mail</Label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="space-y-3">
              <Label className="text-white/70">Senha</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-white/5 border-white/10 text-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-6 px-10 pt-8 pb-12">
            <Button 
              type="submit" 
              className="w-full h-14 bg-white text-black hover:bg-white/90 font-bold rounded-2xl" 
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" /> : (t('signupPage.submitButton') || 'Começar Trial Grátis')}
            </Button>
            <p className="text-center text-white/40 text-sm">
              Já tem conta? <Link to="/login" className="text-white hover:underline">Entre aqui</Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
