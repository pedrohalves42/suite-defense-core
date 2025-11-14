import { CheckCircle2, Clock, ExternalLink, Loader2, Terminal, Upload, Zap } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type BuildProgressStep = 'preparing' | 'dispatching' | 'compiling' | 'uploading' | 'completed';

interface BuildProgressState {
  currentStep: BuildProgressStep;
  status: 'pending' | 'active' | 'completed' | 'error';
  message: string;
  githubRunUrl?: string;
}

interface BuildProgressIndicatorProps {
  progress: BuildProgressState;
}

export const BuildProgressIndicator = ({ progress }: BuildProgressIndicatorProps) => {
  const steps: Array<{ key: BuildProgressStep; icon: any; label: string; description: string }> = [
    { key: 'preparing', icon: Zap, label: 'Preparando', description: 'Gerando credenciais' },
    { key: 'dispatching', icon: ExternalLink, label: 'Disparando Build', description: 'Enviando para GitHub Actions' },
    { key: 'compiling', icon: Terminal, label: 'Compilando EXE', description: 'Convertendo PS1 → EXE (2-3 min)' },
    { key: 'uploading', icon: Upload, label: 'Enviando Arquivo', description: 'Upload para storage' },
    { key: 'completed', icon: CheckCircle2, label: 'Concluído', description: 'Pronto para download' },
  ];

  const currentStepIndex = steps.findIndex(s => s.key === progress.currentStep);

  return (
    <Card className="border-2 border-blue-500 bg-blue-50/50 dark:bg-blue-950/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
          <Loader2 className={`h-5 w-5 ${progress.status === 'active' ? 'animate-spin' : ''}`} />
          Build em Progresso
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Timeline vertical */}
        <div className="space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStepIndex;
            const isCompleted = index < currentStepIndex;
            const isPending = index > currentStepIndex;

            return (
              <div key={step.key} className="flex items-start gap-4">
                {/* Ícone de status */}
                <div className={`
                  flex items-center justify-center w-10 h-10 rounded-full border-2 flex-shrink-0
                  ${isCompleted ? 'bg-green-500 border-green-500 text-white' : ''}
                  ${isActive ? 'bg-blue-500 border-blue-500 text-white animate-pulse' : ''}
                  ${isPending ? 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400' : ''}
                `}>
                  <Icon className="h-5 w-5" />
                </div>

                {/* Label e status */}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                    {step.label}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                  {isActive && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium">
                      {progress.message}
                    </p>
                  )}
                </div>

                {/* Badge de status */}
                <div className="flex-shrink-0">
                  {isCompleted && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">✓</Badge>}
                  {isActive && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 animate-pulse">Em andamento</Badge>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Link do GitHub Actions */}
        {progress.githubRunUrl && (
          <Alert className="mt-4 bg-white dark:bg-gray-900">
            <ExternalLink className="h-4 w-4" />
            <AlertTitle className="text-sm font-semibold">Acompanhar no GitHub</AlertTitle>
            <AlertDescription>
              <a 
                href={progress.githubRunUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm flex items-center gap-1 mt-1"
              >
                Ver logs completos do build no GitHub Actions →
              </a>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
