
-- 1. Insert missing techniques into reference table (59 techniques across 12 tactics)
INSERT INTO mitre_attack_techniques (technique_id, tactic, technique_name, platforms, url) VALUES
-- Collection
('T1114.001', 'Collection', 'Email Collection: Local Email Collection', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1114/001'),
('T1115', 'Collection', 'Clipboard Data', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1115'),
('T1123', 'Collection', 'Audio Capture', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1123'),
('T1560.001', 'Collection', 'Archive Collected Data: Archive via Utility', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1560/001'),
-- Command and Control
('T1071.001', 'Command and Control', 'Application Layer Protocol: Web Protocols', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1071/001'),
('T1571', 'Command and Control', 'Non-Standard Port', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1571'),
('T1572', 'Command and Control', 'Protocol Tunneling', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1572'),
-- Credential Access
('T1003.002', 'Credential Access', 'OS Credential Dumping: Security Account Manager', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1003/002'),
('T1003.003', 'Credential Access', 'OS Credential Dumping: NTDS', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1003/003'),
('T1555.003', 'Credential Access', 'Credentials from Password Stores: Credentials from Web Browsers', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1555/003'),
('T1555.004', 'Credential Access', 'Credentials from Password Stores: Windows Credential Manager', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1555/004'),
('T1558.003', 'Credential Access', 'Steal or Forge Kerberos Tickets: Kerberoasting', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1558/003'),
-- Defense Evasion (missing ones)
('T1014', 'Defense Evasion', 'Rootkit', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1014'),
('T1055.012', 'Defense Evasion', 'Process Injection: Process Hollowing', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1055/012'),
('T1070.006', 'Defense Evasion', 'Indicator Removal: Timestomp', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1070/006'),
('T1127.001', 'Defense Evasion', 'Trusted Developer Utilities Proxy Execution: MSBuild', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1127/001'),
('T1202', 'Defense Evasion', 'Indirect Command Execution', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1202'),
('T1218.003', 'Defense Evasion', 'System Binary Proxy Execution: CMSTP', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1218/003'),
('T1218.004', 'Defense Evasion', 'System Binary Proxy Execution: InstallUtil', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1218/004'),
('T1218.005', 'Defense Evasion', 'System Binary Proxy Execution: Mshta', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1218/005'),
('T1218.010', 'Defense Evasion', 'System Binary Proxy Execution: Regsvr32', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1218/010'),
('T1218.011', 'Defense Evasion', 'System Binary Proxy Execution: Rundll32', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1218/011'),
('T1562.004', 'Defense Evasion', 'Impair Defenses: Disable or Modify System Firewall', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1562/004'),
('T1564.004', 'Defense Evasion', 'Hide Artifacts: NTFS File Attributes', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1564/004'),
('T1574.002', 'Defense Evasion', 'Hijack Execution Flow: DLL Side-Loading', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1574/002'),
-- Discovery (entirely new tactic in reference)
('T1016', 'Discovery', 'System Network Configuration Discovery', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1016'),
('T1018', 'Discovery', 'Remote System Discovery', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1018'),
('T1057', 'Discovery', 'Process Discovery', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1057'),
('T1069', 'Discovery', 'Permission Groups Discovery', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1069'),
('T1082', 'Discovery', 'System Information Discovery', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1082'),
('T1087.001', 'Discovery', 'Account Discovery: Local Account', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1087/001'),
('T1482', 'Discovery', 'Domain Trust Discovery', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1482'),
('T1518.001', 'Discovery', 'Software Discovery: Security Software Discovery', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1518/001'),
-- Execution (missing)
('T1059.005', 'Execution', 'Command and Scripting Interpreter: Visual Basic', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1059/005'),
('T1204.001', 'Execution', 'User Execution: Malicious Link', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1204/001'),
('T1559', 'Execution', 'Inter-Process Communication', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1559'),
-- Exfiltration (missing)
('T1027.003', 'Exfiltration', 'Obfuscated Files or Information: Steganography', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1027/003'),
('T1048.003', 'Exfiltration', 'Exfiltration Over Alternative Protocol: Unencrypted', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1048/003'),
('T1567', 'Exfiltration', 'Exfiltration Over Web Service', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1567'),
('T1567.002', 'Exfiltration', 'Exfiltration Over Web Service: Exfiltration to Cloud Storage', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1567/002'),
-- Impact (missing)
('T1490', 'Impact', 'Inhibit System Recovery', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1490'),
('T1529', 'Impact', 'System Shutdown/Reboot', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1529'),
-- Initial Access (missing)
('T1189', 'Initial Access', 'Drive-by Compromise', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1189'),
('T1566.001', 'Initial Access', 'Phishing: Spearphishing Attachment', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1566/001'),
-- Lateral Movement (missing)
('T1021.001', 'Lateral Movement', 'Remote Services: Remote Desktop Protocol', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1021/001'),
('T1021.006', 'Lateral Movement', 'Remote Services: Windows Remote Management', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1021/006'),
('T1210', 'Lateral Movement', 'Exploitation of Remote Services', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1210'),
('T1550.002', 'Lateral Movement', 'Use Alternate Authentication Material: Pass the Hash', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1550/002'),
('T1550.003', 'Lateral Movement', 'Use Alternate Authentication Material: Pass the Ticket', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1550/003'),
('T1570', 'Lateral Movement', 'Lateral Tool Transfer', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1570'),
-- Persistence (missing)
('T1098', 'Persistence', 'Account Manipulation', ARRAY['Windows','Linux','macOS'], 'https://attack.mitre.org/techniques/T1098'),
('T1542.003', 'Persistence', 'Pre-OS Boot: Bootkit', ARRAY['Windows','Linux'], 'https://attack.mitre.org/techniques/T1542/003'),
('T1543.003', 'Persistence', 'Create or Modify System Process: Windows Service', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1543/003'),
('T1546.003', 'Persistence', 'Event Triggered Execution: WMI Event Subscription', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1546/003'),
('T1546.012', 'Persistence', 'Event Triggered Execution: Image File Execution Options Injection', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1546/012'),
-- Privilege Escalation (missing)
('T1134.001', 'Privilege Escalation', 'Access Token Manipulation: Token Impersonation/Theft', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1134/001'),
('T1548.002', 'Privilege Escalation', 'Abuse Elevation Control Mechanism: Bypass UAC', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1548/002'),
('T1574.001', 'Privilege Escalation', 'Hijack Execution Flow: DLL Search Order Hijacking', ARRAY['Windows'], 'https://attack.mitre.org/techniques/T1574/001')
ON CONFLICT (technique_id) DO UPDATE SET
  tactic = EXCLUDED.tactic,
  technique_name = EXCLUDED.technique_name,
  platforms = EXCLUDED.platforms,
  url = EXCLUDED.url;

-- Also add T1197 for Persistence (already exists for Defense Evasion, skip if conflict)
-- T1197 is dual-tactic: both Defense Evasion and Persistence — the reference table uses unique technique_id
-- so it will update to Persistence. We keep it as Defense Evasion since that's the primary tactic.

-- 2. GRANT EXECUTE on the RPC to authenticated users
GRANT EXECUTE ON FUNCTION public.get_mitre_coverage_by_tactic(uuid) TO authenticated;

-- 3. Create platform coverage RPC
CREATE OR REPLACE FUNCTION public.get_mitre_coverage_by_platform(tenant_uuid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  WITH platform_data AS (
    SELECT
      unnest(mat.platforms) AS platform,
      mat.technique_id,
      mat.tactic,
      CASE WHEN dr.mitre_technique_id IS NOT NULL THEN 1 ELSE 0 END AS is_covered
    FROM mitre_attack_techniques mat
    LEFT JOIN (
      SELECT DISTINCT mitre_technique_id, mitre_tactic
      FROM detection_rules
      WHERE is_enabled = true
        AND mitre_technique_id IS NOT NULL
        AND (tenant_id IS NULL OR tenant_id = tenant_uuid)
    ) dr ON mat.technique_id = dr.mitre_technique_id AND mat.tactic = dr.mitre_tactic
  ),
  platform_summary AS (
    SELECT
      platform,
      COUNT(DISTINCT technique_id) AS total_techniques,
      COUNT(DISTINCT technique_id) FILTER (WHERE is_covered = 1) AS covered_techniques,
      ROUND(
        (COUNT(DISTINCT technique_id) FILTER (WHERE is_covered = 1)::numeric /
         NULLIF(COUNT(DISTINCT technique_id), 0)) * 100, 1
      ) AS coverage_pct
    FROM platform_data
    WHERE platform IN ('Windows', 'Linux', 'macOS')
    GROUP BY platform
    ORDER BY platform
  )
  SELECT json_build_object(
    'timestamp', now(),
    'platforms', (SELECT json_agg(row_to_json(p)) FROM platform_summary p)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mitre_coverage_by_platform(uuid) TO authenticated;
