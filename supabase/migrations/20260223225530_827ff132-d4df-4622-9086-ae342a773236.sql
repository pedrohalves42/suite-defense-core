
-- ============================================================
-- ADR-039: Expand Software Knowledge Base for Auto-Classification
-- Adds ~70 new rules to cover common software categories
-- ============================================================

-- Adobe products
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('Adobe Acrobat', 'contains', 'business', 'low', 'Leitor/editor PDF Adobe', true),
  ('Adobe Genuine', 'contains', 'system', 'low', 'Serviço de validação Adobe', true),
  ('Adobe Refresh Manager', 'exact', 'system', 'low', 'Gerenciador de atualização Adobe', true),
  ('Adobe Shockwave', 'contains', 'multimedia', 'high', 'Plugin descontinuado - risco de segurança', true),
  ('Adobe Creative Cloud', 'contains', 'business', 'low', 'Suite criativa Adobe', true),
  ('Adobe Photoshop', 'contains', 'business', 'low', 'Editor de imagens', true),
  ('Adobe Reader', 'contains', 'business', 'low', 'Leitor PDF', true)
ON CONFLICT DO NOTHING;

-- AMD/Intel drivers and hardware
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('AMD', 'contains', 'driver', 'low', 'Drivers e software AMD', true),
  ('Intel(R)', 'contains', 'driver', 'low', 'Drivers e software Intel', true),
  ('Realtek', 'contains', 'driver', 'low', 'Drivers Realtek', true),
  ('Promontory', 'contains', 'driver', 'low', 'Driver chipset AMD', true),
  ('NVIDIA', 'contains', 'driver', 'low', 'Drivers e software NVIDIA', true)
ON CONFLICT DO NOTHING;

-- Microsoft components (Visual C++, .NET, Office MUI, SDK, etc.)
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('Microsoft Visual C++', 'contains', 'runtime', 'low', 'Runtime Visual C++', true),
  ('Microsoft .NET', 'contains', 'runtime', 'low', 'Runtime .NET Framework', true),
  ('Microsoft ASP.NET', 'contains', 'runtime', 'low', 'Runtime ASP.NET', true),
  ('Microsoft Windows Desktop Runtime', 'contains', 'runtime', 'low', 'Runtime Windows Desktop', true),
  ('Microsoft Windows Desktop Targeting', 'contains', 'development', 'low', 'SDK targeting pack', true),
  ('MUI (Portuguese', 'contains', 'system', 'low', 'Pacotes de idioma Microsoft', true),
  ('Microsoft Update Health', 'contains', 'system', 'low', 'Ferramenta de atualização', true),
  ('Microsoft OneDrive', 'exact', 'cloud_storage', 'low', 'Armazenamento em nuvem Microsoft', true),
  ('Microsoft Visual Studio', 'contains', 'development', 'low', 'IDE Microsoft', true),
  ('Microsoft XNA', 'contains', 'runtime', 'low', 'Framework de jogos', true),
  ('Microsoft SharePoint', 'contains', 'business', 'low', 'Colaboração Microsoft', true),
  ('Microsoft Project', 'contains', 'business', 'low', 'Gestão de projetos', true),
  ('Microsoft Visio', 'contains', 'business', 'low', 'Diagramação Microsoft', true),
  ('Office 16 Click-to-Run', 'contains', 'system', 'low', 'Componente Office', true),
  ('SDK ', 'contains', 'development', 'low', 'Kit de desenvolvimento', true),
  ('vs_', 'contains', 'development', 'low', 'Componente Visual Studio', true),
  ('vcpp_', 'contains', 'runtime', 'low', 'Componente Visual C++', true)
ON CONFLICT DO NOTHING;

