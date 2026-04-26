
-- ============================================
-- RLS para particoes de agent_system_metrics
-- ============================================

-- Habilitar RLS em todas as particoes
ALTER TABLE IF EXISTS public.agent_system_metrics_2025_12 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_system_metrics_2026_01 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_system_metrics_2026_02 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_system_metrics_2026_03 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_system_metrics_2026_04 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_system_metrics_2026_05 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_system_metrics_2026_06 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_system_metrics_2026_07 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_system_metrics_2026_08 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_system_metrics_2026_09 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_system_metrics_2026_10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_system_metrics_2026_11 ENABLE ROW LEVEL SECURITY;

-- Politicas RLS para 2025_12
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON public.agent_system_metrics_2025_12;
CREATE POLICY "Admins can view tenant metrics" ON public.agent_system_metrics_2025_12
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2025_12;
CREATE POLICY "Super admins can view all metrics" ON public.agent_system_metrics_2025_12
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

-- Politicas RLS para 2026_01
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON public.agent_system_metrics_2026_01;
CREATE POLICY "Admins can view tenant metrics" ON public.agent_system_metrics_2026_01
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2026_01;
CREATE POLICY "Super admins can view all metrics" ON public.agent_system_metrics_2026_01
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

-- Politicas RLS para 2026_02
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON public.agent_system_metrics_2026_02;
CREATE POLICY "Admins can view tenant metrics" ON public.agent_system_metrics_2026_02
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2026_02;
CREATE POLICY "Super admins can view all metrics" ON public.agent_system_metrics_2026_02
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

-- Politicas RLS para 2026_03
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON public.agent_system_metrics_2026_03;
CREATE POLICY "Admins can view tenant metrics" ON public.agent_system_metrics_2026_03
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2026_03;
CREATE POLICY "Super admins can view all metrics" ON public.agent_system_metrics_2026_03
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

-- Politicas RLS para 2026_04
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON public.agent_system_metrics_2026_04;
CREATE POLICY "Admins can view tenant metrics" ON public.agent_system_metrics_2026_04
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2026_04;
CREATE POLICY "Super admins can view all metrics" ON public.agent_system_metrics_2026_04
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

-- Politicas RLS para 2026_05
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON public.agent_system_metrics_2026_05;
CREATE POLICY "Admins can view tenant metrics" ON public.agent_system_metrics_2026_05
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2026_05;
CREATE POLICY "Super admins can view all metrics" ON public.agent_system_metrics_2026_05
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

-- Politicas RLS para 2026_06
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON public.agent_system_metrics_2026_06;
CREATE POLICY "Admins can view tenant metrics" ON public.agent_system_metrics_2026_06
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2026_06;
CREATE POLICY "Super admins can view all metrics" ON public.agent_system_metrics_2026_06
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

-- Politicas RLS para 2026_07
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON public.agent_system_metrics_2026_07;
CREATE POLICY "Admins can view tenant metrics" ON public.agent_system_metrics_2026_07
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2026_07;
CREATE POLICY "Super admins can view all metrics" ON public.agent_system_metrics_2026_07
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

-- Politicas RLS para 2026_08
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON public.agent_system_metrics_2026_08;
CREATE POLICY "Admins can view tenant metrics" ON public.agent_system_metrics_2026_08
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2026_08;
CREATE POLICY "Super admins can view all metrics" ON public.agent_system_metrics_2026_08
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

-- Politicas RLS para 2026_09
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON public.agent_system_metrics_2026_09;
CREATE POLICY "Admins can view tenant metrics" ON public.agent_system_metrics_2026_09
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2026_09;
CREATE POLICY "Super admins can view all metrics" ON public.agent_system_metrics_2026_09
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

-- Politicas RLS para 2026_10
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON public.agent_system_metrics_2026_10;
CREATE POLICY "Admins can view tenant metrics" ON public.agent_system_metrics_2026_10
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2026_10;
CREATE POLICY "Super admins can view all metrics" ON public.agent_system_metrics_2026_10
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);

-- Politicas RLS para 2026_11
DROP POLICY IF EXISTS "Admins can view tenant metrics" ON public.agent_system_metrics_2026_11;
CREATE POLICY "Admins can view tenant metrics" ON public.agent_system_metrics_2026_11
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view all metrics" ON public.agent_system_metrics_2026_11;
CREATE POLICY "Super admins can view all metrics" ON public.agent_system_metrics_2026_11
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role)
);
