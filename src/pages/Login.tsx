import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Shield, Mail, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';

const loginSchema = z.object({
  email: z.string()
    .trim()
    .min(1, 'Email é obrigatório')
    .email('Email inválido')
    .max(255, 'Email muito longo'),
  password: z.string()
    .min(1, 'Senha é obrigatória')
    .max(72, 'Senha muito longa'),
});

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [requiresCaptcha, setRequiresCaptcha] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Verificar tentativas falhadas ao carregar a página
  useEffect(() => {
    const checkFailedAttempts = async () => {
      const { data, error } = await supabase.functions.invoke('check-failed-logins', {
        body: {},
      });

      if (!error && data) {
        // Verificar se IP está bloqueado
        if (data.blocked) {
          toast({
            variant: 'destructive',
            title: '🚨 Acesso Bloqueado - Proteção Anti-Brute-Force',
            description: `Seu IP foi bloqueado até ${new Date(data.blockedUntil).toLocaleString('pt-BR')} (${data.attemptCount || 5}+ tentativas em 15 minutos). Contate o suporte se isso for um erro.`,
            duration: 15000,
          });
          setLoading(true); // Desabilitar interface
          return;
        }

        setRequiresCaptcha(data.requiresCaptcha);
        setAttemptCount(data.attemptCount);
        
        if (data.requiresCaptcha) {
          // Carregar script do Cloudflare Turnstile
          const script = document.createElement('script');
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
          script.async = true;
          script.defer = true;
          document.body.appendChild(script);

          script.onload = () => {
            const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
            if (!siteKey) {
              console.error('VITE_TURNSTILE_SITE_KEY not configured');
              return;
            }
            // @ts-ignore - Turnstile global
            window.turnstile?.render('#captcha-container', {
              sitekey: siteKey,
              callback: (token: string) => setCaptchaToken(token),
            });
          };
        }
      }
    };

    checkFailedAttempts();
  }, [toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validar CAPTCHA se necessário
    if (requiresCaptcha && !captchaToken) {
      toast({
        variant: 'destructive',
        title: 'CAPTCHA obrigatório',
        description: 'Complete o CAPTCHA para continuar.',
      });
      setLoading(false);
      return;
    }

    // Validate inputs
    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      toast({
        variant: 'destructive',
        title: 'Erro de validação',
        description: firstError.message,
      });
      setLoading(false);
      return;
    }

    console.log('[Login] Tentando login com senha para:', validation.data.email);

    const { error } = await supabase.auth.signInWithPassword({
      email: validation.data.email,
      password: validation.data.password,
    });

    if (error) {
      console.error('[Login] Erro no login:', error.message, 'Código:', error.status);
      
      // Registrar tentativa falhada com audit log
      try {
        await supabase.functions.invoke('record-failed-login', {
          body: { email: validation.data.email },
        });
      } catch (recordError) {
        console.error('Failed to record login attempt:', recordError);
      }

      // Incrementar contador e verificar se precisa de CAPTCHA
      const newCount = attemptCount + 1;
      setAttemptCount(newCount);
      if (newCount >= 3) {
        setRequiresCaptcha(true);
        window.location.reload(); // Recarregar para mostrar CAPTCHA
      }
      
      // Mensagens específicas baseadas no erro
      let message = 'Email ou senha incorretos. Tente novamente.';
      let description = '';
      
      if (error.message.includes('Email not confirmed')) {
        message = 'Email não confirmado';
        description = 'Verifique sua caixa de entrada para confirmar seu email.';
      } else if (error.message.includes('Invalid login credentials')) {
        description = 'Verifique suas credenciais ou tente o login por email mágico.';
      } else if (error.status === 429) {
        message = 'Muitas tentativas';
        description = 'Aguarde alguns minutos antes de tentar novamente.';
      }
      
      toast({
        variant: 'destructive',
        title: message,
        description,
      });
    } else {
      console.log('[Login] Login bem-sucedido');
      
      // Limpar tentativas falhadas
      await supabase.functions.invoke('clear-failed-logins', {
        body: {},
      });

      toast({
        title: 'Login realizado com sucesso',
        description: 'Redirecionando...',
      });
      navigate('/dashboard');
    }

    setLoading(false);
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const emailValidation = z.string().email('Email inválido').safeParse(email);
    if (!emailValidation.success) {
      toast({
        variant: 'destructive',
        title: 'Email inválido',
        description: 'Por favor, insira um email válido.',
      });
      setLoading(false);
      return;
    }

    console.log('[Login] Enviando link mágico para:', email);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      console.error('[Login] Erro ao enviar link mágico:', error.message);
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar link',
        description: 'Não foi possível enviar o email. Tente novamente.',
      });
    } else {
      console.log('[Login] Link mágico enviado com sucesso');
      setMagicLinkSent(true);
      toast({
        title: 'Email enviado!',
        description: 'Verifique sua caixa de entrada e clique no link para fazer login.',
      });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <Shield className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">CyberShield Cloud</CardTitle>
          <CardDescription>
            Entre com suas credenciais para acessar o sistema
          </CardDescription>
        </CardHeader>

        <Tabs defaultValue="password" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="password">Senha</TabsTrigger>
            <TabsTrigger value="magic">Email Mágico</TabsTrigger>
          </TabsList>

          <TabsContent value="password">
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4">
                {attemptCount > 0 && attemptCount < 3 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      ⚠️ {attemptCount} tentativa{attemptCount > 1 ? 's' : ''} falhada{attemptCount > 1 ? 's' : ''} detectada{attemptCount > 1 ? 's' : ''}. 
                      {3 - attemptCount} tentativa{3 - attemptCount > 1 ? 's' : ''} restante{3 - attemptCount > 1 ? 's' : ''} antes do CAPTCHA.
                    </AlertDescription>
                  </Alert>
                )}
                {requiresCaptcha && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      🔒 Proteção ativada: {attemptCount} tentativas falhadas. Complete o CAPTCHA para continuar.
                      {attemptCount >= 5 && ' Próximo bloqueio automático após mais falhas!'}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={255}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    maxLength={72}
                  />
                </div>
                {requiresCaptcha && (
                  <div id="captcha-container" className="flex justify-center" />
                )}
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Entrando...' : 'Entrar'}
                </Button>
                <div className="text-sm text-center text-muted-foreground space-y-2">
                  <div>
                    <Link to="/forgot-password" className="text-primary hover:underline">
                      Esqueceu sua senha?
                    </Link>
                  </div>
                  <div>
                    Não tem uma conta?{' '}
                    <Link to="/signup" className="text-primary hover:underline">
                      Cadastre-se
                    </Link>
                  </div>
                </div>
              </CardFooter>
            </form>
          </TabsContent>

          <TabsContent value="magic">
            <form onSubmit={handleMagicLink}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="magic-email">Email</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={255}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  <p className="flex items-start gap-2">
                    <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      Enviaremos um link de acesso único para seu email. 
                      {' '}Ideal para redes corporativas com restrições.
                    </span>
                  </p>
                </div>
                {magicLinkSent && (
                  <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 p-3 rounded-md">
                    ✓ Email enviado! Verifique sua caixa de entrada.
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar Link Mágico'}
                </Button>
                <div className="text-sm text-center text-muted-foreground">
                  Não tem uma conta?{' '}
                  <Link to="/signup" className="text-primary hover:underline">
                    Cadastre-se
                  </Link>
                </div>
              </CardFooter>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
