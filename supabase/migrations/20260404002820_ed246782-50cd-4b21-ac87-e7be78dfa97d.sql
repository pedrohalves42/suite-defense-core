
-- ==========================================
-- New MITRE ATT&CK detection rules (37 new)
-- Expanding from 63 → 100 rules
-- ==========================================

-- === INITIAL ACCESS (new tactic — 4 rules) ===
INSERT INTO public.detection_rules (rule_name, description, severity, event_type, is_enabled, mitre_technique_id, mitre_tactic, mitre_technique_name, confidence_base, tags)
VALUES
('Phishing Attachment Execution', 'Office application spawning suspicious child process (cmd, powershell, wscript)', 'critical', 'process', true, 'T1566.001', 'Initial Access', 'Phishing: Spearphishing Attachment', 85, ARRAY['phishing','office','initial-access']),
('Drive-By Download Execution', 'Browser process spawning executable or script interpreter', 'high', 'process', true, 'T1189', 'Initial Access', 'Drive-by Compromise', 70, ARRAY['drive-by','browser','download']),
('Exploitation of Public-Facing App', 'Web server process spawning shell or unexpected child', 'critical', 'process', true, 'T1190', 'Initial Access', 'Exploit Public-Facing Application', 80, ARRAY['exploit','webserver','iis','apache']),
('Valid Account Suspicious Login', 'Successful login from unusual location or time outside baseline', 'high', 'process', true, 'T1078', 'Initial Access', 'Valid Accounts', 65, ARRAY['valid-accounts','anomaly','login']);

-- === CREDENTIAL ACCESS (4 new) ===
INSERT INTO public.detection_rules (rule_name, description, severity, event_type, is_enabled, mitre_technique_id, mitre_tactic, mitre_technique_name, confidence_base, tags)
VALUES
('Kerberoasting Activity', 'Abnormal volume of Kerberos TGS requests for service accounts', 'high', 'process', true, 'T1558.003', 'Credential Access', 'Steal or Forge Kerberos Tickets: Kerberoasting', 80, ARRAY['kerberoasting','kerberos','credential']),
('Brute Force Login Attempt', 'Multiple failed login attempts from same source in short timeframe', 'high', 'process', true, 'T1110', 'Credential Access', 'Brute Force', 75, ARRAY['brute-force','login','failed']),
('NTDS.dit Extraction', 'ntdsutil or volume shadow copy used to extract AD database', 'critical', 'process', true, 'T1003.003', 'Credential Access', 'OS Credential Dumping: NTDS', 90, ARRAY['ntds','ad-dump','credential']),
('Browser Credential Theft', 'Process accessing browser credential stores or login data files', 'high', 'file', true, 'T1555.003', 'Credential Access', 'Credentials from Password Stores: Browser', 75, ARRAY['browser','credential','theft']);

-- === PRIVILEGE ESCALATION (4 new) ===
INSERT INTO public.detection_rules (rule_name, description, severity, event_type, is_enabled, mitre_technique_id, mitre_tactic, mitre_technique_name, confidence_base, tags)
VALUES
('DLL Search Order Hijacking', 'DLL loaded from unexpected writable path instead of system directory', 'high', 'file', true, 'T1574.001', 'Privilege Escalation', 'Hijack Execution Flow: DLL Search Order Hijacking', 70, ARRAY['dll-hijack','privesc','execution-flow']),
('Access Token Manipulation', 'Process creating or duplicating token with elevated privileges', 'critical', 'process', true, 'T1134', 'Privilege Escalation', 'Access Token Manipulation', 80, ARRAY['token','impersonation','privesc']),
('UAC Bypass Detected', 'Known UAC bypass technique via fodhelper, eventvwr, or sdclt', 'critical', 'process', true, 'T1548.002', 'Privilege Escalation', 'Abuse Elevation Control: Bypass UAC', 85, ARRAY['uac','bypass','elevation']),
('Named Pipe Impersonation', 'Process creating named pipe commonly used for privilege escalation', 'high', 'process', true, 'T1134.001', 'Privilege Escalation', 'Token Impersonation/Theft', 75, ARRAY['named-pipe','impersonation','privesc']);

