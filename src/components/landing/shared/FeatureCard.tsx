import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
  icon?: LucideIcon;
  emoji?: string;
  title: string;
  description: string;
  variant?: "default" | "highlight" | "danger";
  className?: string;
  centered?: boolean;
}

export function FeatureCard({ 
  icon: Icon, 
  emoji,
  title, 
  description, 
  variant = "default",
  className,
  centered = false
}: FeatureCardProps) {
  const variantStyles = {
    default: "border-border hover:border-accent/30",
    highlight: "border-border hover:border-accent/30",
    danger: "border-destructive/20 hover:border-destructive/40"
  };

  const titleStyles = {
    default: "text-foreground",
    highlight: "text-foreground",
    danger: "text-destructive"
  };

  return (
    <div className={cn(
      "group p-6 rounded-xl bg-card border transition-all duration-200",
      variantStyles[variant],
      centered && "text-center",
      className
    )}>
      {emoji && (
        <div className="text-2xl mb-3">{emoji}</div>
      )}
      
      {Icon && (
        <div className={cn(
          "w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-4",
          centered && "mx-auto"
        )}>
          <Icon className="w-5 h-5 text-accent" />
        </div>
      )}
      
      <h3 className={cn("font-semibold text-base mb-2", titleStyles[variant])}>
        {title}
      </h3>
      
      <p className="text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
