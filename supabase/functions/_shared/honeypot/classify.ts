/**
 * Lightweight honeypot payload classification via regex.
 * Runs in the hot path — must be fast (no external calls).
 */

export type HoneypotClassification = 'benign' | 'suspicious' | 'malicious' | 'reconnaissance' | 'unknown';

interface ClassificationRule {
  pattern: RegExp;
  classification: HoneypotClassification;
  label: string;
}

const RULES: ClassificationRule[] = [
  // Malicious patterns (command execution)
  { pattern: /cmd\.exe|powershell\.exe|Invoke-Expression|\biex\b/i, classification: 'malicious', label: 'command_execution' },
  { pattern: /\bwget\b.*\||\bcurl\b.*\||\bbash\s+-c\b/i, classification: 'malicious', label: 'download_and_execute' },
  { pattern: /base64\s+-d|FromBase64String|atob\(/i, classification: 'malicious', label: 'base64_decode' },
  { pattern: /\beval\s*\(|\bexec\s*\(/i, classification: 'malicious', label: 'eval_exec' },
  { pattern: /;\s*(rm|del|format|fdisk)\b/i, classification: 'malicious', label: 'destructive_command' },
  { pattern: /\bnet\s+user\b|\bnet\s+localgroup\b/i, classification: 'malicious', label: 'user_enumeration' },
  { pattern: /mimikatz|lazagne|procdump|lsass/i, classification: 'malicious', label: 'credential_theft' },

  // Suspicious patterns (potentially malicious)
  { pattern: /\bchmod\s+[0-7]{3,4}\b|\bchown\b/i, classification: 'suspicious', label: 'permission_change' },
  { pattern: /\bschtasks\b|\bcrontab\b|\bsystemctl\b/i, classification: 'suspicious', label: 'persistence' },
  { pattern: /\breg\s+(add|delete|query)\b/i, classification: 'suspicious', label: 'registry_manipulation' },
  { pattern: /\bnc\b.*-[elp]|\bncat\b|\bnetcat\b/i, classification: 'suspicious', label: 'reverse_shell' },
  { pattern: /\bsudo\b|\brunas\b/i, classification: 'suspicious', label: 'privilege_escalation' },

  // Reconnaissance
  { pattern: /\bwhoami\b|\bhostname\b|\buname\b|\bsysteminfo\b/i, classification: 'reconnaissance', label: 'system_info' },
  { pattern: /\bnmap\b|\bnetstat\b|\bss\s+-/i, classification: 'reconnaissance', label: 'network_scan' },
  { pattern: /\btasklist\b|\bps\s+aux\b|\bGet-Process\b/i, classification: 'reconnaissance', label: 'process_enum' },
];

export interface ClassificationResult {
  classification: HoneypotClassification;
  labels: string[];
}

/**
 * Classify a payload by scanning body + path + method.
 * Returns the highest severity classification found.
 */
export function classifyPayload(
  body: string,
  path?: string,
  method?: string,
): ClassificationResult {
  const combined = `${method || ''} ${path || ''} ${body}`;
  const labels: string[] = [];
  let highest: HoneypotClassification = 'unknown';

  const severity: Record<HoneypotClassification, number> = {
    unknown: 0,
    benign: 1,
    reconnaissance: 2,
    suspicious: 3,
    malicious: 4,
  };

  for (const rule of RULES) {
    if (rule.pattern.test(combined)) {
      labels.push(rule.label);
      if (severity[rule.classification] > severity[highest]) {
        highest = rule.classification;
      }
    }
  }

  // If nothing matched and there IS a body, mark as benign
  if (highest === 'unknown' && body.length > 0) {
    highest = 'benign';
  }

  return { classification: highest, labels };
}
