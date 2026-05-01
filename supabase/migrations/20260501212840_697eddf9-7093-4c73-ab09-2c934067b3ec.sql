-- 1. Estender validade de chaves de enrollment
UPDATE public.enrollment_keys 
SET expires_at = now() + interval '1 year' 
WHERE expires_at > now() OR expires_at IS NULL;

-- 2. Garantir que agentes offline voltem a ser ativos no heartbeat
-- (Isso também pode ser feito no código, mas aqui garantimos retroativamente)
UPDATE public.agents 
SET status = 'active' 
WHERE status = 'offline' AND last_heartbeat > now() - interval '1 hour';
