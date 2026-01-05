import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { X, Bell, ArrowRight, Shield } from 'lucide-react';

const BANNER_DISMISSED_KEY = 'cybershield_notification_banner_dismissed';

export function NotificationSetupBanner() {
  const { tenant } = useTenant();
  const [dismissed, setDismissed] = useState(() => {
    const stored = localStorage.getItem(BANNER_DISMISSED_KEY);
    if (!stored) return false;
    // Dismiss for 7 days
    const dismissedUntil = parseInt(stored, 10);
    return Date.now() < dismissedUntil;
  });

  const { data: channelCount, isLoading } = useQuery({
    queryKey: ['notification-channels-count', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return 0;
      const { count, error } = await supabase
        .from('notification_channels')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!tenant?.id,
    staleTime: 60000,
  });

  const handleDismiss = () => {
    const dismissUntil = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    localStorage.setItem(BANNER_DISMISSED_KEY, dismissUntil.toString());
    setDismissed(true);
  };

  // Don't show if loading, dismissed, or has channels configured
  if (isLoading || dismissed || (channelCount && channelCount > 0)) {
    return null;
  }

  return (
    <Alert className="bg-amber-500/10 border-amber-500/30 relative">
      <Bell className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-700 dark:text-amber-400 flex items-center gap-2">
        <Shield className="h-4 w-4" />
        Configure alertas de segurança
      </AlertTitle>
      <AlertDescription className="text-amber-600/80 dark:text-amber-300/80">
        <p className="mb-3">
          Você ainda não configurou nenhum canal de notificação. Sem isso, não receberá alertas quando:
        </p>
        <ul className="list-disc list-inside mb-4 space-y-1 text-sm">
          <li>Um computador ficar offline por muito tempo</li>
          <li>Um vírus for detectado</li>
          <li>Uma vulnerabilidade crítica for encontrada</li>
          <li>Um job importante falhar</li>
        </ul>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700">
            <Link to="/admin/notification-channels">
              Configurar agora
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground">
            Leva menos de 2 minutos
          </span>
        </div>
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 text-amber-600 hover:text-amber-700"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
}
