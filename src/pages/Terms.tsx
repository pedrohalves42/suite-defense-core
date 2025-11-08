import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield } from 'lucide-react';

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
                <CardTitle className="text-3xl">Termos de Serviço</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Última atualização: {new Date().toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold mt-6">1. Aceitação dos Termos</h2>
              <p>
                Ao acessar e usar o CyberShield ("Serviço"), você concorda em cumprir e estar vinculado aos seguintes 
                termos e condições de uso. Se você não concordar com qualquer parte destes termos, não utilize o Serviço.
              </p>

              <h2 className="text-2xl font-semibold mt-6">2. Descrição do Serviço</h2>
              <p>
                O CyberShield é uma plataforma de monitoramento e segurança de sistemas que permite:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Gerenciamento de agentes de monitoramento em servidores</li>
                <li>Detecção de malware através de integração com VirusTotal</li>
                <li>Análise de logs e relatórios de segurança</li>
                <li>Sistema de alertas e notificações</li>
                <li>Gerenciamento multi-tenant com controle de acesso baseado em roles</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">3. Cadastro e Conta</h2>
              <p>
                Para usar o Serviço, você deve:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Fornecer informações precisas e completas durante o registro</li>
                <li>Manter a confidencialidade de suas credenciais de acesso</li>
                <li>Notificar imediatamente sobre qualquer uso não autorizado de sua conta</li>
                <li>Ter no mínimo 18 anos de idade ou ser uma entidade legal válida</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">4. Uso Aceitável</h2>
              <p>
                Você concorda em NÃO:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Usar o Serviço para qualquer finalidade ilegal ou não autorizada</li>
                <li>Tentar obter acesso não autorizado a outros sistemas</li>
                <li>Interferir ou interromper o Serviço ou servidores conectados</li>
                <li>Transmitir vírus, malware ou código malicioso</li>
                <li>Violar direitos de propriedade intelectual</li>
                <li>Fazer engenharia reversa do software</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">5. Planos e Pagamento</h2>
              <p>
                O Serviço oferece diferentes planos de assinatura:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Os preços estão sujeitos a alterações mediante aviso prévio de 30 dias</li>
                <li>As cobranças são processadas através do Stripe</li>
                <li>Reembolsos são concedidos de acordo com nossa política de reembolso</li>
                <li>O cancelamento pode ser feito a qualquer momento</li>
                <li>Após o cancelamento, o acesso permanece ativo até o fim do período pago</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">6. Propriedade Intelectual</h2>
              <p>
                Todo o conteúdo, recursos e funcionalidades do Serviço são de propriedade exclusiva do CyberShield 
                e são protegidos por leis de direitos autorais, marcas registradas e outras leis de propriedade intelectual.
              </p>

              <h2 className="text-2xl font-semibold mt-6">7. Proteção de Dados</h2>
              <p>
                Coletamos e processamos dados pessoais de acordo com nossa{' '}
                <Link to="/privacy" className="text-primary hover:underline">
                  Política de Privacidade
                </Link>{' '}
                e em conformidade com a LGPD (Lei Geral de Proteção de Dados) e GDPR.
              </p>

              <h2 className="text-2xl font-semibold mt-6">8. Limitação de Responsabilidade</h2>
              <p>
                O Serviço é fornecido "como está". Não garantimos que:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>O Serviço será ininterrupto ou livre de erros</li>
                <li>Os resultados obtidos serão precisos ou confiáveis</li>
                <li>Todos os malwares serão detectados</li>
              </ul>
              <p className="mt-4">
                Em nenhum caso seremos responsáveis por danos indiretos, incidentais, especiais ou consequenciais 
                decorrentes do uso ou incapacidade de usar o Serviço.
              </p>

              <h2 className="text-2xl font-semibold mt-6">9. Rescisão</h2>
              <p>
                Podemos suspender ou encerrar sua conta imediatamente, sem aviso prévio, por:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Violação destes Termos de Serviço</li>
                <li>Atividades fraudulentas ou ilegais</li>
                <li>Falta de pagamento</li>
                <li>Solicitação sua de encerramento</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">10. Modificações</h2>
              <p>
                Reservamo-nos o direito de modificar estes termos a qualquer momento. Notificaremos os usuários 
                sobre mudanças significativas por e-mail ou através do Serviço. O uso continuado após as 
                modificações constitui aceitação dos novos termos.
              </p>

              <h2 className="text-2xl font-semibold mt-6">11. Lei Aplicável</h2>
              <p>
                Estes termos são regidos pelas leis do Brasil. Quaisquer disputas serão resolvidas nos 
                tribunais brasileiros.
              </p>

              <h2 className="text-2xl font-semibold mt-6">12. Contato</h2>
              <p>
                Para questões sobre estes Termos de Serviço, entre em contato:
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
