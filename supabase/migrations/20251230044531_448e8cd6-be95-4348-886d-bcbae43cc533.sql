-- =====================================================
-- PHASE 3: Software Knowledge Base & Auto-Classification
-- =====================================================

-- Create software knowledge base table
CREATE TABLE public.software_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  software_pattern TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('exact', 'contains', 'regex')),
  category TEXT NOT NULL,
  default_risk_level TEXT NOT NULL CHECK (default_risk_level IN ('low', 'medium', 'high', 'critical')),
  vendor_patterns TEXT[],
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.software_knowledge_base ENABLE ROW LEVEL SECURITY;

-- RLS policies - readable by all authenticated users, writable by admins
CREATE POLICY "software_knowledge_base_select" ON public.software_knowledge_base
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "software_knowledge_base_admin_all" ON public.software_knowledge_base
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Create index for pattern matching
CREATE INDEX idx_software_knowledge_base_active ON public.software_knowledge_base(is_active) WHERE is_active = true;
CREATE INDEX idx_software_knowledge_base_pattern ON public.software_knowledge_base(software_pattern);

-- Seed initial knowledge base
INSERT INTO public.software_knowledge_base (software_pattern, match_type, category, default_risk_level, description) VALUES
  -- Remote Access (Medium-High Risk)
  ('TeamViewer', 'contains', 'remote_access', 'medium', 'Software de acesso remoto comercial'),
  ('AnyDesk', 'contains', 'remote_access', 'medium', 'Software de acesso remoto'),
  ('LogMeIn', 'contains', 'remote_access', 'medium', 'Software de acesso remoto corporativo'),
  ('VNC', 'contains', 'remote_access', 'medium', 'Virtual Network Computing'),
  ('RustDesk', 'contains', 'remote_access', 'medium', 'Software de acesso remoto open-source'),
  ('RemotePC', 'contains', 'remote_access', 'medium', 'Software de acesso remoto'),
  ('Ammyy', 'contains', 'remote_access', 'high', 'Frequentemente usado em golpes'),
  
  -- P2P / Torrent (High Risk)
  ('uTorrent', 'contains', 'p2p', 'high', 'Cliente BitTorrent'),
  ('BitTorrent', 'contains', 'p2p', 'high', 'Cliente P2P'),
  ('qBittorrent', 'contains', 'p2p', 'high', 'Cliente BitTorrent open-source'),
  ('Deluge', 'contains', 'p2p', 'high', 'Cliente BitTorrent'),
  ('eMule', 'contains', 'p2p', 'high', 'Cliente P2P legado'),
  
  -- Browsers (Low Risk)
  ('Google Chrome', 'contains', 'browser', 'low', 'Navegador Google'),
  ('Mozilla Firefox', 'contains', 'browser', 'low', 'Navegador Firefox'),
  ('Microsoft Edge', 'contains', 'browser', 'low', 'Navegador Microsoft'),
  ('Opera', 'contains', 'browser', 'low', 'Navegador Opera'),
  ('Brave', 'contains', 'browser', 'low', 'Navegador focado em privacidade'),
  
  -- Security Tools (Low Risk)
  ('Windows Defender', 'contains', 'security', 'low', 'Antivirus Microsoft'),
  ('Malwarebytes', 'contains', 'security', 'low', 'Anti-malware'),
  ('Avast', 'contains', 'security', 'low', 'Antivirus'),
  ('AVG', 'contains', 'security', 'low', 'Antivirus'),
  ('Kaspersky', 'contains', 'security', 'low', 'Antivirus'),
  ('Norton', 'contains', 'security', 'low', 'Antivirus'),
  ('Bitdefender', 'contains', 'security', 'low', 'Antivirus'),
  
  -- Utilities (Low Risk)
  ('7-Zip', 'contains', 'utility', 'low', 'Compactador de arquivos'),
  ('WinRAR', 'contains', 'utility', 'low', 'Compactador de arquivos'),
  ('CCleaner', 'contains', 'utility', 'low', 'Limpeza de sistema'),
  ('Notepad++', 'contains', 'utility', 'low', 'Editor de texto'),
  ('VLC', 'contains', 'utility', 'low', 'Player de midia'),
  
  -- Business Apps (Low Risk)
  ('Microsoft Office', 'contains', 'business', 'low', 'Suite Office Microsoft'),
  ('Microsoft 365', 'contains', 'business', 'low', 'Suite Office Microsoft'),
  ('LibreOffice', 'contains', 'business', 'low', 'Suite Office open-source'),
  ('Slack', 'contains', 'business', 'low', 'Comunicacao empresarial'),
  ('Zoom', 'contains', 'meeting', 'low', 'Videoconferencia'),
  ('Microsoft Teams', 'contains', 'meeting', 'low', 'Comunicacao Microsoft'),
  ('Skype', 'contains', 'meeting', 'low', 'Comunicacao'),
  
  -- Messaging (Low Risk)
  ('Telegram', 'contains', 'messaging', 'low', 'Mensageiro'),
  ('Discord', 'contains', 'messaging', 'low', 'Comunicacao para comunidades'),
  ('WhatsApp', 'contains', 'messaging', 'low', 'Mensageiro'),
  ('Signal', 'contains', 'messaging', 'low', 'Mensageiro seguro'),
  
  -- Development (Low Risk)
  ('Visual Studio Code', 'contains', 'development', 'low', 'Editor de codigo'),
  ('Git', 'exact', 'development', 'low', 'Controle de versao'),
  ('Node.js', 'contains', 'development', 'low', 'Runtime JavaScript'),
  ('Python', 'contains', 'development', 'low', 'Linguagem de programacao'),
  ('Docker', 'contains', 'development', 'low', 'Containerizacao'),
  
  -- Potentially Unwanted (Medium-High Risk)
  ('Hola VPN', 'contains', 'vpn_free', 'high', 'VPN gratuita com riscos de privacidade'),
  ('Hotspot Shield Free', 'contains', 'vpn_free', 'medium', 'VPN gratuita'),
  ('Toolbar', 'contains', 'adware', 'medium', 'Barras de ferramentas potencialmente indesejadas'),
  ('Ask Toolbar', 'contains', 'adware', 'medium', 'Barra de ferramentas Ask'),
  
  -- Games (Medium Risk in corporate)
  ('Steam', 'exact', 'gaming', 'medium', 'Plataforma de jogos'),
  ('Epic Games', 'contains', 'gaming', 'medium', 'Plataforma de jogos'),
  ('Origin', 'exact', 'gaming', 'medium', 'Plataforma de jogos EA'),
  ('Battle.net', 'contains', 'gaming', 'medium', 'Plataforma de jogos Blizzard');

