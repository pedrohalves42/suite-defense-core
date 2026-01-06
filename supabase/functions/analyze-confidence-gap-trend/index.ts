import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GapTrendAnalysis {
  tenant_id: string;
  current_gap: number;
  avg_gap_30d: number;
  trend_direction: 'improving' | 'degrading' | 'stable';
  worst_dimension: string | null;
  worst_dimension_gap: number;
  consecutive_degradations: number;
  alert_triggered: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[analyze-confidence-gap-trend] Starting trend analysis...');

    // Get all tenants
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name');

    if (tenantsError) throw tenantsError;

    const analyses: GapTrendAnalysis[] = [];

    for (const tenant of tenants || []) {
      console.log(`[analyze-confidence-gap-trend] Analyzing tenant: ${tenant.id}`);

      // Get gap history for last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: gapHistory, error: gapError } = await supabase
        .from('audit_confidence_gaps')
        .select('*')
        .eq('tenant_id', tenant.id)
        .gte('calculated_at', thirtyDaysAgo)
        .order('calculated_at', { ascending: false });

      if (gapError) {
        console.error(`Error fetching gap history for tenant ${tenant.id}:`, gapError);
        continue;
      }

      if (!gapHistory || gapHistory.length === 0) {
        console.log(`No gap history for tenant ${tenant.id}`);
        continue;
      }

      const currentGap = gapHistory[0].confidence_gap;
      const avgGap30d = gapHistory.reduce((sum, g) => sum + g.confidence_gap, 0) / gapHistory.length;

      // Determine trend direction
      let trendDirection: 'improving' | 'degrading' | 'stable' = 'stable';
      if (gapHistory.length >= 3) {
        const recentAvg = (gapHistory[0].confidence_gap + gapHistory[1].confidence_gap + gapHistory[2].confidence_gap) / 3;
        const oldAvg = gapHistory.length >= 6 
          ? (gapHistory[3].confidence_gap + gapHistory[4].confidence_gap + gapHistory[5].confidence_gap) / 3
          : avgGap30d;
        
        if (recentAvg < oldAvg - 2) trendDirection = 'improving';
        else if (recentAvg > oldAvg + 2) trendDirection = 'degrading';
      }

      // Find worst dimension from latest gap
      const worstDimension = gapHistory[0].worst_dimension as string | null;
      const worstDimensionGap = gapHistory[0].worst_gap || 0;

      // Count consecutive degradations
      let consecutiveDegradations = 0;
      for (let i = 0; i < gapHistory.length - 1; i++) {
        if (gapHistory[i].confidence_gap > gapHistory[i + 1].confidence_gap) {
          consecutiveDegradations++;
        } else {
          break;
        }
      }

      // Determine if alert should be triggered
      const alertTriggered = 
        consecutiveDegradations >= 3 || 
        currentGap > 10 || 
        (worstDimensionGap && Math.abs(worstDimensionGap) > 15);

      const analysis: GapTrendAnalysis = {
        tenant_id: tenant.id,
        current_gap: currentGap,
        avg_gap_30d: avgGap30d,
        trend_direction: trendDirection,
        worst_dimension: worstDimension,
        worst_dimension_gap: worstDimensionGap,
        consecutive_degradations: consecutiveDegradations,
        alert_triggered: alertTriggered,
      };

      analyses.push(analysis);

      // Create insight if alert triggered
      if (alertTriggered) {
        const insightTitle = consecutiveDegradations >= 3
          ? `Gap de Confiança em Degradação Contínua (${consecutiveDegradations} vezes)`
          : currentGap > 10
          ? `Gap de Confiança Crítico: ${currentGap.toFixed(1)} pontos`
          : `Dimensão ${worstDimension} com Gap Crítico: ${Math.abs(worstDimensionGap).toFixed(1)} pontos`;

        const dimensionLabels: Record<string, string> = {
          data_protection: 'Proteção de Dados',
          access_control: 'Controle de Acesso',
          audit_logging: 'Logs de Auditoria',
          vulnerability_management: 'Gestão de Vulnerabilidades',
          incident_response: 'Resposta a Incidentes',
          compliance: 'Conformidade',
          network_security: 'Segurança de Rede',
          endpoint_protection: 'Proteção de Endpoints',
          cross_tenant_isolation: 'Isolamento Multi-tenant',
        };

        const suggestedAction = worstDimension
          ? `Focar melhorias em ${dimensionLabels[worstDimension] || worstDimension}. Executar auditoria detalhada nesta dimensão.`
          : 'Executar auditoria completa Ana + Red Team para identificar gaps específicos.';

        await supabase.from('ai_insights').insert({
          tenant_id: tenant.id,
          insight_type: 'compliance',
          severity: currentGap > 10 ? 'critical' : 'high',
          title: insightTitle,
          description: `A diferença entre a avaliação interna (Ana) e adversarial (Red Team) está em ${currentGap.toFixed(1)} pontos. Tendência: ${trendDirection === 'improving' ? 'melhorando' : trendDirection === 'degrading' ? 'piorando' : 'estável'}.`,
          evidence: {
            analysis,
            recommendation: suggestedAction,
          },
          suggested_action: suggestedAction,
        });

        console.log(`[analyze-confidence-gap-trend] Alert created for tenant ${tenant.id}`);
      }
    }

    console.log('[analyze-confidence-gap-trend] Analysis complete:', {
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
          degrading: analyses.filter(a => a.trend_direction === 'degrading').length,
          improving: analyses.filter(a => a.trend_direction === 'improving').length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[analyze-confidence-gap-trend] Error:', error);
    
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
