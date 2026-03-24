import { AlertTriangle, Loader2, RefreshCw, Terminal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { CircuitBreaker } from "@/lib/circuit-breaker";

interface InstallerAlertsProps {
  circuitBreakerOpen: boolean;
  isOnline: boolean;
  isRetrying: boolean;
  isRegenerated: boolean;
  agentName: string;
  enrollmentCircuitBreaker: CircuitBreaker;
  onNavigateToDiagnostics: () => void;
}

export const InstallerAlerts = ({
  circuitBreakerOpen, isOnline, isRetrying, isRegenerated,
  agentName, enrollmentCircuitBreaker, onNavigateToDiagnostics,
}: InstallerAlertsProps) => (
  <>
    {isRegenerated && (
      <Alert className="border-yellow-500/50 bg-yellow-500/10">
        <AlertTriangle className="h-5 w-5 text-yellow-500" />
        <AlertTitle className="text-yellow-600 dark:text-yellow-400">Credenciais Regeneradas</AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground space-y-3">
          <p>O agente <strong>{agentName}</strong> teve suas credenciais invalidadas.</p>
          <p>Gere um novo metodo de instalacao abaixo.</p>
          <Button variant="outline" size="sm" onClick={onNavigateToDiagnostics} className="gap-2">
            <Terminal className="h-3 w-3" />Voltar para Troubleshooting
          </Button>
        </AlertDescription>
      </Alert>
    )}

    {circuitBreakerOpen && (
      <Alert className="border-orange-500/50 bg-orange-500/10">
        <AlertTriangle className="h-4 w-4 text-orange-500" />
        <AlertTitle className="text-orange-600 dark:text-orange-400">⏸️ Pausado Temporariamente</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Servidor processando muitas requisições.</span>
          <Button size="sm" variant="outline" onClick={() => {
            enrollmentCircuitBreaker.reset();
            toast.success("Pronto para tentar novamente!");
            logger.info('Circuit breaker manually reset');
          }}>
            <RefreshCw className="h-4 w-4 mr-2" />🔄 Tentar Novamente
          </Button>
        </AlertDescription>
      </Alert>
    )}

    {!isOnline && (
      <Alert className="border-red-500/50 bg-red-500/10">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <AlertTitle className="text-red-600 dark:text-red-400">📴 Sem Internet</AlertTitle>
        <AlertDescription className="text-muted-foreground">Verificações pausadas até reconexão.</AlertDescription>
      </Alert>
    )}

    {isRetrying && isOnline && (
      <Alert>
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertTitle>Tentando Reconectar</AlertTitle>
        <AlertDescription>Houve uma falha na conexao. Tentando novamente...</AlertDescription>
      </Alert>
    )}
  </>
);
