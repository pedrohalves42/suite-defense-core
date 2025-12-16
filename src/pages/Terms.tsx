import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link to="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-3xl">Termos de Servico</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Ultima atualizacao: {formatBrazilDateTime(new Date(), 'date')}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold mt-6">1. Aceitacao dos Termos</h2>
              <p>
                Ao acessar e usar o CyberShield ("Servico"), voce concorda em cumprir e estar vinculado aos seguintes 
                termos e condicoes de uso. Se voce nao concordar com qualquer parte destes termos, nao utilize o Servico.
              </p>

              <h2 className="text-2xl font-semibold mt-6">2. Descricao do Servico</h2>
              <p>
                O CyberShield e uma plataforma de monitoramento e seguranca de sistemas que permite:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Gerenciamento de agentes de monitoramento em servidores</li>
                <li>Deteccao de malware atraves de integracao com VirusTotal</li>
                <li>Analise de logs e relatorios de seguranca</li>
                <li>Sistema de alertas e notificacoes</li>
                <li>Gerenciamento multi-tenant com controle de acesso baseado em roles</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">3. Cadastro e Conta</h2>
              <p>
                Para usar o Servico, voce deve:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Fornecer informacoes precisas e completas durante o registro</li>
                <li>Manter a confidencialidade de suas credenciais de acesso</li>
                <li>Notificar imediatamente sobre qualquer uso nao autorizado de sua conta</li>
                <li>Ter no minimo 18 anos de idade ou ser uma entidade legal valida</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">4. Uso Aceitavel</h2>
              <p>
                Voce concorda em NAO:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Usar o Servico para qualquer finalidade ilegal ou nao autorizada</li>
                <li>Tentar obter acesso nao autorizado a outros sistemas</li>
                <li>Interferir ou interromper o Servico ou servidores conectados</li>
                <li>Transmitir virus, malware ou codigo malicioso</li>
                <li>Violar direitos de propriedade intelectual</li>
                <li>Fazer engenharia reversa do software</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">5. Planos e Pagamento</h2>
              <p>
                O Servico oferece diferentes planos de assinatura:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Os precos estao sujeitos a alteracoes mediante aviso previo de 30 dias</li>
                <li>As cobrancas sao processadas atraves do Stripe</li>
                <li>Reembolsos sao concedidos de acordo com nossa politica de reembolso</li>
                <li>O cancelamento pode ser feito a qualquer momento</li>
                <li>Apos o cancelamento, o acesso permanece ativo ate o fim do periodo pago</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">6. Propriedade Intelectual</h2>
              <p>
                Todo o conteudo, recursos e funcionalidades do Servico sao de propriedade exclusiva do CyberShield 
                e sao protegidos por leis de direitos autorais, marcas registradas e outras leis de propriedade intelectual.
              </p>

              <h2 className="text-2xl font-semibold mt-6">7. Protecao de Dados</h2>
              <p>
                Coletamos e processamos dados pessoais de acordo com nossa{' '}
                <Link to="/privacy" className="text-primary hover:underline">
                  Politica de Privacidade
                </Link>{' '}
                e em conformidade com a LGPD (Lei Geral de Protecao de Dados) e GDPR.
              </p>

              <h2 className="text-2xl font-semibold mt-6">8. Limitacao de Responsabilidade</h2>
              <p>
                O Servico e fornecido "como esta". Nao garantimos que:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>O Servico sera ininterrupto ou livre de erros</li>
                <li>Os resultados obtidos serao precisos ou confiaveis</li>
                <li>Todos os malwares serao detectados</li>
              </ul>
              <p className="mt-4">
                Em nenhum caso seremos responsaveis por danos indiretos, incidentais, especiais ou consequenciais 
                decorrentes do uso ou incapacidade de usar o Servico.
              </p>

              <h2 className="text-2xl font-semibold mt-6">9. Rescisao</h2>
              <p>
                Podemos suspender ou encerrar sua conta imediatamente, sem aviso previo, por:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Violacao destes Termos de Servico</li>
                <li>Atividades fraudulentas ou ilegais</li>
                <li>Falta de pagamento</li>
                <li>Solicitacao sua de encerramento</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">10. Modificacoes</h2>
              <p>
                Reservamo-nos o direito de modificar estes termos a qualquer momento. Notificaremos os usuarios 
                sobre mudancas significativas por e-mail ou atraves do Servico. O uso continuado apos as 
                modificacoes constitui aceitacao dos novos termos.
              </p>

              <h2 className="text-2xl font-semibold mt-6">11. Lei Aplicavel</h2>
              <p>
                Estes termos sao regidos pelas leis do Brasil. Quaisquer disputas serao resolvidas nos 
                tribunais brasileiros.
              </p>

              <h2 className="text-2xl font-semibold mt-6">12. Contato</h2>
              <p>
                Para questoes sobre estes Termos de Servico, entre em contato:
              </p>
              <ul className="list-none pl-0 space-y-2">
                <li><strong>Email:</strong> legal@cybershield.com</li>
                <li><strong>Suporte:</strong> support@cybershield.com</li>
              </ul>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
