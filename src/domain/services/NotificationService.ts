/**
 * Domain Service: Multi-channel notification with rate limiting and deduplication.
 */

// ─── Types ──────────────────────────────────────────────

export enum NotificationChannel {
  EMAIL = 'email',
  TELEGRAM = 'telegram',
  WHATSAPP = 'whatsapp',
  IN_APP = 'in_app',
}

export enum NotificationType {
  SECURITY_ALERT = 'security_alert',
  COMPLIANCE_DRIFT = 'compliance_drift',
  CERTIFICATE_EXPIRY = 'certificate_expiry',
  PATCH_DEPLOYED = 'patch_deployed',
  MAINTENANCE_SUMMARY = 'maintenance_summary',
  HEALTH_CHECK_FAILED = 'health_check_failed',
  USB_DEVICE_BLOCKED = 'usb_device_blocked',
  BEHAVIORAL_ANOMALY = 'behavioral_anomaly',
  NETWORK_ANOMALY = 'network_anomaly',
}

export enum NotificationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface NotificationRecipient {
  id: string;
  email?: string;
  telegramChatId?: string;
  whatsappNumber?: string;
  channels: NotificationChannel[];
}

export interface NotificationPayload {
  type: NotificationType;
  severity: NotificationSeverity;
  subject: string;
  body: string;
  context: Record<string, string>;
  recipients: NotificationRecipient[];
}

export interface ChannelSendResult {
  channel: NotificationChannel;
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface NotificationResult {
  sent: boolean;
  totalChannels: number;
  successCount: number;
  results: ChannelSendResult[];
  deduplicated: boolean;
  rateLimited: boolean;
}

// ─── Port: Channel Provider ─────────────────────────────

export interface NotificationChannelProvider {
  channel: NotificationChannel;
  send(payload: NotificationPayload): Promise<ChannelSendResult>;
}

// ─── Service ────────────────────────────────────────────

export class NotificationService {
  private providers: Map<NotificationChannel, NotificationChannelProvider> = new Map();

  // Rate limiting: track last sent per type+tenant
  private rateLimitCache: Map<string, number> = new Map();
  private readonly RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour per type+tenant

  // Deduplication: track recent notification hashes
  private deduplicationCache: Map<string, number> = new Map();
  private readonly DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

  registerProvider(provider: NotificationChannelProvider): void {
    this.providers.set(provider.channel, provider);
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    // Rate limiting
    const rateLimitKey = `${payload.type}:${payload.context.tenantId ?? 'global'}`;
    const lastSent = this.rateLimitCache.get(rateLimitKey);
    if (lastSent && Date.now() - lastSent < this.RATE_LIMIT_MS && payload.severity !== NotificationSeverity.CRITICAL) {
      return { sent: false, totalChannels: 0, successCount: 0, results: [], deduplicated: false, rateLimited: true };
    }

    // Deduplication
    const dedupKey = `${payload.type}:${payload.subject}:${payload.context.agentId ?? ''}`;
    const lastDedupSent = this.deduplicationCache.get(dedupKey);
    if (lastDedupSent && Date.now() - lastDedupSent < this.DEDUP_WINDOW_MS && payload.severity !== NotificationSeverity.CRITICAL) {
      return { sent: false, totalChannels: 0, successCount: 0, results: [], deduplicated: true, rateLimited: false };
    }

    // Determine channels from recipients
    const channels = new Set<NotificationChannel>();
    for (const r of payload.recipients) {
      for (const ch of r.channels) {
        channels.add(ch);
      }
    }

    const results: ChannelSendResult[] = [];

    for (const channel of channels) {
      const provider = this.providers.get(channel);
      if (!provider) {
        results.push({ channel, success: false, error: 'No provider registered' });
        continue;
      }

      try {
        const result = await provider.send(payload);
        results.push(result);
      } catch (err) {
        results.push({ channel, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    const successCount = results.filter(r => r.success).length;

    // Update caches on success
    if (successCount > 0) {
      this.rateLimitCache.set(rateLimitKey, Date.now());
      this.deduplicationCache.set(dedupKey, Date.now());
    }

    return {
      sent: successCount > 0,
      totalChannels: results.length,
      successCount,
      results,
      deduplicated: false,
      rateLimited: false,
    };
  }

  /**
   * Cleanup old cache entries to prevent memory leaks.
   */
  cleanupCaches(): void {
    const now = Date.now();
    for (const [key, ts] of this.rateLimitCache) {
      if (now - ts > this.RATE_LIMIT_MS * 2) this.rateLimitCache.delete(key);
    }
    for (const [key, ts] of this.deduplicationCache) {
      if (now - ts > this.DEDUP_WINDOW_MS * 2) this.deduplicationCache.delete(key);
    }
  }

  getRegisteredChannels(): NotificationChannel[] {
    return Array.from(this.providers.keys());
  }
}
