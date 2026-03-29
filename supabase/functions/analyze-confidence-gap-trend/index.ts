import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GapTrendAnalysis {
  tenant_id: string;
  current_gap: number;
  avg_gap_30d: number;
  is_improving: boolean;
  worst_dimension: string | null;
  worst_dimension_gap: number;
  consecutive_alerts: number;
  alert_triggered: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  // V-1132: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    logger.info('[analyze-confidence-gap-trend] Starting trend analysis...');

    // Get all tenants
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name');

    if (tenantsError) throw tenantsError;

    const analyses: GapTrendAnalysis[] = [];

    for (const tenant of tenants || []) {
      logger.info(`[analyze-confidence-gap-trend] Analyzing tenant: ${tenant.id}`);

      // Get gap history for last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: gapHistory, error: gapError } = await supabase
        .from('audit_confidence_gaps')
        .select('*')
        .eq('tenant_id', tenant.id)
        .gte('calculated_at', thirtyDaysAgo)
        .order('calculated_at', { ascending: false });

      if (gapError) {
        logger.error(`Error fetching gap history for tenant ${tenant.id}:`, gapError);
        continue;
      }

      if (!gapHistory || gapHistory.length === 0) {
        logger.info(`No gap history for tenant ${tenant.id}`);
        continue;
      }

      const currentGap = gapHistory[0].confidence_gap;
      const avgGap30d = gapHistory.reduce((sum, g) => sum + g.confidence_gap, 0) / gapHistory.length;

      // Determine if trend is improving (lower gap is better)
      let isImproving = false;
      if (gapHistory.length >= 3) {
        const recentAvg = (gapHistory[0].confidence_gap + gapHistory[1].confidence_gap + gapHistory[2].confidence_gap) / 3;
        const oldAvg = gapHistory.length >= 6 
          ? (gapHistory[3].confidence_gap + gapHistory[4].confidence_gap + gapHistory[5].confidence_gap) / 3
          : avgGap30d;
        
        isImproving = recentAvg < oldAvg - 2;
      }

      // Find worst dimension from latest gap
      const worstDimension = gapHistory[0].worst_dimension as string | null;
      const worstDimensionGap = gapHistory[0].worst_gap || 0;

      // Count consecutive alerts (gaps increasing)
      let consecutiveAlerts = 0;
      for (let i = 0; i < gapHistory.length - 1; i++) {
        if (gapHistory[i].confidence_gap > gapHistory[i + 1].confidence_gap) {
          consecutiveAlerts++;
        } else {
          break;
        }
      }

      // Determine if alert should be triggered
      const alertTriggered = 
        consecutiveAlerts >= 3 || 
        currentGap > 10 || 
        (worstDimensionGap && Math.abs(worstDimensionGap) > 15);

      const analysis: GapTrendAnalysis = {
        tenant_id: tenant.id,
        current_gap: currentGap,
        avg_gap_30d: avgGap30d,
        is_improving: isImproving,
        worst_dimension: worstDimension,
        worst_dimension_gap: worstDimensionGap,
        consecutive_alerts: consecutiveAlerts,
        alert_triggered: alertTriggered,
      };

      analyses.push(analysis);

      // Create insight if alert triggered
      if (alertTriggered) {
        const insightTitle = consecutiveAlerts >= 3
          ? `Gap de Confianca em Degradacao Continua (${consecutiveAlerts} vezes)`
          : currentGap > 10
          ? `Gap de Confianca Critico: ${currentGap.toFixed(1)} pontos`
          : `Dimensao ${worstDimension} com Gap Critico: ${Math.abs(worstDimensionGap).toFixed(1)} pontos`;

        const dimensionLabels: Record<string, string> = {
          data_protection: 'Protecao de Dados',
          access_control: 'Controle de Acesso',
          audit_logging: 'Logs de Auditoria',
          vulnerability_management: 'Gestao de Vulnerabilidades',
          incident_response: 'Resposta a Incidentes',
          compliance: 'Conformidade',
          network_security: 'Seguranca de Rede',
          endpoint_protection: 'Protecao de Endpoints',
          cross_tenant_isolation: 'Isolamento Multi-tenant',
        };

        const suggestedAction = worstDimension
          ? `Focar melhorias em ${dimensionLabels[worstDimension] || worstDimension}. Executar auditoria detalhada nesta dimensao.`
          : 'Executar auditoria completa Ana + Red Team para identificar gaps especificos.';

        await supabase.from('ai_insights').insert({
          tenant_id: tenant.id,
          insight_type: 'compliance',
          severity: currentGap > 10 ? 'critical' : 'high',
          title: insightTitle,
          description: `A diferenca entre a avaliacao interna (Ana) e adversarial (Red Team) esta em ${currentGap.toFixed(1)} pontos. Tendencia: ${isImproving ? 'melhorando' : 'estavel ou piorando'}.`,
          evidence: {
            analysis,
            recommendation: suggestedAction,
          },
          suggested_action: suggestedAction,
        });

        logger.info(`[analyze-confidence-gap-trend] Alert created for tenant ${tenant.id}`);
      }
    }

    logger.info('[analyze-confidence-gap-trend] Analysis complete:', {
      tenantsAnalyzed: analyses.length,
      alertsTriggered: analyses.filter(a => a.alert_triggered).length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        analyses,
        summary: {
          tenants_analyzed: analyses.length,
          alerts_triggered: analyses.filter(a => a.alert_triggered).length,
          improving: analyses.filter(a => a.is_improving).length,
          not_improving: analyses.filter(a => !a.is_improving).length,
        },
      }),
      { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('[analyze-confidence-gap-trend] Error:', error);
    
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
