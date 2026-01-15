import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusBadgeVariant = 
  | "healthy" 
  | "attention" 
  | "critical" 
  | "neutral"
  | "info";

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusBadgeVariant;
  dot?: boolean;
}

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, variant = "neutral", dot = true, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium",
          variant === "healthy" && "bg-success/10 text-success",
          variant === "attention" && "bg-warning/10 text-warning",
          variant === "critical" && "bg-destructive/10 text-destructive",
          variant === "neutral" && "bg-muted text-muted-foreground",
          variant === "info" && "bg-info/10 text-info",
          className
        )}
        {...props}
      >
        {dot && (
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              variant === "healthy" && "bg-success",
              variant === "attention" && "bg-warning",
              variant === "critical" && "bg-destructive",
              variant === "neutral" && "bg-muted-foreground",
              variant === "info" && "bg-info"
            )}
          />
        )}
        {children}
      </span>
    );
  }
);
StatusBadge.displayName = "StatusBadge";

export { StatusBadge };