-- === EXFILTRATION (4 new) ===
INSERT INTO public.detection_rules (rule_name, description, severity, event_type, is_enabled, mitre_technique_id, mitre_tactic, mitre_technique_name, confidence_base, tags)
VALUES
('Cloud Storage Exfiltration', 'Large upload to cloud storage services (OneDrive, Dropbox, GDrive, Mega)', 'high', 'network', true, 'T1567.002', 'Exfiltration', 'Exfiltration Over Web Service: Cloud Storage', 70, ARRAY['exfil','cloud','upload']),
('Exfiltration Over C2 Channel', 'Unusual volume of data sent over known C2 communication channel', 'critical', 'network', true, 'T1041', 'Exfiltration', 'Exfiltration Over C2 Channel', 80, ARRAY['exfil','c2','data-theft']),
('Exfiltration Over Web Service', 'HTTP POST with large payload to uncommon external endpoint', 'high', 'network', true, 'T1567', 'Exfiltration', 'Exfiltration Over Web Service', 65, ARRAY['exfil','http','upload']),
('Steganography Data Hiding', 'Image or media file modified by process known for data hiding', 'medium', 'file', true, 'T1027.003', 'Exfiltration', 'Steganography', 60, ARRAY['steganography','data-hiding','exfil']);

-- === COLLECTION (3 new) ===
INSERT INTO public.detection_rules (rule_name, description, severity, event_type, is_enabled, mitre_technique_id, mitre_tactic, mitre_technique_name, confidence_base, tags)
VALUES
('Clipboard Data Collection', 'Process repeatedly reading clipboard data programmatically', 'medium', 'process', true, 'T1115', 'Collection', 'Clipboard Data', 65, ARRAY['clipboard','collection','monitoring']),
('Email Collection Local', 'Process accessing local email stores (OST/PST files)', 'high', 'file', true, 'T1114.001', 'Collection', 'Email Collection: Local Email', 75, ARRAY['email','collection','ost','pst']),
('Audio/Video Capture', 'Process activating microphone or camera without user interaction', 'high', 'process', true, 'T1123', 'Collection', 'Audio Capture', 80, ARRAY['audio','video','capture','surveillance']);

-- === DISCOVERY (4 new) ===
INSERT INTO public.detection_rules (rule_name, description, severity, event_type, is_enabled, mitre_technique_id, mitre_tactic, mitre_technique_name, confidence_base, tags)
VALUES
('System Information Discovery', 'Rapid execution of system enumeration commands (systeminfo, hostname, ver)', 'low', 'process', true, 'T1082', 'Discovery', 'System Information Discovery', 50, ARRAY['recon','systeminfo','discovery']),
('Permission Group Discovery', 'Enumeration of domain or local groups (net group, Get-ADGroup)', 'medium', 'process', true, 'T1069', 'Discovery', 'Permission Groups Discovery', 60, ARRAY['recon','groups','ad']),
('Remote System Discovery', 'Network scanning for live hosts via ping sweep, arp scan, or nltest', 'medium', 'process', true, 'T1018', 'Discovery', 'Remote System Discovery', 65, ARRAY['recon','network-scan','discovery']),
('Process Discovery Enumeration', 'Unusual process listing commands by non-admin user (tasklist, ps)', 'low', 'process', true, 'T1057', 'Discovery', 'Process Discovery', 45, ARRAY['recon','process-list','enumeration']);

