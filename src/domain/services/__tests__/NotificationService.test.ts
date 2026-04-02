import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotificationService,
  NotificationChannel,
  NotificationType,
  NotificationSeverity,
  type NotificationPayload,
  type NotificationChannelProvider,
} from '@/domain/services/NotificationService';

const mkPayload = (overrides: Partial<NotificationPayload> = {}): NotificationPayload => ({
  type: NotificationType.SECURITY_ALERT,
  severity: NotificationSeverity.HIGH,
  subject: 'Test Alert',
  body: 'Alert body',
  context: { tenantId: 't1' },
  recipients: [{ id: 'u1', email: 'a@b.com', channels: [NotificationChannel.EMAIL] }],
  ...overrides,
});

describe('NotificationService', () => {
  let service: NotificationService;
  let emailProvider: NotificationChannelProvider;

  beforeEach(() => {
    service = new NotificationService();
    emailProvider = {
      channel: NotificationChannel.EMAIL,
      send: vi.fn().mockResolvedValue({ channel: NotificationChannel.EMAIL, success: true, messageId: 'm1' }),
    };
    service.registerProvider(emailProvider);
  });

  it('sends via registered provider', async () => {
    const result = await service.send(mkPayload());
    expect(result.sent).toBe(true);
    expect(result.successCount).toBe(1);
    expect(emailProvider.send).toHaveBeenCalled();
  });

  it('reports no provider as failure', async () => {
    const payload = mkPayload({
      recipients: [{ id: 'u1', channels: [NotificationChannel.TELEGRAM] }],
    });
    const result = await service.send(payload);
    expect(result.sent).toBe(false);
    expect(result.results[0].error).toContain('No provider');
  });

  it('rate-limits non-critical duplicate sends', async () => {
    await service.send(mkPayload());
    const result = await service.send(mkPayload());
    expect(result.rateLimited).toBe(true);
    expect(result.sent).toBe(false);
  });

  it('does NOT rate-limit critical notifications', async () => {
    await service.send(mkPayload());
    const result = await service.send(mkPayload({ severity: NotificationSeverity.CRITICAL }));
    expect(result.rateLimited).toBe(false);
    expect(result.sent).toBe(true);
  });

  it('deduplicates within window', async () => {
    // First send succeeds
    await service.send(mkPayload());
    // Same type+subject+agentId in context => dedup
    const payload2 = mkPayload({ context: { tenantId: 't2' } });
    // Different tenant so rate limit won't trigger, but same subject will dedup
    const result = await service.send(payload2);
    expect(result.deduplicated).toBe(true);
  });

  it('handles provider error gracefully', async () => {
    (emailProvider.send as any).mockRejectedValue(new Error('SMTP down'));
    const result = await service.send(mkPayload());
    expect(result.sent).toBe(false);
    expect(result.results[0].error).toBe('SMTP down');
  });

  it('getRegisteredChannels returns all providers', () => {
    expect(service.getRegisteredChannels()).toEqual([NotificationChannel.EMAIL]);
  });

  it('cleanupCaches does not throw', () => {
    expect(() => service.cleanupCaches()).not.toThrow();
  });
});
