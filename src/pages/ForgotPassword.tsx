import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import logoImage from '@/assets/logo-cybshield-new.webp';
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
      {/* Strategic Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,20%,10%)] via-[hsl(200,18%,12%)] to-[hsl(160,15%,10%)] z-0" />
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.03] z-0" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--primary-foreground)) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      <Card className="w-full max-w-[440px] border border-white/10 bg-[hsl(220,20%,10%)]/60 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10 rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-700 ease-out">
        {/* Magnet Top Border */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cta-positive/50 to-transparent" />
        
        <CardHeader className="space-y-6 text-center pb-2 pt-12">
          <Link 
            to="/login" 
            className="inline-flex justify-center group transition-transform duration-500 hover:scale-110 mb-2"
          >
            <div className="relative">
              <div className="absolute -inset-4 bg-cta-positive/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative p-1">
                <img src={logoImage} alt="CyberShield" className="h-16 w-16 object-contain drop-shadow-[0_0_10px_rgba(5,150,105,0.3)]" />
              </div>
            </div>
          </Link>
          
          <div className="space-y-3">
            <CardTitle className="text-4xl font-extrabold tracking-tight text-white leading-tight">
              Recuperação
            </CardTitle>
            <CardDescription className="text-base text-white/50 font-medium max-w-[280px] leading-relaxed mx-auto">
              Inicie o protocolo seguro de redefinição de acesso.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="px-10 pb-12 pt-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-3">
              <Label htmlFor="email" className="text-white/70 font-bold text-[11px] uppercase tracking-[0.15em] ml-1">E-mail Corporativo</Label>
              <div className="relative group">
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={255}
                  disabled={loading}
                  className="h-14 border-white/5 focus:border-cta-positive/30 focus:ring-0 transition-all duration-500 bg-white/[0.02] hover:bg-white/[0.04] text-white rounded-2xl placeholder:text-white/10"
                />
                <div className="absolute inset-0 rounded-2xl border border-cta-positive/0 group-focus-within:border-cta-positive/20 pointer-events-none transition-all duration-500" />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-14 bg-white text-black hover:bg-white/90 font-bold rounded-2xl shadow-[0_10px_25px_rgba(255,255,255,0.1)] hover:shadow-[0_15px_35px_rgba(255,255,255,0.2)] transition-all duration-500 text-sm uppercase tracking-[0.1em]" 
              disabled={loading}
            >
              {loading ? 'Enviando...' : 'Resetar Senha'}
            </Button>

            <div className="text-[11px] text-center text-white/30 font-medium uppercase tracking-widest pt-4">
              <Link to="/login" className="hover:text-white transition-colors duration-300">
                Voltar para o login
              </Link>
            </div>
            
            <SecurityFooter />
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
