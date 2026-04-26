-- FIX: Adicionar politicas RLS explicitas nas particoes hmac_signatures

-- Politicas para 2025_12
DROP POLICY IF EXISTS "No public access" ON public.hmac_signatures_2025_12;
CREATE POLICY "No public access" ON public.hmac_signatures_2025_12 FOR SELECT TO authenticated USING (false);

-- Politicas para 2026_01
DROP POLICY IF EXISTS "No public access" ON public.hmac_signatures_2026_01;
CREATE POLICY "No public access" ON public.hmac_signatures_2026_01 FOR SELECT TO authenticated USING (false);

-- Politicas para 2026_02
DROP POLICY IF EXISTS "No public access" ON public.hmac_signatures_2026_02;
CREATE POLICY "No public access" ON public.hmac_signatures_2026_02 FOR SELECT TO authenticated USING (false);

-- Politicas para 2026_03
DROP POLICY IF EXISTS "No public access" ON public.hmac_signatures_2026_03;
CREATE POLICY "No public access" ON public.hmac_signatures_2026_03 FOR SELECT TO authenticated USING (false);