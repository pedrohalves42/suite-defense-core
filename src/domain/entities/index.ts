export { UpdatePackage } from './UpdatePackage';
export type { UpdatePackageProps } from './UpdatePackage';
export { AgentUpdate } from './AgentUpdate';
export type { AgentUpdateProps } from './AgentUpdate';
export { Agent, AgentState, AgentStatus, OsType } from './Agent';
export type { AgentProps, CreateAgentProps } from './Agent';
export { Job, JobType, JobStatus, JobPriority } from './Job';
export type { CreateJobProps } from './Job';
export { JobExecution } from './JobExecution';
export type { JobExecutionProps } from './JobExecution';
export { LightModeConfig } from './LightModeConfig';
export type { LightModeConfigProps, LightModeThresholds } from './LightModeConfig';
export { HardwareMetrics, CpuMetrics, MemoryMetrics, DiskMetrics } from './HardwareMetrics';
export type { HardwareMetricsProps } from './HardwareMetrics';
export { ProcessSnapshot } from './ProcessSnapshot';
export type { ProcessSnapshotProps, ProcessEntry, ServiceEntry } from './ProcessSnapshot';
export { NetworkSnapshot } from './NetworkSnapshot';
export type { NetworkSnapshotProps, NetworkAdapter, OpenPort, ActiveConnection } from './NetworkSnapshot';
export { AutomationRule } from './AutomationRule';
export type { AutomationRuleProps, TriggerType, ActionType, TargetScope, TriggerCondition, ActionConfig } from './AutomationRule';

// ── Observability & Remediation Entities ──
export { FileIntegrityCheck, IntegrityStatus, ScanType, FileIntegritySeverity } from './FileIntegrityCheck';
export type { FileIntegrityCheckProps, CreateFileIntegrityCheckProps } from './FileIntegrityCheck';
export { VulnerabilityScan, RemediationStatus, VulnerabilitySeverity, VulnerabilityRemediatedEvent } from './VulnerabilityScan';
export type { VulnerabilityScanProps, CreateVulnerabilityScanProps } from './VulnerabilityScan';
export { BehavioralBaseline, BaselineType, AnomalySeverity } from './BehavioralBaseline';
export type { BehavioralBaselineProps, CreateBehavioralBaselineProps, StatisticalThresholds, AnomalyResult } from './BehavioralBaseline';
export { UsbDevice, DeviceType, UsbDeviceBlockedEvent } from './UsbDevice';
export type { UsbDeviceProps, CreateUsbDeviceProps } from './UsbDevice';
export { Certificate, CertStore } from './Certificate';
export type { CertificateProps, CreateCertificateProps } from './Certificate';
export { NetworkMetrics } from './NetworkMetrics';
export type { NetworkMetricsProps, CreateNetworkMetricsProps } from './NetworkMetrics';

// ── Proactive Security Entities ──
export { PatchDeployment, PatchDeploymentStatus, DeploymentType, DeploymentPriority, ValidationStatus, PatchDeploymentId } from './PatchDeployment';
export type { CreatePatchDeploymentProps } from './PatchDeployment';
export { NetworkAnomaly, NetworkAnomalyType, NetworkAnomalyId } from './NetworkAnomaly';
export { AnomalySeverity as NetworkAnomalySeverity } from './NetworkAnomaly';
export type { DetectNetworkAnomalyProps, NetworkBlockPolicy } from './NetworkAnomaly';
export { ComplianceScore, ComplianceScoreId } from './ComplianceScore';
export type { ComplianceDrift, ComplianceEvidence, ComplianceRecommendation } from './ComplianceScore';
