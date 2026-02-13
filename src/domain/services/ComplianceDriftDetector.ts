/**
 * Domain Service: Detects drift in compliance scores over time
 * and generates alerts when scores deviate beyond thresholds.
 */

import type { ComplianceDrift } from '../entities/ComplianceScore';

export interface ComplianceSnapshot {
  tenantId: string;
  overallScore: number;
  grade: string;
  calculatedAt: Date;
}

export interface DriftDetectionResult {
  hasDrift: boolean;
  drifts: ComplianceDrift[];
  trend: 'improving' | 'degrading' | 'stable';
  requiresAlert: boolean;
  alertSeverity: 'info' | 'warning' | 'critical';
}

const DRIFT_THRESHOLDS = {
  alert: 5,        // alert when score drops by 5+
  warning: 10,     // warning when score drops by 10+
  critical: 15,    // critical when score drops by 15+
};

export class ComplianceDriftDetector {
  /**
   * Compare current score against a historical snapshot to detect drift.
   */
  detect(current: ComplianceSnapshot, previous: ComplianceSnapshot | null): DriftDetectionResult {
    if (!previous) {
      return { hasDrift: false, drifts: [], trend: 'stable', requiresAlert: false, alertSeverity: 'info' };
    }

    const diff = current.overallScore - previous.overallScore;
    const absDiff = Math.abs(diff);
    const drifts: ComplianceDrift[] = [];

    if (absDiff >= DRIFT_THRESHOLDS.alert) {
      drifts.push({
        category: 'overall',
        previousScore: previous.overallScore,
        currentScore: current.overallScore,
        difference: diff,
        severity: absDiff >= DRIFT_THRESHOLDS.critical ? 'high' : absDiff >= DRIFT_THRESHOLDS.warning ? 'medium' : 'low',
      });
    }

    const trend: DriftDetectionResult['trend'] =
      diff > 2 ? 'improving' : diff < -2 ? 'degrading' : 'stable';

    const requiresAlert = diff < -DRIFT_THRESHOLDS.alert;
    const alertSeverity: DriftDetectionResult['alertSeverity'] =
      diff <= -DRIFT_THRESHOLDS.critical ? 'critical' :
      diff <= -DRIFT_THRESHOLDS.warning ? 'warning' : 'info';

    return {
      hasDrift: drifts.length > 0,
      drifts,
      trend,
      requiresAlert,
      alertSeverity,
    };
  }

  /**
   * Analyze a time series of scores for trend detection.
   */
  analyzeTrend(snapshots: ComplianceSnapshot[]): { trend: string; averageChange: number } {
    if (snapshots.length < 2) return { trend: 'insufficient_data', averageChange: 0 };

    const sorted = [...snapshots].sort((a, b) => a.calculatedAt.getTime() - b.calculatedAt.getTime());
    const changes: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      changes.push(sorted[i].overallScore - sorted[i - 1].overallScore);
    }

    const avg = changes.reduce((s, v) => s + v, 0) / changes.length;

    return {
      trend: avg > 1 ? 'improving' : avg < -1 ? 'degrading' : 'stable',
      averageChange: Math.round(avg * 100) / 100,
    };
  }
}
