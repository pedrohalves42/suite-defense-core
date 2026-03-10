import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { CheckCircle, AlertTriangle, XCircle, Phone, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { QuickActions, SmartNotificationBanner } from './QuickActions';
import { useSmartNotifications } from '@/hooks/useSmartNotifications';
import { BackupAwarenessCard } from './BackupAwarenessCard';
import { toast } from 'sonner';

interface SimpleDashboardProps {
  globalStatus: {
    emoji: string;
    title: string;
    description: string;
    variant: 'success' | 'warning' | 'danger';
  };
  stats: {
    totalAgents: number;
    onlineAgents: number;
    offlineAgents: number;
    criticalAlerts: number;
  };
  isLoading?: boolean;
  tenantId?: string;
}

/**
 * Dashboard simplificado para donos de negócio
 * 
 * Mostra apenas:
 * - Status geral (semáforo verde/amarelo/vermelho)
 * - Números essenciais em linguagem de negócio
 * - Ações claras quando há problemas
 * - Notificações inteligentes
 */
export function SimpleDashboard({ globalStatus, stats, isLoading, tenantId }: SimpleDashboardProps) {
  const { notifications } = useSmartNotifications();
  
  const handleRunScan = () => {
    toast.info('Verificação de segurança iniciada...', {
      description: 'Isso pode levar alguns minutos.',
    });
  };

  const handleGenerateReport = () => {
    toast.info('Gerando relatório...', {
      description: 'O relatório será exibido em breve.',
    });
  };

  const getStatusConfig = () => {
    switch (globalStatus.variant) {
      case 'success':
        return {
          bgColor: 'bg-green-50 dark:bg-green-950/30',
          borderColor: 'border-green-200 dark:border-green-800',
          textColor: 'text-green-700 dark:text-green-300',
          Icon: CheckCircle,
          iconColor: 'text-green-500',
        };
      case 'warning':
        return {
          bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          textColor: 'text-yellow-700 dark:text-yellow-300',
          Icon: AlertTriangle,
          iconColor: 'text-yellow-500',
        };
      case 'danger':
        return {
          bgColor: 'bg-red-50 dark:bg-red-950/30',
          borderColor: 'border-red-200 dark:border-red-800',
          textColor: 'text-red-700 dark:text-red-300',
          Icon: XCircle,
          iconColor: 'text-red-500',
        };
    }
  };

  const config = getStatusConfig();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
        <p className="text-muted-foreground">Verificando proteção...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notificações Inteligentes */}
      {notifications.filter(n => n.type !== 'all_good').map((notification, idx) => (
        <SmartNotificationBanner key={idx} notification={notification} />
      ))}

      {/* Status Principal - Grande e Claro */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Card className={cn('border-2', config.borderColor, config.bgColor)}>
          <CardContent className="py-12 text-center">
            <div className={cn('inline-flex p-4 rounded-full mb-4', config.bgColor)}>
              <config.Icon className={cn('h-16 w-16', config.iconColor)} />
            </div>
            
            <h1 className={cn('text-3xl font-bold mb-2', config.textColor)}>
              {globalStatus.title}
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-md mx-auto">
              {globalStatus.description}
            </p>

            {globalStatus.variant !== 'success' && (
              <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild size="lg">
                  <Link to="/admin/agent-health">
                    Ver Problemas
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <a href="tel:+551199999999">
                    <Phone className="mr-2 h-4 w-4" />
                    Ligar para Suporte
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Números Essenciais - Linguagem de Negócio */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="py-6 text-center">
              <div className="text-4xl font-bold text-green-600 mb-1">
                {stats.onlineAgents}
              </div>
              <p className="text-muted-foreground">
                Computadores Protegidos
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className={stats.offlineAgents > 0 ? 'border-yellow-300 bg-yellow-50/50 dark:bg-yellow-950/20' : ''}>
            <CardContent className="py-6 text-center">
              <div className={cn('text-4xl font-bold mb-1', stats.offlineAgents > 0 ? 'text-yellow-600' : 'text-muted-foreground')}>
                {stats.offlineAgents}
              </div>
              <p className="text-muted-foreground">
                Computadores Desligados
              </p>
              {stats.offlineAgents > 0 && (
                <p className="text-xs text-yellow-600 mt-1">
                  Não recebem atualizações
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className={stats.criticalAlerts > 0 ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : ''}>
            <CardContent className="py-6 text-center">
              <div className={cn('text-4xl font-bold mb-1', stats.criticalAlerts > 0 ? 'text-red-600' : 'text-muted-foreground')}>
                {stats.criticalAlerts}
              </div>
              <p className="text-muted-foreground">
                Alertas de Segurança
              </p>
              {stats.criticalAlerts > 0 && (
                <Button variant="link" className="text-xs text-red-600 p-0 h-auto mt-1" asChild>
                  <Link to="/admin/security-monitoring">
                    Ver alertas →
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Ações Rápidas */}
      <QuickActions 
        onRunScan={handleRunScan}
        onGenerateReport={handleGenerateReport}
      />

      {/* Mensagem de Resumo */}
      <Card className="bg-muted/30">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground">
            {stats.totalAgents === 0 ? (
              <>Nenhum computador cadastrado. <Link to="/installer" className="text-primary underline">Instale o programa de proteção</Link>.</>
            ) : (
              <>
                Você tem <strong>{stats.totalAgents}</strong> computador{stats.totalAgents > 1 ? 'es' : ''} cadastrado{stats.totalAgents > 1 ? 's' : ''}.
                {stats.onlineAgents === stats.totalAgents && ' Todos estão protegidos! ✓'}
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
