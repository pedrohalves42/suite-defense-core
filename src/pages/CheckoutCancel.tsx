import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

export default function CheckoutCancel() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
            <XCircle className="h-10 w-10 text-red-500" />
          </div>
          <CardTitle className="text-2xl">Checkout Cancelado</CardTitle>
          <CardDescription>
            O processo de assinatura foi cancelado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Nenhuma cobrança foi realizada. Você pode tentar novamente quando estiver pronto.
          </p>

          <div className="space-y-2">
            <Button 
              className="w-full" 
              onClick={() => navigate('/admin/plan-upgrade')}
            >
              Ver Planos Novamente
            </Button>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigate('/admin/dashboard')}
            >
              Voltar ao Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
