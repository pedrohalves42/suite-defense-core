-- Evoluir view v_confidence_gap_trend com trend 90d e direcao
-- Usando CTEs separadas para evitar nested window functions
DROP VIEW IF EXISTS v_confidence_gap_trend;

CREATE OR REPLACE VIEW v_confidence_gap_trend AS
WITH base_data AS (
  SELECT 
    cg.*,
    LAG(cg.confidence_gap) OVER (PARTITION BY cg.tenant_id ORDER BY cg.created_at) as prev_gap,
    AVG(cg.confidence_gap) OVER (
      PARTITION BY cg.tenant_id 
      ORDER BY cg.created_at 
      ROWS BETWEEN 30 PRECEDING AND CURRENT ROW
    ) as avg_gap_30d,
    AVG(cg.confidence_gap) OVER (
      PARTITION BY cg.tenant_id 
      ORDER BY cg.created_at 
      ROWS BETWEEN 90 PRECEDING AND CURRENT ROW
    ) as avg_gap_90d
  FROM audit_confidence_gaps cg
),
with_decrease_flag AS (
  SELECT 
    bd.*,
    CASE WHEN bd.confidence_gap < COALESCE(bd.prev_gap, bd.confidence_gap) THEN 1 ELSE 0 END as is_decrease
  FROM base_data bd
),
with_consecutive AS (
  SELECT 
    wdf.*,
    SUM(wdf.is_decrease) OVER (
      PARTITION BY wdf.tenant_id 
      ORDER BY wdf.created_at 
      ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) as consecutive_decrease_count
  FROM with_decrease_flag wdf
)
SELECT 
  wc.id,
  wc.tenant_id,
  wc.created_at,
  wc.ana_score,
  wc.red_score,
  wc.confidence_gap,
  wc.health_status::text as health_status,
  (wc.confidence_gap - COALESCE(wc.prev_gap, wc.confidence_gap))::integer as gap_delta,
  wc.alert_triggered,
  ROUND(wc.avg_gap_30d::numeric, 1) as avg_gap_30d,
  ROUND(wc.avg_gap_90d::numeric, 1) as avg_gap_90d,
  CASE 
    WHEN wc.avg_gap_90d IS NOT NULL AND wc.prev_gap IS NOT NULL 
    THEN ROUND((wc.confidence_gap - wc.avg_gap_90d)::numeric, 1)
    ELSE NULL 
  END as gap_change,
  CASE 
    WHEN wc.confidence_gap > wc.avg_gap_90d + 5 THEN 'improving'
    WHEN wc.confidence_gap < wc.avg_gap_90d - 5 THEN 'degrading'
    ELSE 'stable'
  END as trend_direction,
  (wc.consecutive_decrease_count >= 3) as consecutive_decrease,
  wc.consecutive_decrease_count::integer as consecutive_alerts
FROM with_consecutive wc
ORDER BY wc.tenant_id, wc.created_at DESC;