import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ComplianceRowProps {
  category: string;
  score: number;
  details: string;
}

export function ComplianceRow({ category, score, details }: ComplianceRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium truncate">{category}</span>
          <span className={cn("text-xs font-bold",
            score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-destructive"
          )}>{score}%</span>
        </div>
        <Progress value={score} className="h-1.5" />
        <p className="text-[10px] text-muted-foreground mt-0.5">{details}</p>
      </div>
    </div>
  );
}
