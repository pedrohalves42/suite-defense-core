import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface EnterpriseCardProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}

export function EnterpriseCard({
  title,
  description,
  icon: Icon,
  children,
  className,
  headerClassName,
  contentClassName,
}: EnterpriseCardProps) {
  return (
    <Card className={cn("card-enterprise card-enterprise-hover", className)}>
      {(title || description) && (
        <CardHeader className={headerClassName}>
          {title && (
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              {Icon && <Icon className="h-4 w-4 text-primary/70" />}
              {title}
            </CardTitle>
          )}
          {description && (
            <CardDescription className="text-muted-foreground/70">
              {description}
            </CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent className={contentClassName}>
        {children}
      </CardContent>
    </Card>
  );
}
