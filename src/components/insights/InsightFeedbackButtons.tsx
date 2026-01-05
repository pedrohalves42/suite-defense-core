import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ThumbsUp, ThumbsDown, Flag, Loader2, Check } from 'lucide-react';
import { useInsightFeedback, FeedbackType } from '@/hooks/useInsightFeedback';
import { cn } from '@/lib/utils';

interface InsightFeedbackButtonsProps {
  insightId: string;
  compact?: boolean;
  className?: string;
}

export function InsightFeedbackButtons({ 
  insightId, 
  compact = false,
  className 
}: InsightFeedbackButtonsProps) {
  const { feedback, hasFeedback, submitFeedback } = useInsightFeedback(insightId);
  const [hoveredButton, setHoveredButton] = useState<FeedbackType | null>(null);

  const handleFeedback = (type: FeedbackType) => {
    submitFeedback.mutate({ insightId, feedbackType: type });
  };

  const isSubmitting = submitFeedback.isPending;
  const currentFeedback = feedback?.feedback_type;

  const buttons = [
    {
      type: 'useful' as FeedbackType,
      icon: ThumbsUp,
      label: 'Útil',
      tooltip: 'Este insight foi útil',
      activeClass: 'bg-green-500/10 text-green-600 border-green-500/30',
    },
    {
      type: 'noise' as FeedbackType,
      icon: ThumbsDown,
      label: 'Ruído',
      tooltip: 'Este insight não é relevante',
      activeClass: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
    },
    {
      type: 'false_positive' as FeedbackType,
      icon: Flag,
      label: 'Falso +',
      tooltip: 'Este insight é incorreto',
      activeClass: 'bg-red-500/10 text-red-600 border-red-500/30',
    },
  ];

  if (compact) {
    return (
      <TooltipProvider>
        <div className={cn("flex items-center gap-1", className)}>
          {buttons.map(({ type, icon: Icon, tooltip, activeClass }) => {
            const isActive = currentFeedback === type;
            return (
              <Tooltip key={type}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7",
                      isActive && activeClass
                    )}
                    onClick={() => handleFeedback(type)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting && hoveredButton === type ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isActive ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isActive ? `Marcado como: ${tooltip}` : tooltip}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs text-muted-foreground mr-1">
        {hasFeedback ? 'Seu feedback:' : 'Este insight foi útil?'}
      </span>
      {buttons.map(({ type, icon: Icon, label, activeClass }) => {
        const isActive = currentFeedback === type;
        return (
          <Button
            key={type}
            variant="outline"
            size="sm"
            className={cn(
              "h-7 text-xs gap-1.5",
              isActive && activeClass
            )}
            onClick={() => handleFeedback(type)}
            disabled={isSubmitting}
            onMouseEnter={() => setHoveredButton(type)}
            onMouseLeave={() => setHoveredButton(null)}
          >
            {isSubmitting && hoveredButton === type ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isActive ? (
              <Check className="h-3 w-3" />
            ) : (
              <Icon className="h-3 w-3" />
            )}
            {label}
          </Button>
        );
      })}
    </div>
  );
}
