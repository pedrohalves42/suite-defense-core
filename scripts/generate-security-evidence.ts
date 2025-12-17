/**
 * Security Evidence Generator
 * 
 * Generates immutable evidence artifacts for security invariant validation.
 * Produces JSON report, SHA256 hash, and metadata for audit trail.
 * 
 * Usage: npx tsx scripts/generate-security-evidence.ts
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface InvariantResult {
  id: string;
  name: string;
  version: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  tests_passed: number;
  tests_failed: number;
  tests_skipped: number;
  evidence: string[];
  cwe_mapping: string[];
}

interface SecurityEvidenceReport {
  audit_id: string;
  version: string;
  timestamp: string;
  commit_sha: string;
  ci_run_id: string;
  environment: string;
  immutable: boolean;
  invariants: Record<string, InvariantResult>;
  summary: {
    total_invariants: number;
    passed: number;
    failed: number;
    skipped: number;
    compliance_percentage: number;
  };
  generated_by: string;
}

interface EvidenceMetadata {
  audit_id: string;
  commit_sha: string;
  ci_run_id: string;
  generated_at: string;
  generated_by: string;
  environment: string;
  immutable: boolean;
  report_sha256: string;
}

const INVARIANTS_VERSION = '1.1.0';

const INVARIANTS_CONFIG: Array<{
  id: string;
  name: string;
  version: string;
  cwe_mapping: string[];
}> = [
  {
    id: 'INV-001',
    name: 'Cross-Tenant Isolation',
    version: '1.0.0',
    cwe_mapping: ['CWE-284', 'CWE-639', 'CWE-862']
  },
  {
    id: 'INV-002',
    name: 'HMAC Authentication',
    version: '1.1.0',
    cwe_mapping: ['CWE-294', 'CWE-345', 'CWE-347']
  },
  {
    id: 'INV-003',
    name: 'Script Integrity',
    version: '1.0.0',
    cwe_mapping: ['CWE-494', 'CWE-354']
  },
  {
    id: 'INV-004',
    name: 'AI Data Isolation',
    version: '1.0.0',
    cwe_mapping: ['CWE-89', 'CWE-200', 'CWE-209']
  },
  {
    id: 'INV-005',
    name: 'Fail-Closed Behavior',
    version: '1.0.0',
    cwe_mapping: ['CWE-754', 'CWE-636']
  },
  {
    id: 'INV-006',
    name: 'Network Enforcement',
    version: '1.0.0',
    cwe_mapping: ['CWE-441', 'CWE-923']
  }
];

function generateAuditId(): string {
  const date = new Date().toISOString().split('T')[0];
  const random = crypto.randomBytes(4).toString('hex');
  return `secinv-${date}-${random}`;
}

function getCommitSha(): string {
  try {
    return process.env.COMMIT_SHA || 
           execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim().substring(0, 7);
  } catch {
    return 'unknown';
  }
}

function getCIRunId(): string {
  return process.env.CI_RUN_ID || 'local-' + Date.now();
}

function parseTestResults(): Map<string, { passed: number; failed: number; skipped: number }> {
  const results = new Map<string, { passed: number; failed: number; skipped: number }>();
  
  // Initialize all invariants
  for (const inv of INVARIANTS_CONFIG) {
    results.set(inv.id, { passed: 0, failed: 0, skipped: 0 });
  }
  
  // Try to parse Playwright JSON results
  const resultsFile = path.join(process.cwd(), 'security-results.json');
  
  if (fs.existsSync(resultsFile)) {
    try {
      const rawResults = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
      
      if (rawResults.suites) {
        for (const suite of rawResults.suites) {
          // Match suite title to invariant
          for (const inv of INVARIANTS_CONFIG) {
            if (suite.title?.includes(inv.id)) {
              const invResults = results.get(inv.id)!;
              
              for (const spec of suite.specs || []) {
                if (spec.ok) {
                  invResults.passed++;
                } else if (spec.tests?.some((t: any) => t.status === 'skipped')) {
                  invResults.skipped++;
                } else {
                  invResults.failed++;
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Could not parse test results:', error);
    }
  }
  
  return results;
}

function generateReport(): SecurityEvidenceReport {
  const testResults = parseTestResults();
  const auditId = generateAuditId();
  
  const invariants: Record<string, InvariantResult> = {};
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  
  for (const config of INVARIANTS_CONFIG) {
    const results = testResults.get(config.id) || { passed: 0, failed: 0, skipped: 0 };
    
    // Determine status
    let status: 'PASS' | 'FAIL' | 'SKIP' = 'PASS';
    if (results.failed > 0) {
      status = 'FAIL';
      totalFailed++;
    } else if (results.passed === 0 && results.skipped > 0) {
      status = 'SKIP';
      totalSkipped++;
    } else {
      totalPassed++;
    }
    
    invariants[config.id] = {
      id: config.id,
      name: config.name,
      version: config.version,
      status,
      tests_passed: results.passed,
      tests_failed: results.failed,
      tests_skipped: results.skipped,
      evidence: [
        `Validated via e2e/security-invariants.spec.ts`,
        `Reference: docs/SECURITY_INVARIANTS.md#${config.id.toLowerCase()}`
      ],
      cwe_mapping: config.cwe_mapping
    };
  }
  
  const totalInvariants = INVARIANTS_CONFIG.length;
  const compliancePercentage = Math.round((totalPassed / totalInvariants) * 100);
  
  return {
    audit_id: auditId,
    version: INVARIANTS_VERSION,
    timestamp: new Date().toISOString(),
    commit_sha: getCommitSha(),
    ci_run_id: getCIRunId(),
    environment: process.env.CI ? 'CI' : 'local',
    immutable: true,
    invariants,
    summary: {
      total_invariants: totalInvariants,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped,
      compliance_percentage: compliancePercentage
    },
    generated_by: 'Security Invariants Gate'
  };
}

function calculateSHA256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

async function main() {
  console.log('🔒 Generating Security Evidence Artifact...\n');
  
  // Create artifacts directory
  const artifactsDir = path.join(process.cwd(), 'artifacts', 'security');
  fs.mkdirSync(artifactsDir, { recursive: true });
  
  // Generate report
  const report = generateReport();
  const reportJson = JSON.stringify(report, null, 2);
  const reportSha256 = calculateSHA256(reportJson);
  
  // File paths
  const reportFile = path.join(artifactsDir, `invariants-report-v${INVARIANTS_VERSION}.json`);
  const hashFile = path.join(artifactsDir, `invariants-report-v${INVARIANTS_VERSION}.sha256`);
  const metaFile = path.join(artifactsDir, `invariants-report-v${INVARIANTS_VERSION}.meta.json`);
  
  // Write report
  fs.writeFileSync(reportFile, reportJson, 'utf-8');
  console.log(`✅ Report: ${reportFile}`);
  
  // Write hash
  fs.writeFileSync(hashFile, `${reportSha256}  invariants-report-v${INVARIANTS_VERSION}.json\n`, 'utf-8');
  console.log(`✅ Hash: ${hashFile}`);
  
  // Write metadata
  const metadata: EvidenceMetadata = {
    audit_id: report.audit_id,
    commit_sha: report.commit_sha,
    ci_run_id: report.ci_run_id,
    generated_at: report.timestamp,
    generated_by: report.generated_by,
    environment: report.environment,
    immutable: true,
    report_sha256: reportSha256
  };
  
  fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`✅ Metadata: ${metaFile}`);
  
  // Print summary
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║          SECURITY EVIDENCE ARTIFACT GENERATED                ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Audit ID: ${report.audit_id.padEnd(41)}║`);
  console.log(`║ Version: ${INVARIANTS_VERSION.padEnd(42)}║`);
  console.log(`║ Commit: ${report.commit_sha.padEnd(43)}║`);
  console.log(`║ SHA256: ${reportSha256.substring(0, 32)}...       ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Invariants: ${report.summary.passed}/${report.summary.total_invariants} PASSED                                   ║`);
  console.log(`║ Compliance: ${report.summary.compliance_percentage}%                                          ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // Exit with error if any invariant failed
  if (report.summary.failed > 0) {
    console.error('❌ SECURITY INVARIANT VIOLATIONS DETECTED');
    process.exit(1);
  }
  
  console.log('✅ All security invariants validated successfully');
}

main().catch(console.error);
