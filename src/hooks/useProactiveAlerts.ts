import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useUnifiedMetrics } from './useUnifiedMetrics';

/**
 * Proactive alerts hook - monitors security posture changes
 * and shows toast notifications when degradation is detected.
 */
export function useProactiveAlerts() {
  const { metrics } = useUnifiedMetrics();
  const prevMetricsRef = useRef<typeof metrics>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!metrics) return;

    // Skip on first load to avoid false alerts
    if (!initializedRef.current) {
      initializedRef.current = true;
      prevMetricsRef.current = metrics;
      return;
    }

    const prev = prevMetricsRef.current;
    if (!prev) {
      prevMetricsRef.current = metrics;
      return;
    }

    // Check for new critical alerts
    const prevCritical = prev.alerts?.critical || 0;
    const newCritical = metrics.alerts?.critical || 0;
    if (newCritical > prevCritical) {
      const diff = newCritical - prevCritical;
      toast.error(`🚨 ${diff} novo${diff > 1 ? 's' : ''} alerta${diff > 1 ? 's' : ''} crítico${diff > 1 ? 's' : ''} detectado${diff > 1 ? 's' : ''}`, {
        description: 'Verifique o monitoramento de segurança imediatamente.',
        duration: 10000,
        action: {
          label: 'Ver alertas',
          onClick: () => window.location.assign('/admin/security-monitoring'),
        },
      });
    }

    // Check for agents going offline
    const prevOffline = prev.agents?.offline || 0;
    const newOffline = metrics.agents?.offline || 0;
    if (newOffline > prevOffline) {
      const diff = newOffline - prevOffline;
      toast.warning(`⚠️ ${diff} computador${diff > 1 ? 'es' : ''} ficou${diff > 1 ? 'ram' : ''} offline`, {
        description: 'Computadores offline não recebem proteção.',
        duration: 8000,
        action: {
          label: 'Ver agentes',
          onClick: () => window.location.assign('/admin/agent-center'),
        },
      });
    }

    // Check for security score drop
    const prevScore = prev.securityScore || 100;
    const newScore = metrics.securityScore || 100;
    if (newScore < prevScore && (prevScore - newScore) >= 10) {
      toast.warning(`📉 Nota de segurança caiu de ${prevScore}% para ${newScore}%`, {
        description: 'Revise as recomendações do Assistente de Segurança.',
        duration: 8000,
      });
    }

    // Check for new critical vulnerabilities
    const prevVulns = prev.vulnerabilities?.critical || 0;
    const newVulns = metrics.vulnerabilities?.critical || 0;
    if (newVulns > prevVulns) {
      const diff = newVulns - prevVulns;
      toast.error(`🐛 ${diff} nova${diff > 1 ? 's' : ''} vulnerabilidade${diff > 1 ? 's' : ''} crítica${diff > 1 ? 's' : ''} encontrada${diff > 1 ? 's' : ''}`, {
        description: 'Corrija antes que sejam exploradas.',
        duration: 10000,
        action: {
          label: 'Ver vulnerabilidades',
          onClick: () => window.location.assign('/admin/vulnerabilities'),
        },
      });
    }

    prevMetricsRef.current = metrics;
  }, [metrics]);
}