-- Create classification function
CREATE OR REPLACE FUNCTION public.classify_software_risk()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_knowledge RECORD;
  v_risk TEXT := 'unknown';
  v_category TEXT;
BEGIN
  -- Skip if risk_level already set (manual override)
  IF NEW.risk_level IS NOT NULL AND NEW.risk_level != 'unknown' THEN
    RETURN NEW;
  END IF;

  -- Search knowledge base for matches
  FOR v_knowledge IN 
    SELECT * FROM software_knowledge_base 
    WHERE is_active = true
    ORDER BY 
      CASE match_type 
        WHEN 'exact' THEN 1 
        WHEN 'contains' THEN 2 
        WHEN 'regex' THEN 3 
      END
  LOOP
    IF v_knowledge.match_type = 'exact' AND LOWER(NEW.name) = LOWER(v_knowledge.software_pattern) THEN
      v_risk := v_knowledge.default_risk_level;
      v_category := v_knowledge.category;
      EXIT;
    ELSIF v_knowledge.match_type = 'contains' AND LOWER(NEW.name) LIKE '%' || LOWER(v_knowledge.software_pattern) || '%' THEN
      v_risk := v_knowledge.default_risk_level;
      v_category := v_knowledge.category;
      EXIT;
    ELSIF v_knowledge.match_type = 'regex' THEN
      BEGIN
        IF NEW.name ~ v_knowledge.software_pattern THEN
          v_risk := v_knowledge.default_risk_level;
          v_category := v_knowledge.category;
          EXIT;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Invalid regex, skip
        CONTINUE;
      END;
    END IF;
  END LOOP;
  
  NEW.risk_level := v_risk;
  RETURN NEW;
END;
$$;

-- Create trigger for auto-classification
DROP TRIGGER IF EXISTS trg_classify_software ON software_inventory;
CREATE TRIGGER trg_classify_software
  BEFORE INSERT OR UPDATE OF name ON software_inventory
  FOR EACH ROW
  EXECUTE FUNCTION classify_software_risk();

-- Reclassify existing software inventory
UPDATE software_inventory si
SET risk_level = COALESCE(
  (SELECT skb.default_risk_level 
   FROM software_knowledge_base skb 
   WHERE skb.is_active = true
     AND (
       (skb.match_type = 'exact' AND LOWER(si.name) = LOWER(skb.software_pattern))
       OR (skb.match_type = 'contains' AND LOWER(si.name) LIKE '%' || LOWER(skb.software_pattern) || '%')
     )
   ORDER BY 
     CASE skb.match_type WHEN 'exact' THEN 1 WHEN 'contains' THEN 2 ELSE 3 END
   LIMIT 1
  ),
  'unknown'
)
WHERE risk_level IS NULL OR risk_level = 'unknown';

-- Create function to get software risk summary
CREATE OR REPLACE FUNCTION public.get_software_risk_summary(p_tenant_id UUID)
RETURNS TABLE(
  risk_level TEXT,
  count BIGINT,
  category_breakdown JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate tenant access
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: No access to tenant'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH categorized AS (
    SELECT 
      si.risk_level,
      COALESCE(skb.category, 'uncategorized') as category,
      COUNT(*) as cnt
    FROM software_inventory si
    LEFT JOIN software_knowledge_base skb ON (
      skb.is_active = true AND (
        (skb.match_type = 'exact' AND LOWER(si.name) = LOWER(skb.software_pattern))
        OR (skb.match_type = 'contains' AND LOWER(si.name) LIKE '%' || LOWER(skb.software_pattern) || '%')
      )
    )
    WHERE si.tenant_id = p_tenant_id
    GROUP BY si.risk_level, COALESCE(skb.category, 'uncategorized')
  )
  SELECT 
    c.risk_level,
    SUM(c.cnt)::BIGINT as count,
    jsonb_object_agg(c.category, c.cnt) as category_breakdown
  FROM categorized c
  GROUP BY c.risk_level
  ORDER BY 
    CASE c.risk_level 
      WHEN 'critical' THEN 1 
      WHEN 'high' THEN 2 
      WHEN 'medium' THEN 3 
      WHEN 'low' THEN 4 
      ELSE 5 
    END;
END;
$$;