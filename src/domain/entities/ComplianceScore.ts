import { Entity } from '../shared/Entity';
import { ValueObject } from '../shared/ValueObject';
import { TenantId } from '../value-objects/TenantId';
import { ComplianceScoreChangedEvent } from '../events/SecurityEvents';

// ─── Types ──────────────────────────────────────────────

export interface ComplianceDrift {
  category: string;
  previousScore: number;
  currentScore: number;
  difference: number;
  severity: 'low' | 'medium' | 'high';
}

export interface ComplianceEvidence {
  type: string;
  description: string;
  timestamp: Date;
  frameworks: string[];
}

export interface ComplianceRecommendation {
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  actionItems: string[];
}

// ─── Value Object ───────────────────────────────────────

export class ComplianceScoreId extends ValueObject<string> {
  static generate(): ComplianceScoreId { return new ComplianceScoreId(crypto.randomUUID()); }
}

// ─── Entity ─────────────────────────────────────────────

export class ComplianceScore extends Entity<ComplianceScoreId> {
  private _tenantId: TenantId;
  private _overallScore: number;
  private _grade: string;
  private _drifts: ComplianceDrift[];
  private _hasDrift: boolean;
  private _evidence: ComplianceEvidence[];
  private _recommendations: ComplianceRecommendation[];
  private _calculatedAt: Date;

  private constructor(
    id: ComplianceScoreId,
    props: {
      tenantId: TenantId;
      overallScore: number;
      grade: string;
      drifts: ComplianceDrift[];
      hasDrift: boolean;
      evidence: ComplianceEvidence[];
      recommendations: ComplianceRecommendation[];
      calculatedAt: Date;
    },
  ) {
    super(id);
    this._tenantId = props.tenantId;
    this._overallScore = props.overallScore;
    this._grade = props.grade;
    this._drifts = props.drifts;
    this._hasDrift = props.hasDrift;
    this._evidence = props.evidence;
    this._recommendations = props.recommendations;
    this._calculatedAt = props.calculatedAt;
  }

  static fromCalculation(
    tenantId: TenantId,
    overallScore: number,
    grade: string,
    previousScore: number | null,
  ): ComplianceScore {
    const drifts: ComplianceDrift[] = [];
    let hasDrift = false;

    if (previousScore !== null) {
      const diff = overallScore - previousScore;
      if (Math.abs(diff) >= 5) {
        hasDrift = true;
        drifts.push({
          category: 'overall',
          previousScore,
          currentScore: overallScore,
          difference: diff,
          severity: Math.abs(diff) >= 15 ? 'high' : Math.abs(diff) >= 10 ? 'medium' : 'low',
        });
      }
    }

    const score = new ComplianceScore(ComplianceScoreId.generate(), {
      tenantId,
      overallScore,
      grade,
      drifts,
      hasDrift,
      evidence: [],
      recommendations: ComplianceScore.generateRecommendations(overallScore),
      calculatedAt: new Date(),
    });

    if (previousScore !== null && hasDrift) {
      score.addDomainEvent(new ComplianceScoreChangedEvent(
        score.id.value,
        tenantId.value,
        previousScore,
        overallScore,
      ));
    }

    return score;
  }

  private static generateRecommendations(score: number): ComplianceRecommendation[] {
    const recs: ComplianceRecommendation[] = [];
    if (score < 70) {
      recs.push({
        category: 'overall',
        priority: 'critical',
        title: 'Critical compliance improvement needed',
        description: 'Overall score below acceptable threshold',
        actionItems: [
          'Address all critical vulnerabilities immediately',
          'Enable antivirus on all endpoints',
          'Review and fix file integrity violations',
        ],
      });
    } else if (score < 85) {
      recs.push({
        category: 'overall',
        priority: 'medium',
        title: 'Compliance improvements recommended',
        description: 'Score is acceptable but below target',
        actionItems: [
          'Remediate remaining high-severity vulnerabilities',
          'Ensure all certificates are valid',
          'Review USB device policies',
        ],
      });
    }
    return recs;
  }

  // ─── Getters ──────────────────────────────────────────

  get tenantId(): TenantId { return this._tenantId; }
  get overallScore(): number { return this._overallScore; }
  get grade(): string { return this._grade; }
  get drifts(): ComplianceDrift[] { return [...this._drifts]; }
  get hasDrift(): boolean { return this._hasDrift; }
  get evidence(): ComplianceEvidence[] { return [...this._evidence]; }
  get recommendations(): ComplianceRecommendation[] { return [...this._recommendations]; }
  get calculatedAt(): Date { return this._calculatedAt; }
}
