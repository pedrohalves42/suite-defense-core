import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface AdminPageLayoutProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  children: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}

export const AdminPageLayout = ({ 
  title, 
  description, 
  icon: Icon,
  children,
  actions,
  badge,
}: AdminPageLayoutProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {title}
              </h2>
              {badge}
            </div>
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap">
            {actions}
          </div>
        )}
      </div>
      {children}
    </motion.div>
  );
};
