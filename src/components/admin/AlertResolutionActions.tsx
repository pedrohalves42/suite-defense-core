/**
 * Alert Resolution Actions - Ações rápidas para resolver alertas
 * Etapa 1 do plano de melhoria 68% → 80%
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  MoreVertical, 
  Ban,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface AlertResolutionActionsProps {
  alertId: string;
  alertType: string;
  onResolved?: () => void;
}

type ResolutionType = 'resolved' | 'false_positive' | 'acknowledged' | 'suppressed';

export function AlertResolutionActions({ 
  alertId, 
  alertType, 
  onResolved 
}: AlertResolutionActionsProps) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const resolveMutation = useMutation({
    mutationFn: async ({ type, notes }: { type: ResolutionType; notes?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (!tenant?.id) throw new Error('No tenant selected');

      // V-1050 FIX: Add tenant_id filter to prevent cross-tenant alert resolution
      const { error } = await supabase
        .from('system_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: notes || `Resolvido como: ${type}`,
        })
        .eq('id', alertId)
        .eq('tenant_id', tenant.id);

      if (error) throw error;

      // Log the resolution for audit trail
      await supabase.from('audit_logs').insert({
        tenant_id: tenant?.id,
        user_id: user.id,
        action: 'alert_resolved',
        resource_type: 'system_alert',
        resource_id: alertId,
        changes: { resolution_type: type, alert_type: alertType },
        ip_address: 'internal',
      });

      return { type };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['security-events'] });
      queryClient.invalidateQueries({ queryKey: ['system-alerts'] });
      
      const messages: Record<ResolutionType, string> = {
        resolved: 'Alerta marcado como resolvido',
        false_positive: 'Alerta marcado como falso positivo',
        acknowledged: 'Alerta reconhecido',
        suppressed: 'Alerta suprimido (não notificar novamente)',
      };
      
      toast.success(messages[data.type as ResolutionType]);
      onResolved?.();
      setIsOpen(false);
    },
    onError: (error) => {
      toast.error('Erro ao resolver alerta: ' + error.message);
    },
  });

  const handleResolve = (type: ResolutionType) => {
    resolveMutation.mutate({ type });
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          disabled={resolveMutation.isPending}
        >
          {resolveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreVertical className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem 
          onClick={() => handleResolve('resolved')}
          className="text-green-600 focus:text-green-600"
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          Marcar Resolvido
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleResolve('acknowledged')}
        >
          <Clock className="h-4 w-4 mr-2" />
          Reconhecer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={() => handleResolve('false_positive')}
          className="text-amber-600 focus:text-amber-600"
        >
          <XCircle className="h-4 w-4 mr-2" />
          Falso Positivo
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleResolve('suppressed')}
          className="text-muted-foreground"
        >
          <Ban className="h-4 w-4 mr-2" />
          Suprimir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Bulk actions component
interface BulkAlertActionsProps {
  selectedIds: string[];
  onComplete?: () => void;
}

export function BulkAlertActions({ selectedIds, onComplete }: BulkAlertActionsProps) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const bulkResolveMutation = useMutation({
    mutationFn: async (type: ResolutionType) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('system_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: `Resolução em massa: ${type}`,
        })
        .in('id', selectedIds);

      if (error) throw error;
      return { count: selectedIds.length, type };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['security-events'] });
      queryClient.invalidateQueries({ queryKey: ['system-alerts'] });
      toast.success(`${data.count} alertas marcados como ${data.type}`);
      onComplete?.();
    },
    onError: (error) => {
      toast.error('Erro na resolução em massa: ' + error.message);
    },
  });

  if (selectedIds.length === 0) return null;

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
      <span className="text-sm text-muted-foreground">
        {selectedIds.length} selecionado{selectedIds.length > 1 ? 's' : ''}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => bulkResolveMutation.mutate('resolved')}
        disabled={bulkResolveMutation.isPending}
      >
        <CheckCircle className="h-4 w-4 mr-1" />
        Resolver Todos
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => bulkResolveMutation.mutate('acknowledged')}
        disabled={bulkResolveMutation.isPending}
      >
        <Clock className="h-4 w-4 mr-1" />
        Reconhecer Todos
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => bulkResolveMutation.mutate('false_positive')}
        disabled={bulkResolveMutation.isPending}
        className="text-amber-600"
      >
        <AlertTriangle className="h-4 w-4 mr-1" />
        Falso Positivo
      </Button>
    </div>
  );
}
