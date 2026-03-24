import { Loader2, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Platform, PreviewCredentials } from "../types";

interface AgentConfigStepProps {
  agentName: string;
  setAgentName: (name: string) => void;
  platform: Platform;
  setPlatform: (p: Platform) => void;
  agentNameError: string;
  isCheckingName: boolean;
  isGenerating: boolean;
  exeBuildStatus: string;
  previewCredentials: PreviewCredentials | null;
}

export const AgentConfigStep = ({
  agentName, setAgentName, platform, setPlatform,
  agentNameError, isCheckingName, isGenerating, exeBuildStatus,
  previewCredentials,
}: AgentConfigStepProps) => {
  const isDisabled = isGenerating || exeBuildStatus === 'building';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-full w-8 h-8 flex items-center justify-center">1</Badge>
          Configurar Agente
        </CardTitle>
        <CardDescription>Defina um nome unico e escolha a plataforma</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="agentName">Nome do Agente</Label>
          <div className="relative">
            <Input
              id="agentName"
              data-testid="agent-name-input"
              placeholder="ex: servidor-web-01"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              disabled={isDisabled}
              className={agentNameError && agentNameError.startsWith('[ERROR] ') ? 'border-destructive' : ''}
            />
            {isCheckingName && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" data-testid="name-checking-spinner" />
            )}
          </div>
          {agentNameError && (
            <p
              data-testid={agentNameError.startsWith('[OK] ') ? 'validation-success' : 'validation-error'}
              className={`text-sm mt-1 ${agentNameError.startsWith('[OK] ') ? 'text-green-600' : 'text-destructive'}`}
            >
              {agentNameError}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Plataforma</Label>
          <RadioGroup value={platform} onValueChange={(v) => setPlatform(v as Platform)} disabled={isDisabled} data-testid="platform-selector">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="windows" id="windows" data-testid="platform-windows" />
              <Label htmlFor="windows" className="cursor-pointer">Windows (PowerShell)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="linux" id="linux" data-testid="platform-linux" />
              <Label htmlFor="linux" className="cursor-pointer">Linux (Bash)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="macos" id="macos" data-testid="platform-macos" />
              <Label htmlFor="macos" className="cursor-pointer flex items-center gap-2">
                <span>?</span> macOS (Bash)
              </Label>
            </div>
          </RadioGroup>
        </div>

        {previewCredentials && (
          <Alert className="bg-green-50 dark:bg-green-950/30 border-green-500/50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-700 dark:text-green-300">✅ Credenciais Prontas!</AlertTitle>
            <AlertDescription className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Válidas por 24 horas</span>
              </div>
              <div className="text-xs text-muted-foreground">Após 24h, você precisará gerar novas credenciais</div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
