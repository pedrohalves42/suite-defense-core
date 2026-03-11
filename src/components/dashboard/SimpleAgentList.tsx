import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { CheckCircle, AlertTriangle, WifiOff, Phone, Laptop, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface Agent {
  id: string;
  agent_name: string;
  health_status: 'healthy' | 'warning' | 'critical' | 'offline' | 'never_connected';
}

interface SimpleAgentListProps {
  agents: Agent[];
  isLoading?: boolean;
  onAgentClick?: (agent: Agent) => void;
}

/**
 * Lista simplificada de computadores para donos de negócio
 * 
 * Mostra apenas:
 * - Nome do computador
 * - Status com emoji (✅ 🟡 🔴)
 * - Nenhuma métrica técnica
 */
export function SimpleAgentList({ agents, isLoading, onAgentClick }: SimpleAgentListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4" />
        <p className="text-muted-foreground">Verificando computadores...</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-12 text-center">
          <Laptop className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum computador cadastrado</h3>
          <p className="text-muted-foreground mb-4">
            Instale o programa de proteção nos computadores da empresa.
          </p>
          <Button asChild>
            <Link to="/installer">
              Instalar Proteção
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const healthy = agents.filter(a => a.health_status === 'healthy');
  const problems = agents.filter(a => a.health_status === 'warning' || a.health_status === 'critical');
  const offline = agents.filter(a => a.health_status === 'offline' || a.health_status === 'never_connected');

  const getStatusConfig = (status: Agent['health_status']) => {
    switch (status) {
      case 'healthy':
        return {
          icon: CheckCircle,
          label: 'Protegido',
          color: 'text-green-600',
          bgColor: 'bg-green-50 dark:bg-green-950/30',
        };
      case 'warning':
      case 'critical':
        return {
          icon: AlertTriangle,
          label: 'Precisa atenção',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
        };
      case 'offline':
      case 'never_connected':
        return {
          icon: WifiOff,
          label: 'Desligado',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
        };
      default:
        return {
          icon: Laptop,
          label: 'Status desconhecido',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Resumo visual */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30"
        >
          <div className="text-3xl font-bold text-green-600">{healthy.length}</div>
          <div className="text-sm text-green-700 dark:text-green-400">Protegidos</div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className={cn("p-4 rounded-lg", problems.length > 0 ? "bg-yellow-50 dark:bg-yellow-950/30" : "bg-muted/30")}
        >
          <div className={cn("text-3xl font-bold", problems.length > 0 ? "text-yellow-600" : "text-muted-foreground")}>
            {problems.length}
          </div>
          <div className="text-sm text-muted-foreground">Com problemas</div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="p-4 rounded-lg bg-muted/30"
        >
          <div className="text-3xl font-bold text-muted-foreground">{offline.length}</div>
          <div className="text-sm text-muted-foreground">Desligados</div>
        </motion.div>
      </div>

      {/* Lista de computadores com problemas primeiro */}
      {problems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
            ⚠️ Computadores que precisam de atenção
          </h3>
          <div className="space-y-2">
            {problems.map((agent, idx) => (
              <SimpleAgentItem 
                key={agent.id} 
                agent={agent} 
                index={idx}
                onClick={() => onAgentClick?.(agent)} 
              />
            ))}
          </div>
        </div>
      )}

      {/* Computadores offline */}
      {offline.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Computadores desligados ({offline.length})
          </h3>
          <div className="space-y-2">
            {offline.slice(0, 5).map((agent, idx) => (
              <SimpleAgentItem 
                key={agent.id} 
                agent={agent} 
                index={idx}
                onClick={() => onAgentClick?.(agent)} 
              />
            ))}
            {offline.length > 5 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                +{offline.length - 5} computadores desligados
              </p>
            )}
          </div>
        </div>
      )}

      {/* Computadores saudáveis */}
      {healthy.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-green-700 dark:text-green-400">
            ✓ Computadores protegidos ({healthy.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {healthy.slice(0, 9).map((agent) => (
              <div 
                key={agent.id}
                onClick={() => onAgentClick?.(agent)}
                className="flex items-center gap-2 p-2 rounded-lg bg-green-50/50 dark:bg-green-950/20 hover:bg-green-50 dark:hover:bg-green-950/30 cursor-pointer transition-colors"
              >
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm truncate">{agent.agent_name}</span>
              </div>
            ))}
          </div>
          {healthy.length > 9 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              +{healthy.length - 9} computadores protegidos
            </p>
          )}
        </div>
      )}

      {/* CTA para suporte */}
      {problems.length > 0 && (
        <Card className="bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  Precisa de ajuda?
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Nossa equipe pode resolver remotamente
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="tel:+551199999999">
                  <Phone className="mr-2 h-4 w-4" />
                  Ligar
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SimpleAgentItem({ 
  agent, 
  index,
  onClick 
}: { 
  agent: Agent; 
  index: number;
  onClick?: () => void;
}) {
  const getStatusConfig = (status: Agent['health_status']) => {
    switch (status) {
      case 'healthy':
        return { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-950/30' };
      case 'warning':
      case 'critical':
        return { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950/30' };
      default:
        return { icon: WifiOff, color: 'text-muted-foreground', bg: 'bg-muted' };
    }
  };

  const config = getStatusConfig(agent.health_status);
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:shadow-sm",
        config.bg
      )}
    >
      <Icon className={cn("h-5 w-5", config.color)} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{agent.agent_name}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </motion.div>
  );
}
