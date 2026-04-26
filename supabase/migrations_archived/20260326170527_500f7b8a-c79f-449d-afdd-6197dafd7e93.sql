
CREATE TABLE IF NOT EXISTS public.kv_cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kv_cache_expires ON public.kv_cache(expires_at);

ALTER TABLE public.kv_cache ENABLE ROW LEVEL SECURITY;