-- Remote access tools (HIGHER RISK)
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('UltraViewer', 'contains', 'remote_access', 'high', 'Acesso remoto - risco de shadow IT', true),
  ('Radmin', 'contains', 'remote_access', 'high', 'Acesso remoto Radmin - requer supervisão', true),
  ('AnyDesk', 'contains', 'remote_access', 'medium', 'Acesso remoto AnyDesk', true),
  ('TeamViewer', 'contains', 'remote_access', 'medium', 'Acesso remoto TeamViewer', true),
  ('RustDesk', 'contains', 'remote_access', 'medium', 'Acesso remoto open source', true)
ON CONFLICT DO NOTHING;

-- Anti-fingerprint / multi-account browsers (HIGH RISK)
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('AdsPower', 'contains', 'anti_detect', 'critical', 'Navegador anti-detecção - possível fraude', true),
  ('Dolphin Anty', 'contains', 'anti_detect', 'critical', 'Navegador anti-detecção - possível fraude', true),
  ('Multilogin', 'contains', 'anti_detect', 'critical', 'Navegador anti-detecção', true),
  ('GoLogin', 'contains', 'anti_detect', 'critical', 'Navegador anti-detecção', true)
ON CONFLICT DO NOTHING;

-- Gaming (medium risk in corporate)
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('Cyberpunk', 'contains', 'gaming', 'medium', 'Jogo instalado', true),
  ('Red Dead Redemption', 'contains', 'gaming', 'medium', 'Jogo instalado', true),
  ('Elder Scrolls', 'contains', 'gaming', 'medium', 'Jogo instalado', true),
  ('Car Mechanic Simulator', 'contains', 'gaming', 'medium', 'Jogo instalado', true),
  ('CarX Drift', 'contains', 'gaming', 'medium', 'Jogo instalado', true),
  ('Soccer Manager', 'contains', 'gaming', 'medium', 'Jogo instalado', true),
  ('Rockstar Games', 'contains', 'gaming', 'medium', 'Plataforma de jogos Rockstar', true),
  ('REDlauncher', 'exact', 'gaming', 'medium', 'Launcher CD Projekt Red', true),
  ('EA app', 'exact', 'gaming', 'medium', 'Plataforma de jogos EA', true)
ON CONFLICT DO NOTHING;

-- VPN tools
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('OpenVPN', 'contains', 'vpn', 'medium', 'VPN open source', true),
  ('Proton VPN', 'contains', 'vpn', 'medium', 'VPN privada', true),
  ('WireGuard', 'contains', 'vpn', 'medium', 'VPN moderna', true),
  ('NordVPN', 'contains', 'vpn', 'medium', 'VPN comercial', true)
ON CONFLICT DO NOTHING;

-- Utilities & system tools
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('CPUID HWMonitor', 'contains', 'utility', 'low', 'Monitor de hardware', true),
  ('Driver Booster', 'contains', 'utility', 'medium', 'Atualizador de drivers - potencial PUP', true),
  ('EaseUS', 'contains', 'utility', 'low', 'Recuperação de dados', true),
  ('Recuva', 'exact', 'utility', 'low', 'Recuperação de arquivos', true),
  ('Stellar Data Recovery', 'contains', 'utility', 'low', 'Recuperação de dados', true),
  ('K-Lite Codec', 'contains', 'multimedia', 'low', 'Codecs de vídeo', true),
  ('PDFCreator', 'exact', 'utility', 'low', 'Criador de PDF', true),
  ('No-IP DUC', 'exact', 'network', 'medium', 'DNS dinâmico - pode indicar servidor', true),
  ('Oracle VirtualBox', 'contains', 'virtualization', 'medium', 'Virtualização - requer supervisão', true),
  ('Logitech', 'contains', 'peripheral', 'low', 'Software de periféricos Logitech', true),
  ('Verificação de integridade', 'contains', 'system', 'low', 'Ferramenta de verificação Windows', true),
  ('MacroRecorder', 'contains', 'automation', 'high', 'Automação de macros - risco de abuso', true)
ON CONFLICT DO NOTHING;

