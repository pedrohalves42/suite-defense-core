import { Loader2, Terminal, Download, Copy, Zap, FileCheck, Shield, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import type { Platform, ExeBuildStatus } from "../types";
import { CardDescription } from "@/components/ui/card";

interface InstallMethodTabsProps {
  platform: Platform;
  isNameValid: boolean;
  isGenerating: boolean;
  isValidatingPs1: boolean;
  circuitBreakerOpen: boolean;
  installCommand: string;
  lastEnrollmentKey: string | null;
  exeBuildStatus: ExeBuildStatus;
  exeDownloadUrl: string | null;
  exeFileSize: number | null;
  exeSha256: string | null;
  ps1Sha256: string | null;
  ps1SizeBytes: number | null;
  onGenerateCommand: () => void;
  onGenerateInstaller: () => void;
  onDownloadAndVerifyScript: (key: string, platform: Platform) => void;
  onGeneratePortable: () => void;
  onCopyCommand: () => void;
}

export const InstallMethodTabs = ({
  platform, isNameValid, isGenerating, isValidatingPs1, circuitBreakerOpen,
  installCommand, lastEnrollmentKey, exeBuildStatus, exeDownloadUrl, exeFileSize, exeSha256,
  ps1Sha256, ps1SizeBytes,
  onGenerateCommand, onGenerateInstaller, onDownloadAndVerifyScript,
  onGeneratePortable, onCopyCommand,
}: InstallMethodTabsProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Badge variant="outline" className="rounded-full w-8 h-8 flex items-center justify-center">2</Badge>
        Escolher Metodo de Instalacao
      </CardTitle>
      <CardDescription>Selecione como deseja instalar o agente no servidor</CardDescription>
    </CardHeader>
    <CardContent>
      <Tabs defaultValue="one-click" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="one-click" className="relative">
            <Zap className="h-4 w-4 mr-2" />
            Comando Rápido
            <Badge className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0.5 bg-green-500 text-white border-0">Recomendado</Badge>
          </TabsTrigger>
          <TabsTrigger value="download"><Download className="h-4 w-4 mr-2" />Baixar Script</TabsTrigger>
          <TabsTrigger value="exe-build"><FileCheck className="h-4 w-4 mr-2" />Gerar EXE</TabsTrigger>
        </TabsList>

        {/* One-Click Tab */}
        <TabsContent value="one-click" className="space-y-4 mt-4">
          <Alert className="bg-green-50/50 dark:bg-green-950/20 border-green-500/30">
            <Zap className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-700 dark:text-green-300">⚡ Ideal para servidores com internet</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Pronto em segundos. Cole no PowerShell/Terminal como Administrador. Válido por 24h.
            </AlertDescription>
          </Alert>

          {platform === 'macos' && (
            <Alert className="mt-4">
              <Terminal className="h-4 w-4" />
              <AlertTitle>Instrucoes para macOS</AlertTitle>
              <AlertDescription className="space-y-2 text-sm">
                <ol className="list-decimal list-inside space-y-2">
                  <li><strong>Abra o Terminal</strong> no macOS</li>
                  <li><strong>Execute o comando gerado</strong> com <code className="bg-muted px-1 rounded">sudo</code></li>
                  <li>O instalador criara um <strong>LaunchDaemon</strong></li>
                  <li>Verifique: <code className="bg-muted px-1 rounded">launchctl list | grep cybershield</code></li>
                </ol>
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={onGenerateCommand} disabled={!isNameValid || isGenerating || circuitBreakerOpen} className="w-full" data-testid="generate-command-btn">
            {isGenerating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</> : <><Terminal className="h-4 w-4 mr-2" />Gerar Comando</>}
          </Button>

          {installCommand && (
            <div className="space-y-2" data-testid="install-command-container">
              <Label>Comando de Instalacao</Label>
              <div className="flex gap-2">
                <Input value={installCommand} readOnly className="font-mono text-xs" data-testid="install-command" />
                <Button onClick={onCopyCommand} variant="outline" size="icon" data-testid="copy-command-btn">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Cole este comando no terminal do servidor como administrador</p>
            </div>
          )}
        </TabsContent>

        {/* Download Tab */}
        <TabsContent value="download" className="space-y-4 mt-4">
          <Alert className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-500/30">
            <Download className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-700 dark:text-blue-300">💾 Para instalação em redes isoladas</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Baixe o script e transfira via USB ou rede interna.
            </AlertDescription>
          </Alert>

          {lastEnrollmentKey && (
            <Card className="border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-600" />Seguranca Validada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs space-y-1">
                  {['SHA256 sera validado automaticamente', 'Download bloqueado se hash nao corresponder', 'Integridade verificada em tempo real'].map(text => (
                    <div key={text} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3 w-3 text-green-600" /><span>{text}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            onClick={() => lastEnrollmentKey ? onDownloadAndVerifyScript(lastEnrollmentKey, platform) : onGenerateInstaller()}
            disabled={!isNameValid || isGenerating || isValidatingPs1 || circuitBreakerOpen}
            className="w-full"
          >
            {isValidatingPs1 ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verificando Integridade...</>
              : isGenerating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</>
              : <><Download className="h-4 w-4 mr-2" />Baixar Script {platform === 'windows' ? '(.PS1)' : '(.SH)'} com Validacao SHA256</>}
          </Button>

          {ps1Sha256 && (
            <div className="mt-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
              <p className="text-sm text-green-800 dark:text-green-200 font-mono flex items-center justify-between">
                <span className="flex items-center">
                  <Shield className="mr-2 h-4 w-4" />
                  SHA256: {ps1Sha256.slice(0, 16)}...{ps1Sha256.slice(-16)}
                </span>
                <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(ps1Sha256); toast.success("Hash copiado"); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                [OK]  Integridade verificada ({(ps1SizeBytes! / 1024).toFixed(2)} KB) - {platform === 'windows' ? 'Windows PowerShell' : 'Linux Bash'}
              </p>
            </div>
          )}
        </TabsContent>

        {/* EXE Build Tab */}
        <TabsContent value="exe-build" className="space-y-4 mt-4">
          <Alert className="bg-purple-50/50 dark:bg-purple-950/20 border-purple-500/30">
            <FileCheck className="h-4 w-4 text-purple-600" />
            <AlertTitle className="text-purple-700 dark:text-purple-300">🖥️ Instalador Portátil para Windows</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Arquivo .CMD auto-executável. Geração instantânea.
            </AlertDescription>
          </Alert>

          <Button
            onClick={onGeneratePortable}
            disabled={!isNameValid || exeBuildStatus === 'building' || circuitBreakerOpen}
            className="w-full"
            size="lg"
          >
            {exeBuildStatus === 'building' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</>
              : exeBuildStatus === 'completed' ? <><CheckCircle2 className="h-5 w-5 mr-2" />Instalador Pronto!</>
              : <><Zap className="h-5 w-5 mr-2" />Gerar Instalador Portátil (instantâneo)</>}
          </Button>
          <p className="text-sm text-muted-foreground text-center">Gera credenciais e cria instalador auto-executável em segundos</p>

          {exeBuildStatus === 'completed' && exeDownloadUrl && (
            <div className="mt-4 p-4 border rounded-lg bg-green-50/50 dark:bg-green-950/20 border-green-500/30 space-y-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">Instalador gerado com sucesso!</span>
              </div>
              <Button onClick={() => window.open(exeDownloadUrl, '_blank')} className="w-full" variant="default">
                <Download className="h-4 w-4 mr-2" />Baixar Instalador (.cmd)
              </Button>
              {exeFileSize && <p className="text-xs text-muted-foreground">Tamanho: {(exeFileSize / 1024).toFixed(0)} KB</p>}
              {exeSha256 && (
                <div className="text-xs font-mono bg-muted/50 p-2 rounded break-all">
                  <span className="text-muted-foreground">SHA256: </span>{exeSha256}
                </div>
              )}
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription className="text-xs">Execute como Administrador no servidor de destino.</AlertDescription>
              </Alert>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </CardContent>
  </Card>
);
