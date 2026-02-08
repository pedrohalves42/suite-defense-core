import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { 
  Shield, 
  FileText, 
  Settings, 
  Phone, 
  Download, 
  RefreshCw,
  HelpCircle,
  Bell
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface QuickAction {
  icon: React.ElementType;
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'warning';
}

interface QuickActionsProps {
  onRunScan?: () => void;
  onGenerateReport?: () => void;
  isScanning?: boolean;
}

/**
 * Ações Rápidas para o Dashboard Simples
 * 
 * Analogia: Como os botões de um painel de alarme residencial
 * - Verificar Segurança
 * - Gerar Relatório
 * - Configurações
 * - Suporte
 */
export function QuickActions({ onRunScan, onGenerateReport, isScanning }: QuickActionsProps) {
  const actions: QuickAction[] = [
    {
      icon: Shield,
      title: 'Verificar Segurança',
      description: 'Executar verificação completa',
      onClick: onRunScan,
      variant: 'primary',
    },
    {
      icon: FileText,
      title: 'Relatório',
      description: 'Ver relatório mensal',
      onClick: onGenerateReport,
    },
    {
      icon: Download,
      title: 'Instalar Proteção',
      description: 'Adicionar computador',
      href: '/installer',
    },
    {
      icon: Phone,
      title: 'Suporte',
      description: 'Falar com especialista',
      href: 'tel:+551199999999',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Ações Rápidas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {actions.map((action, index) => (
            <motion.div
              key={action.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <QuickActionButton 
                action={action} 
                isLoading={action.title === 'Verificar Segurança' && isScanning}
              />
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickActionButton({ 
  action, 
  isLoading 
}: { 
  action: QuickAction;
  isLoading?: boolean;
}) {
  const Icon = action.icon;
  
  const content = (
    <div
      className={cn(
        "flex flex-col items-center p-4 rounded-lg border transition-all cursor-pointer",
        "hover:shadow-md hover:border-primary/30",
        action.variant === 'primary' && "bg-primary/5 border-primary/20 hover:bg-primary/10",
        action.variant === 'warning' && "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20",
        isLoading && "opacity-70 pointer-events-none"
      )}
    >
      <div className={cn(
        "p-2 rounded-full mb-2",
        action.variant === 'primary' ? "bg-primary/10" : "bg-muted"
      )}>
        {isLoading ? (
          <RefreshCw className="h-5 w-5 text-primary animate-spin" />
        ) : (
          <Icon className={cn(
            "h-5 w-5",
            action.variant === 'primary' ? "text-primary" : "text-muted-foreground"
          )} />
        )}
      </div>
      <span className="font-medium text-sm text-center">{action.title}</span>
      <span className="text-xs text-muted-foreground text-center mt-0.5">
        {action.description}
      </span>
    </div>
  );

  if (action.href) {
    if (action.href.startsWith('tel:') || action.href.startsWith('http')) {
      return <a href={action.href}>{content}</a>;
    }
    return <Link to={action.href}>{content}</Link>;
  }

  return <div onClick={action.onClick}>{content}</div>;
}

/**
 * Componente de notificações inteligentes em linguagem simples
 */
export function SmartNotificationBanner({ 
  notification 
}: { 
  notification: {
    type: string;
    title: string;
    message: string;
    urgency: 'low' | 'medium' | 'high';
    action?: string;
    actionHref?: string;
  };
}) {
  const urgencyConfig = {
    low: {
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-800',
      icon: HelpCircle,
      iconColor: 'text-blue-500',
    },
    medium: {
      bg: 'bg-yellow-50 dark:bg-yellow-950/30',
      border: 'border-yellow-200 dark:border-yellow-800',
      icon: Bell,
      iconColor: 'text-yellow-500',
    },
    high: {
      bg: 'bg-red-50 dark:bg-red-950/30',
      border: 'border-red-200 dark:border-red-800',
      icon: Shield,
      iconColor: 'text-red-500',
    },
  };

  const config = urgencyConfig[notification.urgency];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg border p-4",
        config.bg,
        config.border
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", config.iconColor)} />
        <div className="flex-1 min-w-0">
          <p className="font-medium">{notification.title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {notification.message}
          </p>
        </div>
        {notification.action && notification.actionHref && (
          <Button size="sm" variant="outline" asChild>
            <Link to={notification.actionHref}>
              {notification.action}
            </Link>
          </Button>
        )}
      </div>
    </motion.div>
  );
}
