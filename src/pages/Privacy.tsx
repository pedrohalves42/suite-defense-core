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
                <CardTitle className="text-3xl">Politica de Privacidade</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Ultima atualizacao: {new Date().toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            <section className="space-y-4">
              <p className="text-lg">
                Esta Politica de Privacidade descreve como o CyberShield coleta, usa e protege suas informacoes 
                pessoais em conformidade com a LGPD (Lei Geral de Protecao de Dados) e GDPR.
              </p>

              <h2 className="text-2xl font-semibold mt-6">1. Informacoes que Coletamos</h2>
              
              <h3 className="text-xl font-semibold mt-4">1.1 Dados de Cadastro</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Nome completo:</strong> Para identificacao pessoal</li>
                <li><strong>E-mail:</strong> Para autenticacao e comunicacao</li>
                <li><strong>Senha:</strong> Armazenada de forma criptografada (hash)</li>
                <li><strong>Tenant/Organizacao:</strong> Para isolamento multi-tenant</li>
              </ul>

              <h3 className="text-xl font-semibold mt-4">1.2 Dados de Uso</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Endereco IP:</strong> Para seguranca e auditoria</li>
                <li><strong>User Agent:</strong> Informacoes do navegador</li>
                <li><strong>Logs de atividade:</strong> Acoes realizadas no sistema</li>
                <li><strong>Timestamps:</strong> Horario de acesso e acoes</li>
              </ul>

              <h3 className="text-xl font-semibold mt-4">1.3 Dados Tecnicos</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Informacoes de agentes:</strong> Nome, status, heartbeat</li>
                <li><strong>Hashes de arquivos:</strong> Para analise de malware</li>
                <li><strong>Relatorios de seguranca:</strong> Logs e scans de virus</li>
                <li><strong>Jobs e tarefas:</strong> Historico de execucao</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">2. Como Usamos Seus Dados</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Autenticacao e autorizacao:</strong> Controle de acesso ao sistema</li>
                <li><strong>Prestacao do servico:</strong> Monitoramento e analise de seguranca</li>
                <li><strong>Comunicacao:</strong> Alertas, notificacoes e suporte</li>
                <li><strong>Auditoria:</strong> Rastreamento de acoes para seguranca</li>
                <li><strong>Melhorias:</strong> Analise de uso para aprimorar o servico</li>
                <li><strong>Compliance:</strong> Atendimento a obrigacoes legais</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">3. Base Legal (LGPD/GDPR)</h2>
              <p>Processamos seus dados com base em:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Consentimento:</strong> Ao aceitar esta politica</li>
                <li><strong>Execucao de contrato:</strong> Para prestar o servico contratado</li>
                <li><strong>Legitimo interesse:</strong> Seguranca e prevencao de fraudes</li>
                <li><strong>Obrigacao legal:</strong> Cumprimento de leis aplicaveis</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">4. Compartilhamento de Dados</h2>
              <p>Seus dados podem ser compartilhados com:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>VirusTotal:</strong> Hashes de arquivos para analise de malware (quando habilitado)</li>
                <li><strong>Stripe:</strong> Informacoes de pagamento (processadas por eles, nao armazenamos)</li>
                <li><strong>Resend:</strong> Servico de e-mail para notificacoes</li>
                <li><strong>Autoridades:</strong> Quando exigido por lei</li>
              </ul>
              <p className="mt-4">
                <strong>Importante:</strong> Nunca vendemos seus dados pessoais a terceiros.
              </p>

              <h2 className="text-2xl font-semibold mt-6">5. Armazenamento e Seguranca</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Criptografia:</strong> Senhas com hash bcrypt, HTTPS para transmissao</li>
                <li><strong>Row Level Security (RLS):</strong> Isolamento de dados por tenant</li>
                <li><strong>Controle de acesso:</strong> Roles (Admin, Operator, Viewer)</li>
                <li><strong>Auditoria:</strong> Logs completos de todas as acoes sensiveis</li>
                <li><strong>Backups:</strong> Backups regulares e seguros</li>
                <li><strong>Localizacao:</strong> Servidores em data centers com certificacao ISO</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">6. Retencao de Dados</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Dados de conta:</strong> Enquanto a conta estiver ativa</li>
                <li><strong>Logs de auditoria:</strong> 12 meses</li>
                <li><strong>Relatorios de seguranca:</strong> 24 meses</li>
                <li><strong>Dados de pagamento:</strong> Conforme exigido por lei (7 anos)</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">7. Seus Direitos (LGPD/GDPR)</h2>
              <p>Voce tem direito a:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Acesso:</strong> Solicitar copia de seus dados</li>
                <li><strong>Retificacao:</strong> Corrigir dados incorretos</li>
                <li><strong>Exclusao:</strong> Solicitar remocao de seus dados</li>
                <li><strong>Portabilidade:</strong> Exportar seus dados em formato estruturado</li>
                <li><strong>Revogacao:</strong> Retirar consentimento a qualquer momento</li>
                <li><strong>Oposicao:</strong> Opor-se ao processamento em certas situacoes</li>
                <li><strong>Limitacao:</strong> Solicitar restricao do processamento</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">8. Cookies e Armazenamento Local</h2>
              <p>Utilizamos:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Cookies essenciais:</strong> Para autenticacao e funcionamento do sistema</li>
                <li><strong>LocalStorage:</strong> Para manter sessao ativa e preferencias</li>
                <li><strong>Cookies de analise:</strong> Para entender o uso do sistema (apenas com consentimento)</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">9. Transferencia Internacional</h2>
              <p>
                Seus dados podem ser processados em servidores localizados fora do Brasil. Garantimos protecao 
                adequada atraves de:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Clausulas contratuais padrao</li>
                <li>Adequacao do pais ao nivel de protecao brasileiro</li>
                <li>Consentimento explicito quando necessario</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">10. Menores de Idade</h2>
              <p>
                O CyberShield nao e destinado a menores de 18 anos. Nao coletamos intencionalmente dados de 
                menores. Se identificarmos tal coleta, os dados serao excluidos imediatamente.
              </p>

              <h2 className="text-2xl font-semibold mt-6">11. Alteracoes nesta Politica</h2>
              <p>
                Podemos atualizar esta politica periodicamente. Notificaremos sobre mudancas significativas por 
                e-mail ou atraves do sistema. Recomendamos revisar esta pagina regularmente.
              </p>

              <h2 className="text-2xl font-semibold mt-6">12. Encarregado de Dados (DPO)</h2>
              <p>
                Para exercer seus direitos ou esclarecer duvidas sobre privacidade:
              </p>
              <ul className="list-none pl-0 space-y-2">
                <li><strong>Email:</strong> dpo@cybershield.com</li>
                <li><strong>Prazo de resposta:</strong> Ate 15 dias uteis</li>
              </ul>

              <h2 className="text-2xl font-semibold mt-6">13. Autoridade Nacional</h2>
              <p>
                Voce tem direito de registrar reclamacao junto a ANPD (Autoridade Nacional de Protecao de Dados):
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
                      Levamos sua privacidade a serio. Se tiver duvidas ou preocupacoes, entre em contato 
                      conosco atraves de privacy@cybershield.com
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
