import React from 'react';
import { cn } from '@/lib/utils';

interface PitchSlideProps {
  slideNumber: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export const PitchSlide: React.FC<PitchSlideProps> = ({
  slideNumber,
  title,
  subtitle,
  children,
  className
}) => {
  return (
    <div className={cn(
      "min-h-[600px] bg-card border border-border rounded-xl p-8 flex flex-col",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{title}</h2>
          {subtitle && (
            <p className="text-lg text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Slide</span>
          <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
            {slideNumber}
          </span>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1">
        {children}
      </div>
      
      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
            <span className="text-primary font-bold text-sm">CS</span>
          </div>
          <span className="text-sm font-medium text-muted-foreground">CyberShield</span>
        </div>
        <span className="text-xs text-muted-foreground">Confidencial - Investidores</span>
      </div>
    </div>
  );
};
