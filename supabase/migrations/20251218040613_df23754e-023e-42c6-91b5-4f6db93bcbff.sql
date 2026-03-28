-- =====================================================
-- FASE 1: SOFTWARE VULNERABILITY BASELINE
-- Tabela para cruzamento software ? CVE ? risco real
-- =====================================================

CREATE TABLE IF NOT EXISTS public.software_vulnerability_baseline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  software_name TEXT NOT NULL,
  software_name_patterns TEXT[] DEFAULT '{}', -- Padroes alternativos de nome
  vendor TEXT,
  min_safe_version TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  cve_refs TEXT[] DEFAULT '{}',
  impact TEXT NOT NULL,
  remediation TEXT NOT NULL,
  action TEXT NOT NULL, -- Acao comercial clara
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_svb_software_name ON public.software_vulnerability_baseline(software_name);
CREATE INDEX IF NOT EXISTS idx_svb_severity ON public.software_vulnerability_baseline(severity);
CREATE INDEX IF NOT EXISTS idx_svb_active ON public.software_vulnerability_baseline(is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.software_vulnerability_baseline ENABLE ROW LEVEL SECURITY;

-- Politicas: qualquer usuario autenticado pode ler (dados publicos de seguranca)
CREATE POLICY "Authenticated users can read vulnerability baseline"
ON public.software_vulnerability_baseline FOR SELECT
TO authenticated
USING (true);

-- Apenas super_admins podem gerenciar
CREATE POLICY "Super admins can manage vulnerability baseline"
ON public.software_vulnerability_baseline FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_svb_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER tr_svb_updated_at
BEFORE UPDATE ON public.software_vulnerability_baseline
FOR EACH ROW EXECUTE FUNCTION update_svb_updated_at();

-- =====================================================
-- DADOS INICIAIS: 10 SOFTWARES CRITICOS
-- =====================================================

INSERT INTO public.software_vulnerability_baseline 
(software_name, software_name_patterns, vendor, min_safe_version, severity, cve_refs, impact, remediation, action) 
VALUES
-- 1. Google Chrome
('Google Chrome', 
 ARRAY['Chrome', 'Google Chrome', 'chrome.exe'], 
 'Google', 
 '121.0', 
 'critical', 
 ARRAY['CVE-2024-0519', 'CVE-2024-0517', 'CVE-2024-0518'], 
 'Execucao remota de codigo via navegador - atacante pode assumir controle total do computador',
 'Atualizar Google Chrome para versao 121 ou superior via chrome://settings/help',
 'Atualizar Chrome agora (critico)'),

-- 2. WinRAR
('WinRAR', 
 ARRAY['WinRAR', 'winrar.exe', 'RAR'], 
 'RARLAB', 
 '6.24', 
 'critical', 
 ARRAY['CVE-2023-40477', 'CVE-2023-38831'], 
 'Execucao de codigo malicioso ao abrir arquivos RAR/ZIP comprometidos',
 'Atualizar WinRAR para versao 6.24+ em rarlab.com',
 'Atualizar WinRAR urgente'),

-- 3. Java Runtime
('Java', 
 ARRAY['Java', 'Java Runtime', 'Java(TM)', 'OpenJDK', 'jre', 'jdk'], 
 'Oracle', 
 '8u401', 
 'critical', 
 ARRAY['CVE-2024-20918', 'CVE-2024-20919', 'CVE-2024-20921'], 
 'Multiplas vulnerabilidades permitem execucao remota e bypass de seguranca',
 'Atualizar Java via java.com ou remover se nao utilizado',
 'Atualizar ou remover Java'),

-- 4. Adobe Acrobat Reader
('Adobe Acrobat Reader', 
 ARRAY['Adobe Acrobat', 'Acrobat Reader', 'Adobe Reader', 'AcroRd32.exe'], 
 'Adobe', 
 '24.001', 
 'high', 
 ARRAY['CVE-2024-20711', 'CVE-2024-20712', 'CVE-2024-20713'], 
 'Execucao de codigo malicioso ao abrir PDFs comprometidos',
 'Atualizar Adobe Reader via Help > Check for Updates',
 'Atualizar Adobe Reader'),

-- 5. 7-Zip
('7-Zip', 
 ARRAY['7-Zip', '7zip', '7z.exe', '7zFM.exe'], 
 'Igor Pavlov', 
 '24.01', 
 'high', 
 ARRAY['CVE-2024-11477', 'CVE-2023-31102'], 
 'Buffer overflow permite execucao de codigo ao extrair arquivos',
 'Atualizar 7-Zip para versao 24.01+ em 7-zip.org',
 'Atualizar 7-Zip'),

-- 6. Mozilla Firefox
('Mozilla Firefox', 
 ARRAY['Firefox', 'Mozilla Firefox', 'firefox.exe'], 
 'Mozilla', 
 '122.0', 
 'high', 
 ARRAY['CVE-2024-0741', 'CVE-2024-0742', 'CVE-2024-0746'], 
 'Vulnerabilidades criticas no navegador permitem ataques remotos',
 'Atualizar Firefox via Menu > Help > About Firefox',
 'Atualizar Firefox'),

-- 7. Microsoft Edge
('Microsoft Edge', 
 ARRAY['Edge', 'Microsoft Edge', 'msedge.exe'], 
 'Microsoft', 
 '121.0', 
 'high', 
 ARRAY['CVE-2024-0519', 'CVE-2024-0517'], 
 'Baseado em Chromium - mesmas vulnerabilidades do Chrome',
 'Atualizar Edge via Windows Update ou edge://settings/help',
 'Atualizar Edge via Windows Update'),

-- 8. VLC Media Player
('VLC', 
 ARRAY['VLC', 'VLC media player', 'vlc.exe'], 
 'VideoLAN', 
 '3.0.20', 
 'medium', 
 ARRAY['CVE-2023-47360', 'CVE-2023-47359'], 
 'Crash e possivel execucao de codigo via arquivos de midia maliciosos',
 'Atualizar VLC para versao 3.0.20+ em videolan.org',
 'Atualizar VLC'),

-- 9. TeamViewer
('TeamViewer', 
 ARRAY['TeamViewer', 'teamviewer.exe'], 
 'TeamViewer', 
 '15.51', 
 'high', 
 ARRAY['CVE-2024-0819', 'CVE-2023-0837'], 
 'Bypass de autenticacao pode permitir acesso remoto nao autorizado',
 'Atualizar TeamViewer para versao 15.51+ ou desinstalar se nao utilizado',
 'Atualizar ou remover TeamViewer'),

-- 10. Notepad++
('Notepad++', 
 ARRAY['Notepad++', 'notepad++.exe'], 
 'Don Ho', 
 '8.6.2', 
 'medium', 
 ARRAY['CVE-2023-40031', 'CVE-2023-40036'], 
 'Buffer overflow em plugins pode comprometer o sistema',
 'Atualizar Notepad++ para versao 8.6.2+ em notepad-plus-plus.org',
 'Atualizar Notepad++');

-- Comentario: Essa tabela sera expandida conforme novos CVEs sao descobertos