import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Clock, AlertCircle, Copy, Heart } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { toast } from 'sonner';

interface AgentInstallationGuideProps {
  agent: {
    id: string;
    agent_name: string;
    enrolled_at: string;
    last_heartbeat: string | null;
    status: string;
  };
  hasPostInstallation?: boolean;
  installCommand?: string;
}

export default function AgentInstallationGuide({ 
  agent, 
  hasPostInstallation = false,
  installCommand 
}: AgentInstallationGuideProps) {
  const timeSinceEnrollment = Math.floor((Date.now() - new Date(agent.enrolled_at).getTime()) / 1000 / 60);
  const hasHeartbeat = !!agent.last_heartbeat;

  const copyCommand = () => {
    if (installCommand) {
      navigator.clipboard.writeText(installCommand);
      toast.success('Comando copiado!');
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Step 1: Installer Generated */}
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            <div className="flex-1">
              <div className="font-medium">1. Instalador Gerado</div>
              <div className="text-sm text-muted-foreground">
                {formatBrazilDateTime(agent.enrolled_at, 'full')}
              </div>
            </div>
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
              Completo
            </Badge>
          </div>

          {/* Step 2: Execute on Windows */}
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {hasPostInstallation ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <Clock className="h-5 w-5 text-yellow-500 animate-pulse" />
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium">2. Executar no Windows</div>
              {!hasPostInstallation ? (
                <div className="mt-2">
                  <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
                    <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    <AlertDescription className="text-sm text-yellow-800 dark:text-yellow-200">
                      <strong>Instalador ainda nao foi executado.</strong>
                      <ol className="mt-2 ml-4 list-decimal space-y-1">
                        <li>Abra <strong>PowerShell como Administrador</strong></li>
                        <li>Cole e execute o comando abaixo</li>
                        <li>Aguarde ~30-60 segundos</li>
                      </ol>
                      {installCommand && (
                        <Button
                          variant="cta"
                          size="sm"
                          className="mt-3 w-full"
                          onClick={copyCommand}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copiar Comando de Instalacao
                        </Button>
                      )}
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Instalacao concluida com sucesso
                </div>
              )}
            </div>
            <Badge 
              variant="secondary" 
              className={hasPostInstallation 
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" 
                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100"
              }
            >
              {hasPostInstallation ? 'Completo' : 'Pendente'}
            </Badge>
          </div>

          {/* Step 3: Waiting for Heartbeat */}
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {hasHeartbeat ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <Clock className="h-5 w-5 text-gray-400" />
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium">3. Aguardando Heartbeat</div>
              {!hasHeartbeat ? (
                <div className="text-sm text-muted-foreground">
                  {hasPostInstallation ? (
                    <>
                      Verificando conexao... ({timeSinceEnrollment}m decorridos)
                    </>
                  ) : (
                    'Aguardando execucao do instalador'
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Ultimo heartbeat: {formatBrazilDateTime(agent.last_heartbeat, 'full')}
                </div>
              )}
            </div>
            <Badge 
              variant="secondary" 
              className={hasHeartbeat 
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" 
                : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100"
              }
            >
              {hasHeartbeat ? 'Completo' : 'Pendente'}
            </Badge>
          </div>

          {/* Step 4: Agent Active */}
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {hasHeartbeat ? (
                <Heart className="h-5 w-5 text-red-500 animate-pulse" />
              ) : (
                <Clock className="h-5 w-5 text-gray-400" />
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium">4. Agente Ativo!</div>
              <div className="text-sm text-muted-foreground">
                {hasHeartbeat ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    ? Agente conectado e funcionando
                  </span>
                ) : (
                  'Aguardando ativacao'
                )}
              </div>
            </div>
            <Badge 
              variant="secondary" 
              className={hasHeartbeat 
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" 
                : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100"
              }
            >
              {hasHeartbeat ? 'Ativo' : 'Pendente'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
