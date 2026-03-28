-- [OK]  AJUSTE 1: Indice funcional para normalizacao de dominios (www.x.com = x.com)
CREATE UNIQUE INDEX IF NOT EXISTS web_access_policies_domain_norm
ON public.web_access_policies (tenant_id, lower(regexp_replace(domain, '^www\.', '')));

-- Comentario explicativo
COMMENT ON INDEX web_access_policies_domain_norm IS 'Previne duplicatas de dominios normalizados (www.x.com e x.com sao considerados iguais)';