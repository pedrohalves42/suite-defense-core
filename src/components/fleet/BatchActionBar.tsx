import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  RefreshCw, Search, XCircle, Loader2, CheckSquare, Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useStepUpAuth } from '@/hooks/useStepUpAuth';
import { MFAVerificationDialog } from '@/components/mfa/MFAVerificationDialog';

interface BatchActionBarProps {
  selectedIds: string[];
  selectedNames: string[];
  onClearSelection: () => void;
}

export function BatchActionBar({ selectedIds, selectedNames, onClearSelection }: BatchActionBarProps) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState<string | null>(null);

  // ADR-008: Step-up auth for batch actions (critical operations)
  const {
    executeWithStepUp,
    needsVerification,
    onVerificationSuccess,
    onVerificationCancel,
  } = useStepUpAuth({ 
    reason: 'Ações em massa requerem verificação de segurança adicional.',
    windowMs: 5 * 60 * 1000 // 5 min window
  });

  if (selectedIds.length === 0) return null;

  const createBatchJobs = async (type: string, label: string) => {
    if (!tenant?.id) return;
    setLoading(type);
    
    try {
      const jobs = selectedNames.map(name => ({
        tenant_id: tenant.id,
        agent_name: name,
        type,
        status: 'pending' as const,
        priority: type === 'update_agent' ? 10 : 5,
        payload: {},
        payload_hash: '',
      }));

      const { error } = await supabase.from('jobs').insert(jobs);
      if (error) throw error;

      toast.success(`${label} agendado para ${selectedIds.length} computador${selectedIds.length > 1 ? 'es' : ''}`, {
        duration: 5000,
      });
      
      queryClient.invalidateQueries({ queryKey: ['fleet-health'] });
      queryClient.invalidateQueries({ queryKey: ['agent-health'] });
      onClearSelection();
    } catch (err) {
      toast.error(`Erro ao agendar ${label.toLowerCase()}`, {
        description: err.message,
      });
    } finally {
      setLoading(null);
    }
  };

  // Wrap batch actions with step-up auth
  const handleBatchAction = (type: string, label: string) => {
    executeWithStepUp(async () => {
      await createBatchJobs(type, label);
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50"
      >
        <div className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border",
          "bg-card/95 backdrop-blur-md"
        )}>
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            <Badge variant="secondary" className="text-xs">
              {selectedIds.length} selecionado{selectedIds.length > 1 ? 's' : ''}
            </Badge>
          </div>

          <div className="h-4 w-px bg-border" />

          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={!!loading}
            onClick={() => handleBatchAction('update_agent', 'Atualização')}
          >
            {loading === 'update_agent' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Atualizar
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={!!loading}
            onClick={() => handleBatchAction('full_scan', 'Scan completo')}
          >
            {loading === 'full_scan' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Search className="h-3 w-3 mr-1" />}
            Scan
          </Button>

          <div className="h-4 w-px bg-border" />

          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground"
            onClick={onClearSelection}
          >
            <XCircle className="h-3 w-3 mr-1" /> Limpar
          </Button>
        </div>

        {/* MFA verification dialog for step-up auth */}
        <MFAVerificationDialog
          open={needsVerification}
          onOpenChange={(open) => !open && onVerificationCancel()}
          onSuccess={onVerificationSuccess}
          onCancel={onVerificationCancel}
        />
      </motion.div>
    </AnimatePresence>
  );
}
