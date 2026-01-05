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
    default: "border-border/50 hover:border-primary/50",
    highlight: "border-primary/20 hover:border-primary/50 hover:shadow-glow-primary",
    danger: "border-destructive/20 hover:border-destructive/50"
  };

  const titleStyles = {
    default: "text-foreground",
    highlight: "text-foreground",
    danger: "text-destructive"
  };

  return (
    <div className={cn(
      "group p-6 rounded-xl bg-card/50 backdrop-blur-sm border transition-all hover:scale-105",
      variantStyles[variant],
      centered && "text-center",
      className
    )}>
      {emoji && (
        <div className="text-3xl mb-3">{emoji}</div>
      )}
      
      {Icon && (
        <div className={cn(
          "w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform",
          centered && "mx-auto"
        )}>
          <Icon className="w-6 h-6 text-primary" />
        </div>
      )}
      
      <h3 className={cn("font-bold text-lg mb-2", titleStyles[variant])}>
        {title}
      </h3>
      
      <p className="text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
