import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Banner that shows when the tenant is approaching or has reached their plan's agent limit.
 * Displays contextually: warning at 80%+, blocking at 100%.
 */
export function PlanLimitBanner() {
  const { subscription } = useSubscription();
  const navigate = useNavigate();

  if (!subscription) return null;

  const { installed_agents = 0, max_devices = 2, plan_name = 'free', available_slots = 0 } = subscription;

  // Don't show for enterprise/unlimited plans
  if (plan_name === 'enterprise' || max_devices >= 999) return null;

  const usagePercent = max_devices > 0 ? (installed_agents / max_devices) * 100 : 0;

  if (usagePercent < 80) return null;

  const isAtLimit = available_slots <= 0;
  const planLabel = plan_name === 'free' ? 'Gratuito' : plan_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <Alert variant={isAtLimit ? 'destructive' : 'default'} className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between w-full">
        <span>
          {isAtLimit
            ? `Limite do plano ${planLabel} atingido (${installed_agents}/${max_devices} agentes). Não é possível adicionar novos agentes.`
            : `Você está usando ${installed_agents} de ${max_devices} agentes do plano ${planLabel}. Restam ${available_slots} slots.`
          }
        </span>
        <Button
          variant={isAtLimit ? 'default' : 'outline'}
          size="sm"
          className="ml-4 shrink-0"
          onClick={() => navigate('/admin/plan-upgrade')}
        >
          Fazer Upgrade <ArrowUpRight className="ml-1 h-3 w-3" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