-- === EXECUTION (3 new) ===
INSERT INTO public.detection_rules (rule_name, description, severity, event_type, is_enabled, mitre_technique_id, mitre_tactic, mitre_technique_name, confidence_base, tags)
VALUES
('WMI Script Execution', 'WMI executing scripts via wmic process call or scrcons.exe', 'high', 'process', true, 'T1047', 'Execution', 'Windows Management Instrumentation', 75, ARRAY['wmi','script','execution']),
('Inter-Process Communication Abuse', 'COM/DDE abuse for code execution via unexpected automation', 'high', 'process', true, 'T1559', 'Execution', 'Inter-Process Communication', 70, ARRAY['com','dde','ipc','execution']),
('User Execution Malicious Link', 'User clicking link that triggers script download and execution', 'medium', 'process', true, 'T1204.001', 'Execution', 'User Execution: Malicious Link', 60, ARRAY['user-exec','link','social-engineering']);

-- === DEFENSE EVASION (4 new) ===
INSERT INTO public.detection_rules (rule_name, description, severity, event_type, is_enabled, mitre_technique_id, mitre_tactic, mitre_technique_name, confidence_base, tags)
VALUES
('Process Masquerading', 'Process running from unusual path mimicking legitimate system binary name', 'high', 'process', true, 'T1036', 'Defense Evasion', 'Masquerading', 75, ARRAY['masquerading','evasion','mimicry']),
('DLL Side-Loading', 'Legitimate signed binary loading malicious DLL from same directory', 'high', 'file', true, 'T1574.002', 'Defense Evasion', 'Hijack Execution Flow: DLL Side-Loading', 70, ARRAY['dll-sideload','evasion','hijack']),
('Obfuscated File or Script', 'Heavily encoded or obfuscated script content detected in command line', 'high', 'process', true, 'T1027', 'Defense Evasion', 'Obfuscated Files or Information', 70, ARRAY['obfuscation','encoding','evasion']),
('Rootkit Indicators Detected', 'Hidden process, driver, or file detected indicating rootkit presence', 'critical', 'process', true, 'T1014', 'Defense Evasion', 'Rootkit', 90, ARRAY['rootkit','hidden','kernel']);

-- === LATERAL MOVEMENT (3 new) ===
INSERT INTO public.detection_rules (rule_name, description, severity, event_type, is_enabled, mitre_technique_id, mitre_tactic, mitre_technique_name, confidence_base, tags)
VALUES
('Pass-the-Hash Attack', 'NTLM authentication using hash instead of password detected', 'critical', 'process', true, 'T1550.002', 'Lateral Movement', 'Use Alternate Authentication: Pass the Hash', 85, ARRAY['pth','ntlm','lateral']),
('Pass-the-Ticket Attack', 'Kerberos ticket reuse from non-originating machine', 'critical', 'process', true, 'T1550.003', 'Lateral Movement', 'Use Alternate Authentication: Pass the Ticket', 85, ARRAY['ptt','kerberos','lateral']),
('Remote Service Exploitation', 'Exploitation of remote service for lateral movement (SMB, RDP, SSH)', 'high', 'network', true, 'T1210', 'Lateral Movement', 'Exploitation of Remote Services', 75, ARRAY['exploit','remote-service','lateral']);

-- === PERSISTENCE (4 new) ===
INSERT INTO public.detection_rules (rule_name, description, severity, event_type, is_enabled, mitre_technique_id, mitre_tactic, mitre_technique_name, confidence_base, tags)
VALUES
('Bootkit Indicators', 'MBR or VBR modification detected indicating bootkit installation', 'critical', 'file', true, 'T1542.003', 'Persistence', 'Pre-OS Boot: Bootkit', 90, ARRAY['bootkit','mbr','persistence']),
('Account Manipulation', 'User account created or modified to maintain persistence', 'high', 'process', true, 'T1098', 'Persistence', 'Account Manipulation', 75, ARRAY['account','persistence','user-creation']),
('BITS Job Persistence', 'BITS transfer job created for persistent execution or download', 'medium', 'process', true, 'T1197', 'Persistence', 'BITS Jobs', 65, ARRAY['bits','persistence','download']),
('Image File Execution Options', 'IFEO registry key set for process debugging or interception', 'high', 'registry', true, 'T1546.012', 'Persistence', 'Event Triggered Execution: IFEO Injection', 80, ARRAY['ifeo','debugger','persistence']);
