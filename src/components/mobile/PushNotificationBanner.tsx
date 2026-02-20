import { Bell, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export const PushNotificationBanner = () => {
  const { isSupported, isDefault, requestPermission, isDenied } = usePushNotifications();
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('push-banner-dismissed') === 'true';
  });

  // Only show on mobile, when supported, permission is default, and not dismissed
  if (!isMobile || !isSupported || !isDefault || dismissed || isDenied) {
    return null;
  }

  const handleEnable = async () => {
    const granted = await requestPermission();
    if (granted) {
      toast.success('Notificações ativadas!', {
        description: 'Você receberá alertas de segurança em tempo real.',
      });
      setDismissed(true);
      localStorage.setItem('push-banner-dismissed', 'true');
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('push-banner-dismissed', 'true');
  };

  return (
    <div className={cn(
      "mx-4 mb-4 p-3 rounded-lg border border-accent/30 bg-accent/5",
      "flex items-start gap-3 animate-in slide-in-from-top-2 duration-300"
    )}>
      <div className="mt-0.5 p-1.5 rounded-md bg-accent/10">
        <Bell className="h-4 w-4 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">Ative as notificações</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Receba alertas de segurança em tempo real no seu dispositivo
        </p>
        <Button
          size="sm"
          onClick={handleEnable}
          className="mt-2 h-7 text-xs px-3"
        >
          Ativar agora
        </Button>
      </div>
      <button
        onClick={handleDismiss}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dispensar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
