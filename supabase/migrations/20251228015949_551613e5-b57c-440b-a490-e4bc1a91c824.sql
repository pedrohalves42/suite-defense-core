-- ✅ AJUSTE 1: Índice funcional para normalização de domínios (www.x.com = x.com)
CREATE UNIQUE INDEX IF NOT EXISTS web_access_policies_domain_norm
ON public.web_access_policies (tenant_id, lower(regexp_replace(domain, '^www\.', '')));

-- Comentário explicativo
COMMENT ON INDEX web_access_policies_domain_norm IS 'Previne duplicatas de domínios normalizados (www.x.com e x.com são considerados iguais)';