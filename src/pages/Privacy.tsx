import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Lock } from 'lucide-react';

export default function Privacy() {
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
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-3xl">Política de Privacidade</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Última atualização: {new Date().toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            <section className="space-y-4">
              <p className="text-lg">
                Esta Política de Privacidade descreve como o CyberShield coleta, usa e protege suas informações 
                pessoais em conformidade com a LGPD (Lei Geral de Proteção de Dados) e GDPR.
              </p>

              <h2 className="text-2xl font-semibold mt-6">1. Informações que Coletamos</h2>
              
              <h3 className="text-xl font-semibold mt-4">1.1 Dados de Cadastro</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Nome completo:</strong> Para identificação pessoal</li>
                <li><strong>E-mail:</strong> Para autenticação e comunicação</li>
                <li><strong>Senha:</strong> Armazenada de forma criptografada (hash)</li>
                <li><strong>Tenant/Organização:</strong> Para isolamento multi-tenant</li>
              </ul>

              <h3 className="text-xl font-semibold mt-4">1.2 Dados de Uso</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Endereço IP:</strong> Para segurança e auditoria</li>
                <li><strong>User Agent:</strong> Informações do navegador</li>
                <li><strong>Logs de atividade:</strong> Ações realizadas no sistema</li>
                <li><strong>Timestamps:</strong> Horário de acesso e ações</li>
              </ul>

              <h3 className="text-xl font-semibold mt-4">1.3 Dados Técnicos</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Informações de agentes:</strong> Nome, status, heartbeat</li>
                <li><strong>Hashes de arquivos:</strong> Para análise de malware</li>
                <li><strong>Relatórios de segurança:</strong> Logs e scans de vírus</li>
                <li><strong>Jobs e tarefas:</strong> Histórico de execução</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">2. Como Usamos Seus Dados</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Autenticação e autorização:</strong> Controle de acesso ao sistema</li>
                <li><strong>Prestação do serviço:</strong> Monitoramento e análise de segurança</li>
                <li><strong>Comunicação:</strong> Alertas, notificações e suporte</li>
                <li><strong>Auditoria:</strong> Rastreamento de ações para segurança</li>
                <li><strong>Melhorias:</strong> Análise de uso para aprimorar o serviço</li>
                <li><strong>Compliance:</strong> Atendimento a obrigações legais</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">3. Base Legal (LGPD/GDPR)</h2>
              <p>Processamos seus dados com base em:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Consentimento:</strong> Ao aceitar esta política</li>
                <li><strong>Execução de contrato:</strong> Para prestar o serviço contratado</li>
                <li><strong>Legítimo interesse:</strong> Segurança e prevenção de fraudes</li>
                <li><strong>Obrigação legal:</strong> Cumprimento de leis aplicáveis</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">4. Compartilhamento de Dados</h2>
              <p>Seus dados podem ser compartilhados com:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>VirusTotal:</strong> Hashes de arquivos para análise de malware (quando habilitado)</li>
                <li><strong>Stripe:</strong> Informações de pagamento (processadas por eles, não armazenamos)</li>
                <li><strong>Resend:</strong> Serviço de e-mail para notificações</li>
                <li><strong>Autoridades:</strong> Quando exigido por lei</li>
              </ul>
              <p className="mt-4">
                <strong>Importante:</strong> Nunca vendemos seus dados pessoais a terceiros.
              </p>

              <h2 className="text-2xl font-semibold mt-6">5. Armazenamento e Segurança</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Criptografia:</strong> Senhas com hash bcrypt, HTTPS para transmissão</li>
                <li><strong>Row Level Security (RLS):</strong> Isolamento de dados por tenant</li>
                <li><strong>Controle de acesso:</strong> Roles (Admin, Operator, Viewer)</li>
                <li><strong>Auditoria:</strong> Logs completos de todas as ações sensíveis</li>
                <li><strong>Backups:</strong> Backups regulares e seguros</li>
                <li><strong>Localização:</strong> Servidores em data centers com certificação ISO</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">6. Retenção de Dados</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Dados de conta:</strong> Enquanto a conta estiver ativa</li>
                <li><strong>Logs de auditoria:</strong> 12 meses</li>
                <li><strong>Relatórios de segurança:</strong> 24 meses</li>
                <li><strong>Dados de pagamento:</strong> Conforme exigido por lei (7 anos)</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">7. Seus Direitos (LGPD/GDPR)</h2>
              <p>Você tem direito a:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Acesso:</strong> Solicitar cópia de seus dados</li>
                <li><strong>Retificação:</strong> Corrigir dados incorretos</li>
                <li><strong>Exclusão:</strong> Solicitar remoção de seus dados</li>
                <li><strong>Portabilidade:</strong> Exportar seus dados em formato estruturado</li>
                <li><strong>Revogação:</strong> Retirar consentimento a qualquer momento</li>
                <li><strong>Oposição:</strong> Opor-se ao processamento em certas situações</li>
                <li><strong>Limitação:</strong> Solicitar restrição do processamento</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">8. Cookies e Armazenamento Local</h2>
              <p>Utilizamos:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Cookies essenciais:</strong> Para autenticação e funcionamento do sistema</li>
                <li><strong>LocalStorage:</strong> Para manter sessão ativa e preferências</li>
                <li><strong>Cookies de análise:</strong> Para entender o uso do sistema (apenas com consentimento)</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">9. Transferência Internacional</h2>
              <p>
                Seus dados podem ser processados em servidores localizados fora do Brasil. Garantimos proteção 
                adequada através de:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Cláusulas contratuais padrão</li>
                <li>Adequação do país ao nível de proteção brasileiro</li>
                <li>Consentimento explícito quando necessário</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">10. Menores de Idade</h2>
              <p>
                O CyberShield não é destinado a menores de 18 anos. Não coletamos intencionalmente dados de 
                menores. Se identificarmos tal coleta, os dados serão excluídos imediatamente.
              </p>

              <h2 className="text-2xl font-semibold mt-6">11. Alterações nesta Política</h2>
              <p>
                Podemos atualizar esta política periodicamente. Notificaremos sobre mudanças significativas por 
                e-mail ou através do sistema. Recomendamos revisar esta página regularmente.
              </p>

              <h2 className="text-2xl font-semibold mt-6">12. Encarregado de Dados (DPO)</h2>
              <p>
                Para exercer seus direitos ou esclarecer dúvidas sobre privacidade:
              </p>
              <ul className="list-none pl-0 space-y-2">
                <li><strong>Email:</strong> dpo@cybershield.com</li>
                <li><strong>Prazo de resposta:</strong> Até 15 dias úteis</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">13. Autoridade Nacional</h2>
              <p>
                Você tem direito de registrar reclamação junto à ANPD (Autoridade Nacional de Proteção de Dados):
              </p>
              <ul className="list-none pl-0 space-y-2">
                <li><strong>Website:</strong> www.gov.br/anpd</li>
              </ul>

              <div className="mt-8 p-4 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-foreground">Compromisso com a Privacidade</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Levamos sua privacidade a sério. Se tiver dúvidas ou preocupações, entre em contato 
                      conosco através de privacy@cybershield.com
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
