import * as React from "react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, ptBR } from "@/lib/date-utils";

interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp: Date | string;
  variant?: "default" | "success" | "warning" | "critical";
  icon?: React.ReactNode;
}

interface ActivityTimelineProps extends React.HTMLAttributes<HTMLDivElement> {
  items: TimelineItem[];
  maxItems?: number;
}

const ActivityTimeline = React.forwardRef<HTMLDivElement, ActivityTimelineProps>(
  ({ className, items, maxItems = 5, ...props }, ref) => {
    const displayItems = items.slice(0, maxItems);

    return (
      <div ref={ref} className={cn("", className)} {...props}>
        {displayItems.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              "relative pl-6 pb-4",
              index !== displayItems.length - 1 && "border-l border-border ml-1"
            )}
          >
            {/* Dot */}
            <span
              className={cn(
                "absolute left-0 top-1.5 w-2 h-2 rounded-full -translate-x-1/2",
                item.variant === "success" && "bg-success",
                item.variant === "warning" && "bg-warning",
                item.variant === "critical" && "bg-destructive",
                (!item.variant || item.variant === "default") && "bg-primary"
              )}
            />
            
            {/* Content */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.description}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(new Date(item.timestamp), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </span>
            </div>
          </div>
        ))}
        
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma atividade recente
          </p>
        )}
      </div>
    );
  }
);
ActivityTimeline.displayName = "ActivityTimeline";

export { ActivityTimeline };
export type { TimelineItem };
