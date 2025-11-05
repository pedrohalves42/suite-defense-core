-- Criar tabela dedicada para tokens de agentes
CREATE TABLE public.agent_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Índices para performance
CREATE INDEX idx_agent_tokens_token ON public.agent_tokens(token) WHERE is_active = true;
CREATE INDEX idx_agent_tokens_agent_id ON public.agent_tokens(agent_id);

-- RLS para agent_tokens (apenas service role)
ALTER TABLE public.agent_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role tem acesso total aos tokens"
  ON public.agent_tokens
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins podem ler tokens"
  ON public.agent_tokens
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Criar tabela de rate limiting
CREATE TABLE public.rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_request_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  blocked_until TIMESTAMP WITH TIME ZONE
);

-- Índice composto para lookup rápido
CREATE UNIQUE INDEX idx_rate_limits_identifier_endpoint 
  ON public.rate_limits(identifier, endpoint);

-- RLS para rate_limits (apenas service role)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role tem acesso total aos rate limits"
  ON public.rate_limits
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Adicionar campo hmac_secret na tabela agents
ALTER TABLE public.agents ADD COLUMN hmac_secret TEXT;

-- Criar tabela para armazenar assinaturas HMAC usadas (prevenção de replay)
CREATE TABLE public.hmac_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signature TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para verificação rápida
CREATE UNIQUE INDEX idx_hmac_signatures_signature ON public.hmac_signatures(signature);

-- Limpeza automática de assinaturas antigas (mais de 5 minutos)
CREATE INDEX idx_hmac_signatures_used_at ON public.hmac_signatures(used_at);

-- RLS para hmac_signatures
ALTER TABLE public.hmac_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role tem acesso total às assinaturas HMAC"
  ON public.hmac_signatures
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Criar tabela para virus scans
CREATE TABLE public.virus_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_path TEXT NOT NULL,
  scan_result JSONB,
  is_malicious BOOLEAN,
  positives INTEGER,
  total_scans INTEGER,
  scanned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  virustotal_permalink TEXT
);

-- Índices
CREATE INDEX idx_virus_scans_agent_name ON public.virus_scans(agent_name);
CREATE INDEX idx_virus_scans_file_hash ON public.virus_scans(file_hash);
CREATE INDEX idx_virus_scans_is_malicious ON public.virus_scans(is_malicious);

-- RLS para virus_scans
ALTER TABLE public.virus_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar virus scans"
  ON public.virus_scans
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Operators e viewers podem ler virus scans"
  ON public.virus_scans
  FOR SELECT
  USING (has_role(auth.uid(), 'operator'::app_role) OR has_role(auth.uid(), 'viewer'::app_role));

CREATE POLICY "Service role tem acesso total aos virus scans"
  ON public.virus_scans
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Função para limpar assinaturas HMAC antigas
CREATE OR REPLACE FUNCTION public.cleanup_old_hmac_signatures()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.hmac_signatures
  WHERE used_at < now() - INTERVAL '5 minutes';
END;
$$;

-- Função para limpar rate limits antigos
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < now() - INTERVAL '1 hour';
END;
$$;