import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Monitor, Users, CalendarDays } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';

interface CurrentPlanCardProps {
  subscription: {
    plan_name: string;
    status: string;
    installed_agents?: number | null;
    available_slots?: number | null;
    max_devices?: number | null;
    device_quantity?: number | null;
    trial_end?: string | null;
    current_period_end?: string | null;
  };
}

export function CurrentPlanCard({ subscription }: CurrentPlanCardProps) {
  return (
    <Card className="border-primary">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Plano Atual: {subscription.plan_name.toUpperCase()}</CardTitle>
              <CardDescription>
                Status: <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'} className="ml-1 text-xs">
                  {subscription.status === 'trialing' ? 'Em teste' : subscription.status === 'active' ? 'Ativo' : subscription.status}
                </Badge>
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox icon={Monitor} label="Agentes Instalados" value={subscription.installed_agents ?? '—'} />
          <StatBox icon={Users} label="Slots Disponíveis" value={subscription.available_slots ?? '—'} valueClass="text-primary" />
          <StatBox icon={Monitor} label="Máx. Dispositivos" value={subscription.max_devices ?? subscription.device_quantity ?? '—'} />
          <div className="space-y-1 p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {subscription.trial_end && new Date(subscription.trial_end) > new Date() ? 'Trial até' : 'Expira em'}
            </div>
            <p className="text-sm font-bold">
              {subscription.trial_end && new Date(subscription.trial_end) > new Date()
                ? formatBrazilDateTime(subscription.trial_end, 'date')
                : subscription.current_period_end
                  ? formatBrazilDateTime(subscription.current_period_end, 'date')
                  : 'Sem expiração'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatBox({ icon: Icon, label, value, valueClass = '' }: { icon: typeof Monitor; label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="space-y-1 p-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`text-xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
