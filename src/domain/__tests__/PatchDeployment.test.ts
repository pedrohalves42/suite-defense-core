import { describe, it, expect } from 'vitest';
import { PatchDeployment, PatchDeploymentStatus, DeploymentType, DeploymentPriority, ValidationStatus } from '../../entities/PatchDeployment';
import { AgentId } from '../../value-objects/AgentId';
import { TenantId } from '../../value-objects/TenantId';

const agentId = AgentId.create('agent-1').value;
const tenantId = TenantId.create('tenant-1').value;

describe('PatchDeployment', () => {
  const validProps = () => ({
    patchId: 'patch-1',
    patchName: 'Security Update',
    patchVersion: '1.0.0',
    agentId,
    tenantId,
  });

  describe('create()', () => {
    it('creates with defaults', () => {
      const r = PatchDeployment.create(validProps());
      expect(r.isSuccess).toBe(true);
      expect(r.value.status).toBe(PatchDeploymentStatus.PENDING);
      expect(r.value.deploymentType).toBe(DeploymentType.STANDARD);
      expect(r.value.priority).toBe(DeploymentPriority.MEDIUM);
      expect(r.value.validationStatus).toBe(ValidationStatus.PENDING);
    });

    it('creates with custom type and priority', () => {
      const r = PatchDeployment.create({
        ...validProps(),
        deploymentType: DeploymentType.CANARY,
        priority: DeploymentPriority.URGENT,
      });
      expect(r.value.deploymentType).toBe(DeploymentType.CANARY);
      expect(r.value.priority).toBe(DeploymentPriority.URGENT);
    });
  });

  describe('FSM transitions', () => {
    it('can deploy from PENDING', () => {
      const pd = PatchDeployment.create(validProps()).value;
      expect(pd.canDeploy()).toBe(true);
      const r = pd.startDeployment();
      expect(r.isSuccess).toBe(true);
      expect(pd.status).toBe(PatchDeploymentStatus.DEPLOYING);
      expect(pd.deployedAt).toBeTruthy();
    });

    it('cannot deploy from DEPLOYING', () => {
      const pd = PatchDeployment.create(validProps()).value;
      pd.startDeployment();
      expect(pd.canDeploy()).toBe(false);
      expect(pd.startDeployment().isFailure).toBe(true);
    });

    it('completes deployment', () => {
      const pd = PatchDeployment.create(validProps()).value;
      pd.startDeployment();
      pd.completeDeployment(true);
      expect(pd.status).toBe(PatchDeploymentStatus.COMPLETED);
      expect(pd.rollbackAvailable).toBe(true);
    });

    it('fails deployment with error', () => {
      const pd = PatchDeployment.create(validProps()).value;
      pd.startDeployment();
      pd.failDeployment('timeout');
      expect(pd.status).toBe(PatchDeploymentStatus.FAILED);
      expect(pd.error).toBe('timeout');
    });

    it('rollback from completed', () => {
      const pd = PatchDeployment.create(validProps()).value;
      pd.startDeployment();
      pd.completeDeployment(true);
      expect(pd.rollback().isSuccess).toBe(true);
      expect(pd.status).toBe(PatchDeploymentStatus.ROLLED_BACK);
    });

    it('rollback fails without availability', () => {
      const pd = PatchDeployment.create(validProps()).value;
      pd.startDeployment();
      pd.completeDeployment(false);
      expect(pd.rollback().isFailure).toBe(true);
    });

    it('scheduleFor sets future date', () => {
      const pd = PatchDeployment.create(validProps()).value;
      const future = new Date(Date.now() + 60000);
      expect(pd.scheduleFor(future).isSuccess).toBe(true);
      expect(pd.status).toBe(PatchDeploymentStatus.SCHEDULED);
    });

    it('scheduleFor rejects past date', () => {
      const pd = PatchDeployment.create(validProps()).value;
      const past = new Date('2020-01-01');
      expect(pd.scheduleFor(past).isFailure).toBe(true);
    });

    it('validates deployment', () => {
      const pd = PatchDeployment.create(validProps()).value;
      pd.validateDeployment(true);
      expect(pd.validationStatus).toBe(ValidationStatus.PASSED);
      pd.validateDeployment(false);
      expect(pd.validationStatus).toBe(ValidationStatus.FAILED);
    });
  });
});
