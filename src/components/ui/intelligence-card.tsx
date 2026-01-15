import * as React from "react";
import { cn } from "@/lib/utils";

export type IntelligenceCardVariant = 
  | "default" 
  | "success" 
  | "warning" 
  | "critical" 
  | "info";

interface IntelligenceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: IntelligenceCardVariant;
  noBorder?: boolean;
}

const IntelligenceCard = React.forwardRef<HTMLDivElement, IntelligenceCardProps>(
  ({ className, variant = "default", noBorder = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-card rounded-lg border border-border p-4",
          !noBorder && "border-l-2",
          variant === "default" && "border-l-primary",
          variant === "success" && "border-l-success",
          variant === "warning" && "border-l-warning",
          variant === "critical" && "border-l-destructive",
          variant === "info" && "border-l-info",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
IntelligenceCard.displayName = "IntelligenceCard";

interface IntelligenceCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

const IntelligenceCardHeader = React.forwardRef<HTMLDivElement, IntelligenceCardHeaderProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex items-center gap-2 mb-3", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
IntelligenceCardHeader.displayName = "IntelligenceCardHeader";

interface IntelligenceCardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

const IntelligenceCardTitle = React.forwardRef<HTMLHeadingElement, IntelligenceCardTitleProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <h3
        ref={ref}
        className={cn("text-sm font-medium text-foreground", className)}
        {...props}
      >
        {children}
      </h3>
    );
  }
);
IntelligenceCardTitle.displayName = "IntelligenceCardTitle";

interface IntelligenceCardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const IntelligenceCardContent = React.forwardRef<HTMLDivElement, IntelligenceCardContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
IntelligenceCardContent.displayName = "IntelligenceCardContent";

interface IntelligenceCardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

const IntelligenceCardDescription = React.forwardRef<HTMLParagraphElement, IntelligenceCardDescriptionProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
      >
        {children}
      </p>
    );
  }
);
IntelligenceCardDescription.displayName = "IntelligenceCardDescription";

export {
  IntelligenceCard,
  IntelligenceCardHeader,
  IntelligenceCardTitle,
  IntelligenceCardContent,
  IntelligenceCardDescription,
};
