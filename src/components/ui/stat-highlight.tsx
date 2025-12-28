import { cn } from "@/lib/utils";
import { LucideIcon, Monitor, Shield, AlertTriangle, Bug, Ban, Wifi, WifiOff, CheckCircle2 } from "lucide-react";

type StatStatus = "good" | "warning" | "critical" | "neutral";

interface StatHighlightProps {
  icon: "computer" | "shield" | "alert" | "virus" | "block" | "offline" | "online" | "check";
  label: string;
  value: string | number;
  status?: StatStatus;
  size?: "sm" | "md";
  className?: string;
}

const iconMap: Record<string, LucideIcon> = {
  computer: Monitor,
  shield: Shield,
  alert: AlertTriangle,
  virus: Bug,
  block: Ban,
  offline: WifiOff,
  online: Wifi,
  check: CheckCircle2,
};

export function StatHighlight({ 
  icon, 
  label, 
  value, 
  status = "neutral", 
  size = "md",
  className 
}: StatHighlightProps) {
  const Icon = iconMap[icon] || Monitor;
  
  const statusColors = {
    good: "bg-success/10 border-success/30 text-success",
    warning: "bg-warning/10 border-warning/30 text-warning",
    critical: "bg-destructive/10 border-destructive/30 text-destructive",
    neutral: "bg-muted/50 border-border text-muted-foreground",
  };

  const iconColors = {
    good: "text-success",
    warning: "text-warning",
    critical: "text-destructive",
    neutral: "text-muted-foreground",
  };

  const sizeClasses = {
    sm: { container: "p-2 gap-2", icon: "h-4 w-4", value: "text-lg", label: "text-[10px]" },
    md: { container: "p-3 gap-3", icon: "h-5 w-5", value: "text-2xl", label: "text-xs" },
  };

  const sizes = sizeClasses[size];

  return (
    <div className={cn(
      "flex items-center rounded-lg border transition-all",
      statusColors[status],
      sizes.container,
      className
    )}>
      <Icon className={cn(sizes.icon, iconColors[status])} />
      <div className="flex-1 min-w-0">
        <p className={cn("font-bold truncate", sizes.value)}>{value}</p>
        <p className={cn("text-muted-foreground truncate", sizes.label)}>{label}</p>
      </div>
    </div>
  );
}
