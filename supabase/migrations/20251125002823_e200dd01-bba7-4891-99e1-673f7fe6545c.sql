-- FASE 1: Popular tabelas de releases com versao atual v3.8.0-REALTIME-OS-TYPE-FIX

-- Obter script content atual do Windows agent
DO $$
DECLARE
  v_script_content TEXT;
  v_sha256 TEXT;
BEGIN
  -- Para v3.8.0, usar script atual (sera sincronizado posteriormente)
  v_script_content := 'PLACEHOLDER_SCRIPT_CONTENT';
  v_sha256 := encode(digest(v_script_content, 'sha256'), 'hex');
  
  -- Inserir na tabela agent_releases
  INSERT INTO public.agent_releases (
    platform, 
    version, 
    channel, 
    is_active, 
    script_content, 
    sha256, 
    release_notes
  ) VALUES (
    'windows', 
    'v3.8.0-REALTIME-OS-TYPE-FIX', 
    'stable', 
    true,
    v_script_content,
    v_sha256, 
    'Realtime metrics + os_type field fix + multiple instances cleanup support'
  )
  ON CONFLICT (platform, version, channel) DO UPDATE
  SET is_active = true, script_content = EXCLUDED.script_content, sha256 = EXCLUDED.sha256;
  
  -- Inserir na tabela agent_versions
  INSERT INTO public.agent_versions (
    platform, 
    version, 
    is_latest, 
    sha256, 
    size_bytes,
    download_url, 
    release_notes
  ) VALUES (
    'windows', 
    'v3.8.0-REALTIME-OS-TYPE-FIX', 
    true,
    v_sha256,
    27041, -- tamanho aproximado do script v3.8.0
    'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-agent-update',
    'Realtime metrics + os_type field fix + multiple instances cleanup support'
  )
  ON CONFLICT (platform, version) DO UPDATE
  SET is_latest = true, sha256 = EXCLUDED.sha256, size_bytes = EXCLUDED.size_bytes;
  
  RAISE NOTICE 'Release v3.8.0-REALTIME-OS-TYPE-FIX registrada com sucesso';
END $$;