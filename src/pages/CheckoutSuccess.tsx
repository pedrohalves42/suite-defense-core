import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refetch } = useSubscription();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    // Refresh subscription status after successful checkout
    const timer = setTimeout(() => {
      refetch();
    }, 2000);

    return () => clearTimeout(timer);
  }, [refetch]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
          <CardTitle className="text-2xl">Assinatura Confirmada!</CardTitle>
          <CardDescription>
            Sua assinatura foi criada com sucesso
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="text-sm text-muted-foreground">
              <strong>Período de Trial:</strong> 30 dias gratuitos
            </p>
            <p className="text-sm text-muted-foreground">
              Você não será cobrado durante o período de teste. Após o término, sua cobrança será automática.
            </p>
          </div>
          
          {sessionId && (
            <p className="text-xs text-muted-foreground text-center">
              ID da Sessão: {sessionId}
            </p>
          )}

          <div className="space-y-2">
            <Button 
              className="w-full" 
              onClick={() => navigate('/admin/dashboard')}
            >
              Ir para Dashboard
            </Button>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigate('/admin/plan-upgrade')}
            >
              Ver Minha Assinatura
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
