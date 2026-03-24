import { AlertTriangle, CheckCircle2, Clock, Copy, ExternalLink, HelpCircle, BookOpen, RefreshCw, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BuildProgressIndicator } from "@/components/BuildProgressIndicator";
import { toast } from "sonner";
import type { BuildProgressState, ExeBuildStatus } from "../types";

interface BuildStatusStepProps {
  exeBuildStatus: ExeBuildStatus;
  buildProgress: BuildProgressState;
  exeDownloadUrl: string | null;
  exeSha256: string | null;
  exeFileSize: number | null;
  githubActionsUrl: string | null;
  retryCount: number;
  onRefreshBuildStatus: () => void;
  onDownloadAndVerifyExe: () => void;
  onRetryBuild: () => void;
}

export const BuildStatusStep = ({
  exeBuildStatus, buildProgress, exeDownloadUrl, exeSha256, exeFileSize,
  githubActionsUrl, retryCount,
  onRefreshBuildStatus, onDownloadAndVerifyExe, onRetryBuild,
}: BuildStatusStepProps) => {
  if (exeBuildStatus === 'idle') return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-full w-8 h-8 flex items-center justify-center">3</Badge>
          Status do Build
        </CardTitle>
        <CardDescription>Acompanhe o progresso da geracao do executavel</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {exeBuildStatus === 'building' && (
          <div className="space-y-3">
            <BuildProgressIndicator progress={buildProgress} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Monitorando via Realtime...</span>
              <Button onClick={onRefreshBuildStatus} variant="ghost" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />Atualizar
              </Button>
            </div>
            {buildProgress.currentStep === 'compiling' && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertTitle>Build em Andamento</AlertTitle>
                <AlertDescription>O build geralmente leva 2-3 minutos.</AlertDescription>
              </Alert>
            )}
            {exeBuildStatus !== 'building' && exeBuildStatus !== 'completed' && (
              <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
                    <AlertTriangle className="h-5 w-5" />Build Falhando? Compile Manualmente
                  </CardTitle>
                  <CardDescription>Se o build automatico nao funcionar, compile localmente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Baixe o script PS1 na aba "Download Manual"</li>
                    <li>Instale ps2exe: <code className="block mt-1 p-2 bg-white dark:bg-gray-900 rounded text-xs font-mono">Install-Module -Name ps2exe -Force</code></li>
                    <li>Compile: <code className="block mt-1 p-2 bg-white dark:bg-gray-900 rounded text-xs font-mono">ps2exe -InputFile installer.ps1 -OutputFile installer.exe -requireAdmin</code></li>
                    <li>Execute como administrador</li>
                  </ol>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => window.open('/docs/BUILD_WINDOWS_INSTALLER.md', '_blank')}>
                    <BookOpen className="mr-2 h-4 w-4" />Ver guia completo
                  </Button>
                  <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                    <HelpCircle className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-800 dark:text-blue-200">Dica</AlertTitle>
                    <AlertDescription className="text-blue-700 dark:text-blue-300 text-xs">
                      Compilacao manual util para ambientes offline.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {exeBuildStatus === 'completed' && (
          <Alert id="exe-download" className="border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800 dark:text-green-200">[OK]  Build Concluido com Seguranca!</AlertTitle>
            <AlertDescription className="space-y-3">
              <div className="space-y-2 p-3 bg-green-100 dark:bg-green-900 rounded-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-green-800 dark:text-green-200">? Verificacao de Integridade</span>
                  <Badge variant="outline" className="bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 border-green-400">SHA-256</Badge>
                </div>
                <div className="space-y-1 text-xs text-green-700 dark:text-green-300 font-mono">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{exeSha256?.slice(0, 32)}...</span>
                    <Button onClick={() => { navigator.clipboard.writeText(exeSha256!); toast.success("Hash copiado!"); }} variant="ghost" size="sm" className="h-6 px-2">
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div>Tamanho: <strong>{(exeFileSize! / 1024 / 1024).toFixed(2)} MB</strong></div>
                </div>
                <p className="text-xs text-green-600 dark:text-green-400 italic">O download sera validado automaticamente</p>
              </div>
              <Button onClick={onDownloadAndVerifyExe} className="w-full bg-green-600 hover:bg-green-700">
                <Shield className="h-4 w-4 mr-2" />Download Seguro com Validacao SHA-256
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {exeBuildStatus === 'failed' && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Build Falhou</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{retryCount > 0 ? `Falhou apos ${retryCount} tentativa(s)` : 'Ocorreu um erro durante a compilacao.'}</p>
              {githubActionsUrl && (
                <Button onClick={() => window.open(githubActionsUrl, '_blank')} variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-2" />Ver Logs
                </Button>
              )}
              <Button onClick={onRetryBuild} variant="outline" size="sm" className="w-full">Tentar Novamente</Button>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
