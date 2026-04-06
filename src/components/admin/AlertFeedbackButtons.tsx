import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface AlertFeedbackButtonsProps {
  alertId: string;
  tenantId: string;
  currentFeedback?: string | null;
}

export function AlertFeedbackButtons({ alertId, tenantId, currentFeedback }: AlertFeedbackButtonsProps) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const alreadyReviewed = currentFeedback === 'true_positive' || currentFeedback === 'false_positive';

  const submitFeedback = async (isTruePositive: boolean) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase.rpc('submit_alert_feedback', {
        p_alert_id: alertId,
        p_tenant_id: tenantId,
        p_user_id: user.id,
        p_is_true_positive: isTruePositive,
      });
      if (error) throw error;

      toast.success(isTruePositive ? 'Marcado como ameaça real' : 'Marcado como falso positivo');
      queryClient.invalidateQueries({ queryKey: ['system-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['detection-rules'] });
    } catch (err: unknown) {
      toast.error(`Erro ao enviar feedback: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  if (alreadyReviewed) {
    return (
      <Badge
        variant={currentFeedback === 'true_positive' ? 'destructive' : 'secondary'}
        className="text-xs"
      >
        {currentFeedback === 'true_positive' ? '🔴 Ameaça Real' : '⚪ Falso Positivo'}
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
        disabled={loading}
        onClick={() => submitFeedback(true)}
        title="Ameaça Real"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3 mr-1" />}
        Ameaça
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs text-muted-foreground hover:bg-muted"
        disabled={loading}
        onClick={() => submitFeedback(false)}
        title="Falso Positivo"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsDown className="h-3 w-3 mr-1" />}
        Falso Positivo
      </Button>
    </div>
  );
}
