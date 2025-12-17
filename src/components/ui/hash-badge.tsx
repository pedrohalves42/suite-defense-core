/**
 * HashBadge Component
 * 
 * Exibe hash SHA256/HMAC com:
 * - Valor truncado com tooltip do valor completo
 * - Botão copiar para verificação externa
 * - Indicador visual de integridade
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, Copy, Hash, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface HashBadgeProps {
  value: string;
  label?: string;
  variant?: "sha256" | "hmac";
  copyable?: boolean;
  showIcon?: boolean;
  truncateLength?: number;
  className?: string;
}

export function HashBadge({
  value,
  label,
  variant = "sha256",
  copyable = true,
  showIcon = true,
  truncateLength = 16,
  className,
}: HashBadgeProps) {
  const [copied, setCopied] = useState(false);

  const truncatedValue = value.length > truncateLength
    ? `${value.substring(0, truncateLength)}...`
    : value;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Hash copiado para área de transferência");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Erro ao copiar hash");
    }
  };

  const Icon = variant === "hmac" ? ShieldCheck : Hash;
  const badgeVariant = variant === "hmac" ? "default" : "secondary";

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-2", className)}>
        {label && (
          <span className="text-xs font-medium text-muted-foreground">
            {label}:
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={badgeVariant}
              className={cn(
                "font-mono text-xs cursor-default",
                variant === "sha256" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                variant === "hmac" && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
              )}
            >
              {showIcon && <Icon className="w-3 h-3 mr-1" />}
              {truncatedValue}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-md">
            <div className="space-y-2">
              <p className="text-xs font-medium">
                {variant === "sha256" ? "SHA256 (Integridade)" : "HMAC-SHA256 (Autoria)"}
              </p>
              <p className="font-mono text-xs break-all">{value}</p>
              <p className="text-xs text-muted-foreground">
                {variant === "sha256"
                  ? "Use este hash para verificar que o documento não foi alterado"
                  : "Assinatura criptográfica que comprova a origem do documento"}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
        {copyable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}

/**
 * Versão compacta do HashBadge para uso em tabelas e listas
 */
export function HashBadgeCompact({
  value,
  variant = "sha256",
}: {
  value: string;
  variant?: "sha256" | "hmac";
}) {
  const truncated = value.substring(0, 8) + "...";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded cursor-help">
            {truncated}
          </code>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-mono text-xs break-all max-w-xs">{value}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
