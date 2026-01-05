import { cn } from '@/lib/utils';

interface SectionDividerProps {
  label?: string;
  className?: string;
}

export function SectionDivider({ label, className }: SectionDividerProps) {
  return (
    <div className={cn("relative my-6", className)}>
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border/30" />
      </div>
      {label && (
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-xs uppercase tracking-wider text-muted-foreground/50">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
