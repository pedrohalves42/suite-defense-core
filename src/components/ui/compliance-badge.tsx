import { cn } from "@/lib/utils";
import { Shield, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface ComplianceBadgeProps {
  status: "BOM" | "ADEQUADO" | "ATENÇÃO" | "CRÍTICO";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ComplianceBadge({ status, size = "md", className }: ComplianceBadgeProps) {
  const getConfig = () => {
    switch (status) {
      case "BOM":
        return {
          icon: CheckCircle2,
          bg: "bg-gradient-to-br from-success/20 to-success/10 border-success/50",
          iconColor: "text-success",
          label: "Segurança Excelente",
          sublabel: "Ambiente protegido"
        };
      case "ADEQUADO":
        return {
          icon: Shield,
          bg: "bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 border-emerald-500/50",
          iconColor: "text-emerald-500",
          label: "Segurança Adequada",
          sublabel: "Pequenas melhorias"
        };
      case "ATENÇÃO":
        return {
          icon: AlertTriangle,
          bg: "bg-gradient-to-br from-warning/20 to-warning/10 border-warning/50",
          iconColor: "text-warning",
          label: "Atenção Necessária",
          sublabel: "Revisão recomendada"
        };
      case "CRÍTICO":
        return {
          icon: XCircle,
          bg: "bg-gradient-to-br from-destructive/20 to-destructive/10 border-destructive/50",
          iconColor: "text-destructive",
          label: "Situação Crítica",
          sublabel: "Ação imediata"
        };
    }
  };

  const sizeClasses = {
    sm: { container: "p-3", icon: "h-6 w-6", label: "text-xs", sublabel: "text-[10px]" },
    md: { container: "p-4", icon: "h-10 w-10", label: "text-sm", sublabel: "text-xs" },
    lg: { container: "p-6", icon: "h-14 w-14", label: "text-base", sublabel: "text-sm" },
  };

  const config = getConfig();
  const sizes = sizeClasses[size];
  const Icon = config.icon;

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-xl border-2 transition-all",
      config.bg,
      sizes.container,
      className
    )}>
      <div className={cn("p-2 rounded-full bg-background/50", config.iconColor)}>
        <Icon className={sizes.icon} />
      </div>
      <div>
        <p className={cn("font-bold", sizes.label, config.iconColor)}>{config.label}</p>
        <p className={cn("text-muted-foreground", sizes.sublabel)}>{config.sublabel}</p>
      </div>
    </div>
  );
}
