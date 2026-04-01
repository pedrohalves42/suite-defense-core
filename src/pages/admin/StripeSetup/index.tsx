import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2, Copy, ExternalLink, CreditCard, Zap, Crown, CheckCheck } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Navigate } from 'react-router-dom';
import { StripeExtendedPricesSetup } from '@/components/admin/StripeExtendedPricesSetup';
import { useStripeSetup, getStatusColor } from './useStripeSetup';
import type { HealthCheckResponse } from './useStripeSetup';

function StatusIcon({ status }: { status: 'ok' | 'error' | 'warning' | 'partial' | 'missing' }) {
  switch (status) {
    case 'ok': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
    case 'warning': case 'partial': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case 'missing': return <XCircle className="h-5 w-5 text-red-500" />;
  }
}

export default function StripeSetup() {
  const {
    isAdmin, adminLoading, healthStatus, healthLoading, refetchHealth,
    isCreatingProducts, createProductsMutation, handleCreateProducts,
    copyToClipboard, webhookUrl,
  } = useStripeSetup();

  if (adminLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><CreditCard className="h-8 w-8" />Configuracao Stripe</h1>
        <p className="text-muted-foreground mt-1">Configure e monitore a integracao de pagamentos</p>
      </div>

      {/* Health Status */}
      <Card className={healthStatus ? getStatusColor(healthStatus.overall_status) : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">Status Geral{healthLoading && <Loader2 className="h-4 w-4 animate-spin" />}</CardTitle>
              <CardDescription>
                {healthStatus?.overall_status === 'healthy' && '✅ Sistema operacional'}
                {healthStatus?.overall_status === 'degraded' && '⚠️ Configuracao parcial'}
                {healthStatus?.overall_status === 'down' && '❌ Sistema nao configurado'}
              </CardDescription>
            </div>
            <Button variant="outline" size="icon" onClick={() => refetchHealth()} disabled={healthLoading}>
              <RefreshCw className={`h-4 w-4 ${healthLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {healthStatus && (
            <div className="space-y-3">
              <div className="flex items-center gap-2"><StatusIcon status={healthStatus.checks.stripe_api.status} /><span className="text-sm">API Stripe: {healthStatus.checks.stripe_api.message}</span></div>
              <div className="flex items-center gap-2"><StatusIcon status={healthStatus.checks.products_configured.status} /><span className="text-sm">Produtos Configurados: {healthStatus.checks.products_configured.status === 'ok' ? 'Sim' : 'Nao'}</span></div>
              <div className="flex items-center gap-2"><StatusIcon status={healthStatus.checks.webhook_configured.status} /><span className="text-sm">Webhook: {healthStatus.checks.webhook_configured.message}</span></div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations */}
      {healthStatus?.recommendations && healthStatus.recommendations.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Recomendacoes</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1 mt-2">
              {healthStatus.recommendations.map((rec, index) => <li key={index} className="text-sm">{rec}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Setup Wizard */}
      <Card>
        <CardHeader>
          <CardTitle>Assistente de Configuracao</CardTitle>
          <CardDescription>Configure sua integracao Stripe em 3 passos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1 */}
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">1</div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Validar Conexao</h3>
              <p className="text-sm text-muted-foreground mb-2">Verificar conectividade com a API do Stripe</p>
              {healthStatus?.checks.stripe_api.status === 'ok' ? (
                <Badge variant="default" className="bg-green-500"><CheckCheck className="h-3 w-3 mr-1" />Completo</Badge>
              ) : <Badge variant="destructive">Pendente</Badge>}
            </div>
          </div>
          {/* Step 2 */}
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">2</div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Criar Produtos</h3>
              <p className="text-sm text-muted-foreground mb-3">Criar produtos Starter e Pro automaticamente no Stripe</p>
              {healthStatus?.checks.products_configured.status === 'ok' ? (
                <Badge variant="default" className="bg-green-500"><CheckCheck className="h-3 w-3 mr-1" />Completo</Badge>
              ) : (
                <Button onClick={handleCreateProducts} disabled={isCreatingProducts || createProductsMutation.isPending}>
                  {(isCreatingProducts || createProductsMutation.isPending) ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando...</>) : (<><Zap className="mr-2 h-4 w-4" />Criar Produtos Automaticamente</>)}
                </Button>
              )}
            </div>
          </div>
          {/* Step 3 */}
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">3</div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Configurar Webhook</h3>
              <p className="text-sm text-muted-foreground mb-2">Registrar webhook no Stripe Dashboard manualmente</p>
              <Badge variant="outline">Instrucional</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Status Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        <ProductCard title="Starter Plan" icon={<Zap className="h-5 w-5 text-blue-500" />} iconBg="bg-blue-500/10"
          exists={healthStatus?.checks.products_configured.details.starter.exists}
          priceId={healthStatus?.checks.products_configured.details.starter.price_id}
          price="R$ 30/mes" devices="Ate 30" />
        <ProductCard title="Pro Plan" icon={<Crown className="h-5 w-5 text-purple-500" />} iconBg="bg-purple-500/10"
          exists={healthStatus?.checks.products_configured.details.pro.exists}
          priceId={healthStatus?.checks.products_configured.details.pro.price_id}
          price="R$ 50/mes" devices="Ate 200" />
      </div>

      {/* Webhook Config */}
      <Card>
        <CardHeader>
          <CardTitle>Configuracao de Webhook</CardTitle>
          <CardDescription>Configure o webhook no Stripe Dashboard para sincronizar assinaturas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Endpoint URL</p>
            <div className="flex gap-2">
              <code className="flex-1 text-xs bg-muted p-3 rounded overflow-x-auto">{webhookUrl}</code>
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl, 'URL do webhook')}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Eventos necessarios</p>
            <ul className="space-y-1">
              {['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed'].map(e => (
                <li key={e} className="text-sm flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-green-500" />{e}</li>
              ))}
            </ul>
          </div>
          <Button variant="outline" className="w-full" onClick={() => window.open('https://dashboard.stripe.com/webhooks', '_blank')}>
            <ExternalLink className="mr-2 h-4 w-4" />Abrir Stripe Dashboard
          </Button>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card>
        <CardHeader><CardTitle>Solucao de Problemas</CardTitle><CardDescription>Perguntas frequentes e solucoes</CardDescription></CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>❌ Erro: "STRIPE_SECRET_KEY is not set"</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">Este erro indica que a chave secreta do Stripe nao foi configurada.</p>
                <p className="text-sm"><strong>Solucao:</strong> Configure o secret STRIPE_SECRET_KEY nas configuracoes do projeto.</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>⚠️ Produtos ja existem no Stripe</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">Se voce ja criou produtos manualmente no Stripe, precisara copiar os price_id manualmente.</p>
                <p className="text-sm"><strong>Solucao:</strong> Acesse o Stripe Dashboard, copie os price_id dos produtos e atualize-os no banco de dados na tabela subscription_plans.</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>🔄 Webhook nao esta recebendo eventos</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">Verifique se o webhook foi registrado corretamente no Stripe.</p>
                <p className="text-sm"><strong>Solucao:</strong><ol className="list-decimal list-inside mt-2 space-y-1"><li>Acesse Stripe Dashboard &gt; Developers &gt; Webhooks</li><li>Verifique se o endpoint esta listado</li><li>Confirme que os 4 eventos estao selecionados</li><li>Teste enviando um evento de teste</li></ol></p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>🧪 Como testar em modo sandbox?</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground mb-2">Use uma chave de teste do Stripe (comeca com sk_test_).</p>
                <p className="text-sm"><strong>Cartoes de teste:</strong><ul className="list-disc list-inside mt-2 space-y-1"><li>Sucesso: 4242 4242 4242 4242</li><li>Falha: 4000 0000 0000 0002</li><li>Requer autenticacao: 4000 0025 0000 3155</li></ul></p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <StripeExtendedPricesSetup />
    </div>
  );
}

function ProductCard({ title, icon, iconBg, exists, priceId, price, devices }: {
  title: string; icon: React.ReactNode; iconBg: string;
  exists?: boolean; priceId?: string | null; price: string; devices: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className={`p-2 ${iconBg} rounded-lg`}>{icon}</div>
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm text-muted-foreground">Status</p>
          <p className="font-semibold flex items-center gap-2">
            {exists ? (<><CheckCircle2 className="h-4 w-4 text-green-500" />Configurado</>) : (<><XCircle className="h-4 w-4 text-red-500" />Nao Configurado</>)}
          </p>
        </div>
        {priceId && (
          <div><p className="text-sm text-muted-foreground">Price ID</p><code className="text-xs bg-muted p-1 rounded block mt-1 overflow-x-auto">{priceId}</code></div>
        )}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
          <div><p className="text-xs text-muted-foreground">Valor</p><p className="font-semibold">{price}</p></div>
          <div><p className="text-xs text-muted-foreground">Dispositivos</p><p className="font-semibold">{devices}</p></div>
        </div>
      </CardContent>
    </Card>
  );
}