-- Printer/scanner
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('HP LaserJet', 'contains', 'printer', 'low', 'Software de impressora HP', true),
  ('Brother', 'contains', 'printer', 'low', 'Software de impressora Brother', true),
  ('Samsung OCR', 'contains', 'printer', 'low', 'Software OCR Samsung', true),
  ('Scan To', 'exact', 'printer', 'low', 'Utilitário de digitalização', true),
  ('HPSSupply', 'exact', 'printer', 'low', 'Monitor de suprimentos HP', true),
  ('hpp', 'contains', 'printer', 'low', 'Componente HP Printer', true)
ON CONFLICT DO NOTHING;

-- Java
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('Java ', 'contains', 'runtime', 'medium', 'Runtime Java - verificar versão', true)
ON CONFLICT DO NOTHING;

-- Apple
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('Apple', 'contains', 'system', 'low', 'Software Apple', true),
  ('Bonjour', 'exact', 'network', 'low', 'Serviço de rede Apple', true),
  ('iTunes', 'contains', 'multimedia', 'low', 'Media player Apple', true)
ON CONFLICT DO NOTHING;

-- Security tools  
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('Componente de Segurança', 'contains', 'security', 'low', 'Componente de segurança bancário', true),
  ('Certificados Digitais', 'contains', 'security', 'low', 'Gerenciador de certificados', true),
  ('SIGNificant', 'contains', 'security', 'low', 'Assinatura digital', true)
ON CONFLICT DO NOTHING;

-- Database
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('MySQL', 'contains', 'database', 'medium', 'Servidor de banco de dados', true),
  ('PostgreSQL', 'contains', 'database', 'medium', 'Servidor de banco de dados', true),
  ('MongoDB', 'contains', 'database', 'medium', 'Servidor de banco de dados', true)
ON CONFLICT DO NOTHING;

-- Build tools / CRT
INSERT INTO software_knowledge_base (software_pattern, match_type, category, default_risk_level, description, is_active)
VALUES
  ('Universal CRT', 'contains', 'runtime', 'low', 'Runtime C universal', true),
  ('Ferramentas de Build', 'contains', 'development', 'low', 'Ferramentas de compilação', true),
  ('Kits Configuration', 'contains', 'development', 'low', 'Configuração de SDK', true),
  ('DiagnosticsHub', 'contains', 'development', 'low', 'Hub de diagnósticos', true),
  ('Application Verifier', 'contains', 'development', 'low', 'Verificador de aplicativos', true),
  ('MSI Development', 'contains', 'development', 'low', 'Ferramentas MSI', true),
  ('OpenAL', 'exact', 'runtime', 'low', 'Biblioteca de áudio', true),
  ('DJI', 'contains', 'utility', 'low', 'Software de drone DJI', true),
  ('swMSM', 'exact', 'system', 'low', 'Módulo de serviço', true),
  ('Branding64', 'exact', 'system', 'low', 'Componente do sistema', true),
  ('MarketResearch', 'exact', 'system', 'low', 'Componente Adobe', true),
  ('Aplicativo Itaú', 'exact', 'banking', 'low', 'App bancário', true),
  ('Formalizar Driver', 'exact', 'system', 'low', 'Driver de sistema', true),
  ('Mozilla Maintenance', 'contains', 'system', 'low', 'Serviço de manutenção Mozilla', true),
  ('Microsoft.NET.Sdk', 'contains', 'development', 'low', 'SDK .NET', true),
  ('Microsoft.NET.Workload', 'contains', 'development', 'low', 'Workload .NET', true),
  ('Pacote de Idiomas', 'contains', 'system', 'low', 'Pacote de idiomas', true),
  ('RyzenMasterSDK', 'exact', 'driver', 'low', 'SDK AMD Ryzen', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Now reclassify ALL existing unknown software using the trigger
-- The trigger fires on UPDATE OF name, so we touch the name field
-- ============================================================
UPDATE software_inventory 
SET risk_level = 'unknown' 
WHERE risk_level = 'unknown';
