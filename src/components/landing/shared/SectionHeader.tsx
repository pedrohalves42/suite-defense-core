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
    <div className={cn("text-center mb-16 animate-fade-in-up", className)}>
      {badge && (
        <div className={cn(
          "inline-flex items-center gap-2.5 px-5 py-2 rounded-full mb-8 glass-card border-white/10",
          badge.variant === "destructive" 
            ? "border-destructive/30" 
            : "border-cta-positive/30"
        )}>
          {badge.icon && (
            <badge.icon className={cn(
              "w-4 h-4",
              badge.variant === "destructive" ? "text-destructive" : "text-cta-positive"
            )} />
          )}
          <span className={cn(
            "text-[10px] font-bold tracking-[0.15em] uppercase",
            badge.variant === "destructive" ? "text-destructive" : "text-cta-positive"
          )}>
            {badge.text}
          </span>
        </div>
      )}
      
      <h2 className={cn("text-4xl md:text-5xl font-display font-extrabold mb-6 text-white tracking-tight drop-shadow-sm", titleClassName)}>
        {title}
      </h2>
      
      {subtitle && (
        <p className="text-lg text-white/50 max-w-2xl mx-auto font-medium leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}
