import { Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface FeatureLockBadgeProps {
  featureName: string;
  onUnlock?: () => void;
}

export function FeatureLockBadge({ featureName, onUnlock }: FeatureLockBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-muted-foreground hover:text-primary"
            onClick={onUnlock}
          >
            <Lock className="w-3 h-3 mr-1" />
            <span className="text-xs">Business</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">
            {featureName} está disponível no plano Business.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Clique para desbloquear
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
