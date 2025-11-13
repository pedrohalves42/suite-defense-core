import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Loader2, 
  Copy, 
  ExternalLink,
  CreditCard,
  Zap,
  Crown,
  CheckCheck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Navigate } from 'react-router-dom';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface HealthCheckResponse {
  overall_status: 'healthy' | 'degraded' | 'down';
  checks: {
    stripe_api: {
      status: 'ok' | 'error';
      message: string;
      details?: { account_name: string; country: string };
    };
    products_configured: {
      status: 'ok' | 'partial' | 'missing';
      details: {
        starter: { exists: boolean; price_id: string | null };
        pro: { exists: boolean; price_id: string | null };
      };
    };
    webhook_configured: {
      status: 'ok' | 'warning' | 'missing';
      message: string;
      endpoint_url?: string;
    };
  };
  recommendations: string[];
}

export default function StripeSetup() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [isCreatingProducts, setIsCreatingProducts] = useState(false);

  // Health check query with auto-refresh
  const { data: healthStatus, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['stripe-health-check'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('stripe-health-check');
      if (error) throw error;
      return data as HealthCheckResponse;
    },
    refetchInterval: 30000, // 30 seconds
    refetchOnWindowFocus: true,
    staleTime: 20000,
  });

  // Create products mutation
  const createProductsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-stripe-products');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Produtos criados com sucesso!',
        description: 'Os produtos Starter e Pro foram configurados no Stripe.',
      });
      queryClient.invalidateQueries({ queryKey: ['stripe-health-check'] });
      refetchHealth();
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar produtos',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateProducts = async () => {
    if (isCreatingProducts) return;
    
    // Check if products already exist
    if (healthStatus?.checks.products_configured.status === 'ok') {
      toast({
        title: 'Produtos já configurados',
        description: 'Os produtos Starter e Pro já estão configurados.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingProducts(true);
    try {
      await createProductsMutation.mutateAsync();
    } finally {
      setIsCreatingProducts(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado!',
      description: `${label} copiado para a área de transferência.`,
    });
  };

  const getStatusColor = (status: 'healthy' | 'degraded' | 'down') => {
    switch (status) {
      case 'healthy': return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'degraded': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'down': return 'text-red-500 bg-red-500/10 border-red-500/20';
    }
  };

  const getStatusIcon = (status: 'ok' | 'error' | 'warning' | 'partial' | 'missing') => {
    switch (status) {
      case 'ok': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning': case 'partial': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'missing': return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const webhookUrl = healthStatus?.checks.webhook_configured.endpoint_url || 
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <CreditCard className="h-8 w-8" />
          Configuração Stripe
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure e monitore a integração de pagamentos
        </p>
      </div>

      {/* Health Status Card */}
      <Card className={healthStatus ? getStatusColor(healthStatus.overall_status) : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Status Geral
                {healthLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              </CardTitle>
              <CardDescription>
                {healthStatus?.overall_status === 'healthy' && '✓ Sistema operacional'}
                {healthStatus?.overall_status === 'degraded' && '⚠️ Configuração parcial'}
                {healthStatus?.overall_status === 'down' && '✗ Sistema não configurado'}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetchHealth()}
              disabled={healthLoading}
            >
              <RefreshCw className={`h-4 w-4 ${healthLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {healthStatus && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {getStatusIcon(healthStatus.checks.stripe_api.status)}
                <span className="text-sm">
                  API Stripe: {healthStatus.checks.stripe_api.message}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(healthStatus.checks.products_configured.status)}
                <span className="text-sm">
                  Produtos Configurados: {healthStatus.checks.products_configured.status === 'ok' ? 'Sim' : 'Não'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(healthStatus.checks.webhook_configured.status)}
                <span className="text-sm">
                  Webhook: {healthStatus.checks.webhook_configured.message}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations */}
      {healthStatus?.recommendations && healthStatus.recommendations.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Recomendações</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1 mt-2">
              {healthStatus.recommendations.map((rec, index) => (
                <li key={index} className="text-sm">{rec}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Setup Wizard */}
      <Card>
        <CardHeader>
          <CardTitle>Assistente de Configuração</CardTitle>
          <CardDescription>Configure sua integração Stripe em 3 passos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: API Connection */}
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
              1
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Validar Conexão</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Verificar conectividade com a API do Stripe
              </p>
              {healthStatus?.checks.stripe_api.status === 'ok' ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Completo
                </Badge>
              ) : (
                <Badge variant="destructive">
                  Pendente
                </Badge>
              )}
            </div>
          </div>

          {/* Step 2: Create Products */}
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
              2
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Criar Produtos</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Criar produtos Starter e Pro automaticamente no Stripe
              </p>
              {healthStatus?.checks.products_configured.status === 'ok' ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Completo
                </Badge>
              ) : (
                <Button
                  onClick={handleCreateProducts}
                  disabled={isCreatingProducts || createProductsMutation.isPending}
                >
                  {(isCreatingProducts || createProductsMutation.isPending) ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Criar Produtos Automaticamente
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Step 3: Configure Webhook */}
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
              3
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Configurar Webhook</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Registrar webhook no Stripe Dashboard manualmente
              </p>
              <Badge variant="outline">Instrucional</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Status Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Starter Product */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Zap className="h-5 w-5 text-blue-500" />
              </div>
              <CardTitle>Starter Plan</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="font-semibold flex items-center gap-2">
                {healthStatus?.checks.products_configured.details.starter.exists ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Configurado
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-500" />
                    Não Configurado
                  </>
                )}
              </p>
            </div>
            {healthStatus?.checks.products_configured.details.starter.price_id && (
              <div>
                <p className="text-sm text-muted-foreground">Price ID</p>
                <code className="text-xs bg-muted p-1 rounded block mt-1 overflow-x-auto">
                  {healthStatus.checks.products_configured.details.starter.price_id}
                </code>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Valor</p>
                <p className="font-semibold">R$ 30/mês</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dispositivos</p>
                <p className="font-semibold">Até 30</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pro Product */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Crown className="h-5 w-5 text-purple-500" />
              </div>
              <CardTitle>Pro Plan</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="font-semibold flex items-center gap-2">
                {healthStatus?.checks.products_configured.details.pro.exists ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Configurado
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-500" />
                    Não Configurado
                  </>
                )}
              </p>
            </div>
            {healthStatus?.checks.products_configured.details.pro.price_id && (
              <div>
                <p className="text-sm text-muted-foreground">Price ID</p>
                <code className="text-xs bg-muted p-1 rounded block mt-1 overflow-x-auto">
                  {healthStatus.checks.products_configured.details.pro.price_id}
                </code>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Valor</p>
                <p className="font-semibold">R$ 50/mês</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dispositivos</p>
                <p className="font-semibold">Até 200</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Webhook Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuração de Webhook</CardTitle>
          <CardDescription>
            Configure o webhook no Stripe Dashboard para sincronizar assinaturas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Endpoint URL</p>
            <div className="flex gap-2">
              <code className="flex-1 text-xs bg-muted p-3 rounded overflow-x-auto">
                {webhookUrl}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookUrl, 'URL do webhook')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Eventos necessários</p>
            <ul className="space-y-1">
              <li className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                customer.subscription.created
              </li>
              <li className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                customer.subscription.updated
              </li>
              <li className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                customer.subscription.deleted
              </li>
              <li className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                invoice.payment_failed
              </li>
            </ul>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.open('https://dashboard.stripe.com/webhooks', '_blank')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Abrir Stripe Dashboard
          </Button>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card>
        <CardHeader>
          <CardTitle>Solução de Problemas</CardTitle>
          <CardDescription>Perguntas frequentes e soluções</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>
                ❌ Erro: "STRIPE_SECRET_KEY is not set"
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Este erro indica que a chave secreta do Stripe não foi configurada.
                </p>
                <p className="text-sm">
                  <strong>Solução:</strong> Configure o secret STRIPE_SECRET_KEY nas configurações
                  do projeto Supabase em Settings → Edge Functions → Secrets.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>
                ⚠️ Produtos já existem no Stripe
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Se você já criou produtos manualmente no Stripe, precisará copiar os price_id manualmente.
                </p>
                <p className="text-sm">
                  <strong>Solução:</strong> Acesse o Stripe Dashboard, copie os price_id dos produtos
                  e atualize-os no banco de dados na tabela subscription_plans.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger>
                🔄 Webhook não está recebendo eventos
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Verifique se o webhook foi registrado corretamente no Stripe.
                </p>
                <p className="text-sm">
                  <strong>Solução:</strong> 
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Acesse Stripe Dashboard → Developers → Webhooks</li>
                    <li>Verifique se o endpoint está listado</li>
                    <li>Confirme que os 4 eventos estão selecionados</li>
                    <li>Teste enviando um evento de teste</li>
                  </ol>
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4">
              <AccordionTrigger>
                🧪 Como testar em modo sandbox?
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Use uma chave de teste do Stripe (começa com sk_test_).
                </p>
                <p className="text-sm">
                  <strong>Cartões de teste:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Sucesso: 4242 4242 4242 4242</li>
                    <li>Falha: 4000 0000 0000 0002</li>
                    <li>Requer autenticação: 4000 0025 0000 3155</li>
                  </ul>
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
