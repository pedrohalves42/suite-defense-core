-- FIX: Habilitar RLS nas particoes individuais de hmac_signatures

-- Habilitar RLS em cada particao
ALTER TABLE public.hmac_signatures_2025_12 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hmac_signatures_2026_01 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hmac_signatures_2026_02 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hmac_signatures_2026_03 ENABLE ROW LEVEL SECURITY;