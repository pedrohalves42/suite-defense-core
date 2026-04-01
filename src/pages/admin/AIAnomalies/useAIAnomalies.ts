import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export interface AIAnomaly {
  id: string;
  tenant_id: string;
  function_name: string;
  anomaly_type: string;
  severity: 'info' | 'warning' | 'critical';
  context: Record<string, any>;
  detected_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution: string | null;
}

export interface AnomalyFilter {
  severity: string;
  type: string;
  reviewed: string;
  search: string;
}

export function useAIAnomalies() {
  const { tenant } = useTenant();
  const { toast } = useToast();

  const [anomalies, setAnomalies] = useState<AIAnomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AnomalyFilter>({
    severity: 'all', type: 'all', reviewed: 'pending', search: '',
  });
  const [selectedAnomaly, setSelectedAnomaly] = useState<AIAnomaly | null>(null);
  const [resolution, setResolution] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const fetchAnomalies = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('ai_anomalies')
        .select('id, tenant_id, anomaly_type, severity, function_name, context, detected_at, reviewed_at, reviewed_by, resolution, created_at')
        .eq('tenant_id', tenant.id)
        .order('detected_at', { ascending: false })
        .limit(100);

      if (filter.severity !== 'all') query = query.eq('severity', filter.severity);
      if (filter.type !== 'all') query = query.eq('anomaly_type', filter.type);
      if (filter.reviewed === 'pending') query = query.is('reviewed_at', null);
      else if (filter.reviewed === 'reviewed') query = query.not('reviewed_at', 'is', null);

      const { data, error } = await query;
      if (error) throw error;
      setAnomalies((data as AIAnomaly[]) || []);
    } catch (error) {
      logger.error('Error fetching anomalies:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar as anomalias.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, filter.severity, filter.type, filter.reviewed, toast]);

  useEffect(() => {
    if (tenant?.id) fetchAnomalies();
  }, [tenant?.id, fetchAnomalies]);

  const handleReview = async () => {
    if (!selectedAnomaly) return;
    setReviewing(true);
    try {
      const { error } = await supabase
        .from('ai_anomalies')
        .update({ reviewed_at: new Date().toISOString(), resolution })
        .eq('id', selectedAnomaly.id)
        .eq('tenant_id', tenant!.id);
      if (error) throw error;
      toast({ title: 'Revisão salva', description: 'A anomalia foi marcada como revisada.' });
      setSelectedAnomaly(null);
      setResolution('');
      fetchAnomalies();
    } catch (error) {
      logger.error('Error reviewing anomaly:', error);
      toast({ title: 'Erro', description: 'Não foi possível salvar a revisão.', variant: 'destructive' });
    } finally {
      setReviewing(false);
    }
  };

  const filteredAnomalies = anomalies.filter((a) => {
    if (!filter.search) return true;
    const search = filter.search.toLowerCase();
    return a.function_name.toLowerCase().includes(search) ||
      a.anomaly_type.toLowerCase().includes(search) ||
      JSON.stringify(a.context).toLowerCase().includes(search);
  });

  const stats = {
    total: anomalies.length,
    critical: anomalies.filter(a => a.severity === 'critical').length,
    warning: anomalies.filter(a => a.severity === 'warning').length,
    pending: anomalies.filter(a => !a.reviewed_at).length,
  };

  return {
    loading, filter, setFilter,
    selectedAnomaly, setSelectedAnomaly,
    resolution, setResolution, reviewing,
    filteredAnomalies, stats, handleReview,
  };
}
