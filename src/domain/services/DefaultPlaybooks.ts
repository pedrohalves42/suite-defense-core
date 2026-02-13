import {
  type PlaybookDefinition,
  type SoarTrigger,
  TriggerType,
  ActionType,
  PlaybookSeverity,
} from './SoarEngine';

/**
 * Default SOAR playbooks for CyberShield.
 * These are pre-configured response strategies for common security events.
 */
export const DEFAULT_PLAYBOOKS: PlaybookDefinition[] = [
  // ── Critical Vulnerability Auto-Patch ──
  {
    id: 'pb-vuln-critical',
    name: 'Critical Vulnerability Auto-Remediation',
    description: 'Automatically remediates CVSS >= 9.0 critical vulnerabilities',
    triggerType: TriggerType.VULNERABILITY_CRITICAL,
    isActive: true,
    requiresApproval: true,
    autoApproveForCritical: true,
    rules: [
      {
        name: 'CVSS >= 9.0 Auto-Patch',
        condition: (t: SoarTrigger) =>
          t.severity === PlaybookSeverity.CRITICAL &&
          (t.data.cvssScore as number) >= 9.0,
        actions: [
          {
            type: ActionType.LOG_EVIDENCE,
            config: { evidenceType: 'vulnerability_detected' },
            description: 'Log vulnerability detection evidence',
          },
          {
            type: ActionType.CREATE_JOB,
            config: { jobType: 'run_script', priority: 'urgent' },
            description: 'Create remediation job for critical CVE',
          },
          {
            type: ActionType.SEND_ALERT,
            config: { channel: 'all', priority: 'critical' },
            description: 'Notify security team of auto-remediation',
          },
        ],
        failFast: false,
      },
    ],
  },

  // ── File Integrity Violation Response ──
  {
    id: 'pb-file-integrity',
    name: 'File Integrity Violation Response',
    description: 'Responds to critical file integrity violations with quarantine and restore',
    triggerType: TriggerType.FILE_INTEGRITY_VIOLATION,
    isActive: true,
    requiresApproval: false,
    autoApproveForCritical: true,
    rules: [
      {
        name: 'Critical File Modified',
        condition: (t: SoarTrigger) =>
          t.severity === PlaybookSeverity.CRITICAL ||
          t.severity === PlaybookSeverity.HIGH,
        actions: [
          {
            type: ActionType.LOG_EVIDENCE,
            config: { evidenceType: 'file_integrity_violation' },
            description: 'Log file integrity violation evidence',
          },
          {
            type: ActionType.QUARANTINE,
            config: { target: 'modified_file' },
            description: 'Quarantine modified file',
          },
          {
            type: ActionType.SEND_ALERT,
            config: { channel: 'all', priority: 'high' },
            description: 'Alert security team about file integrity violation',
          },
        ],
        failFast: true,
      },
    ],
  },

  // ── Risky USB Device Auto-Block ──
  {
    id: 'pb-usb-block',
    name: 'Risky USB Device Auto-Block',
    description: 'Automatically blocks high-risk USB storage devices',
    triggerType: TriggerType.USB_DEVICE_RISKY,
    isActive: true,
    requiresApproval: false,
    autoApproveForCritical: true,
    rules: [
      {
        name: 'Block Unknown Storage Device',
        condition: (t: SoarTrigger) =>
          t.data.deviceType === 'storage' &&
          (t.data.riskScore as number) >= 60,
        actions: [
          {
            type: ActionType.BLOCK_DEVICE,
            config: { method: 'disable_pnp' },
            description: 'Disable USB storage device via PnP',
          },
          {
            type: ActionType.LOG_EVIDENCE,
            config: { evidenceType: 'usb_device_blocked' },
            description: 'Log USB device block evidence',
          },
          {
            type: ActionType.SEND_ALERT,
            config: { channel: 'all', priority: 'medium' },
            description: 'Notify admin of blocked USB device',
          },
        ],
        failFast: false,
      },
    ],
  },

  // ── Certificate Expiry Warning ──
  {
    id: 'pb-cert-expiry',
    name: 'Certificate Expiry Monitor',
    description: 'Alerts and schedules renewal for expiring certificates',
    triggerType: TriggerType.CERTIFICATE_EXPIRING,
    isActive: true,
    requiresApproval: true,
    autoApproveForCritical: false,
    rules: [
      {
        name: 'Certificate Expiring Within 7 Days',
        condition: (t: SoarTrigger) =>
          (t.data.daysUntilExpiry as number) <= 7,
        actions: [
          {
            type: ActionType.SEND_ALERT,
            config: { channel: 'all', priority: 'high' },
            description: 'Urgent certificate expiry alert',
          },
          {
            type: ActionType.CREATE_JOB,
            config: { jobType: 'run_script', priority: 'high' },
            description: 'Schedule certificate renewal job',
          },
        ],
        failFast: false,
      },
      {
        name: 'Certificate Expiring Within 30 Days',
        condition: (t: SoarTrigger) =>
          (t.data.daysUntilExpiry as number) <= 30 &&
          (t.data.daysUntilExpiry as number) > 7,
        actions: [
          {
            type: ActionType.SEND_ALERT,
            config: { channel: 'email', priority: 'medium' },
            description: 'Certificate expiry warning notification',
          },
        ],
        failFast: false,
      },
    ],
  },

  // ── Behavioral Anomaly Response ──
  {
    id: 'pb-behavioral-anomaly',
    name: 'Behavioral Anomaly Response',
    description: 'Responds to statistical anomalies in agent behavior',
    triggerType: TriggerType.BEHAVIORAL_ANOMALY,
    isActive: true,
    requiresApproval: false,
    autoApproveForCritical: true,
    rules: [
      {
        name: 'Critical Anomaly Detected',
        condition: (t: SoarTrigger) =>
          t.severity === PlaybookSeverity.CRITICAL,
        actions: [
          {
            type: ActionType.LOG_EVIDENCE,
            config: { evidenceType: 'behavioral_anomaly' },
            description: 'Log anomaly detection evidence',
          },
          {
            type: ActionType.SEND_ALERT,
            config: { channel: 'all', priority: 'critical' },
            description: 'Alert security team of critical anomaly',
          },
          {
            type: ActionType.QUARANTINE,
            config: { target: 'agent', action: 'isolate' },
            description: 'Isolate agent showing critical anomalous behavior',
          },
        ],
        failFast: true,
      },
    ],
  },

  // ── Network Anomaly Response ──
  {
    id: 'pb-network-anomaly',
    name: 'Network Anomaly Response',
    description: 'Responds to high network error rates or suspicious traffic',
    triggerType: TriggerType.NETWORK_ANOMALY,
    isActive: true,
    requiresApproval: false,
    autoApproveForCritical: true,
    rules: [
      {
        name: 'High Error Rate Detected',
        condition: (t: SoarTrigger) =>
          (t.data.errorRate as number) > 0.1,
        actions: [
          {
            type: ActionType.LOG_EVIDENCE,
            config: { evidenceType: 'network_anomaly' },
            description: 'Log network anomaly evidence',
          },
          {
            type: ActionType.SEND_ALERT,
            config: { channel: 'all', priority: 'high' },
            description: 'Alert about high network error rate',
          },
        ],
        failFast: false,
      },
    ],
  },
];
