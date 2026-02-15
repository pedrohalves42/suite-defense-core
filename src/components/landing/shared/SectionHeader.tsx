import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  badge?: {
    icon?: LucideIcon;
    text: string;
    variant?: "primary" | "destructive";
  };
  title: string;
  subtitle?: string;
  className?: string;
  titleClassName?: string;
}

export function SectionHeader({ 
  badge, 
  title, 
  subtitle, 
  className,
  titleClassName 
}: SectionHeaderProps) {
  return (
    <div className={cn("text-center mb-12 animate-fade-in", className)}>
      {badge && (
        <div className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6",
          badge.variant === "destructive" 
            ? "bg-destructive/10 border border-destructive/20" 
            : "bg-accent/10 border border-accent/20"
        )}>
          {badge.icon && (
            <badge.icon className={cn(
              "w-4 h-4",
              badge.variant === "destructive" ? "text-destructive" : "text-accent"
            )} />
          )}
          <span className={cn(
            "text-sm font-medium",
            badge.variant === "destructive" ? "text-destructive" : "text-foreground"
          )}>
            {badge.text}
          </span>
        </div>
      )}
      
      <h2 className={cn("text-2xl md:text-3xl font-bold mb-4 text-foreground", titleClassName)}>
        {title}
      </h2>
      
      {subtitle && (
        <p className="text-base text-muted-foreground max-w-3xl mx-auto">
          {subtitle}
        </p>
      )}
    </div>
  );
}
