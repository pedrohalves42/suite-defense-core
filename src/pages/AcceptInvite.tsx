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

const passwordSchema = z.string()
  .min(8, 'Senha deve ter pelo menos 8 caracteres')
  .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
  .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
  .regex(/[0-9]/, 'Senha deve conter pelo menos um número')
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
        toast({ title: 'Token inválido', variant: 'destructive' });
        navigate('/login');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('invites')
          .select('*')
          .eq('token', token)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error || !data) {
          toast({ title: 'Convite não encontrado ou expirado', variant: 'destructive' });
          navigate('/login');
          return;
        }

        if (new Date(data.expires_at) < new Date()) {
          toast({ title: 'Convite expirado', variant: 'destructive' });
          navigate('/login');
          return;
        }

        setInvite(data);
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
        title: 'Senha não atende aos requisitos', 
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
    } catch (error: any) {
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
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invite) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
              <Shield className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">Aceitar Convite</CardTitle>
          <CardDescription className="text-center">
            Você foi convidado como <strong>{invite.role}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAccept} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={invite.email}
                disabled
                className="bg-secondary"
              />
            </div>
            <div>
              <Label htmlFor="fullName">Nome Completo</Label>
              <Input
                id="fullName"
                placeholder="Seu nome completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  validatePassword(e.target.value);
                }}
                required
                minLength={8}
              />
              {passwordErrors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {passwordErrors.map((error, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Senha deve conter: 8+ caracteres, maiúscula, minúscula, número e caractere especial
              </p>
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando conta...
                </>
              ) : (
                'Aceitar Convite e Criar Conta'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
