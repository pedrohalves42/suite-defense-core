import * as React from "react";
import { cn } from "@/lib/utils";

interface MetricDisplayProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string | number;
  label?: string;
  suffix?: string;
  size?: "sm" | "md" | "lg";
  trend?: "up" | "down" | "neutral";
}

const MetricDisplay = React.forwardRef<HTMLDivElement, MetricDisplayProps>(
  ({ className, value, label, suffix, size = "md", trend, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("", className)} {...props}>
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              "font-mono font-medium tracking-tight",
              size === "sm" && "text-lg",
              size === "md" && "text-2xl",
              size === "lg" && "text-3xl",
              trend === "up" && "text-success",
              trend === "down" && "text-destructive",
              !trend && "text-foreground"
            )}
          >
            {value}
          </span>
          {suffix && (
            <span className="text-sm text-muted-foreground">{suffix}</span>
          )}
        </div>
        {label && (
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        )}
      </div>
    );
  }
);
MetricDisplay.displayName = "MetricDisplay";

export { MetricDisplay };
