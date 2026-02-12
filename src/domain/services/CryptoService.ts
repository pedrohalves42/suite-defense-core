import type { CryptoPort } from '../ports/CryptoPort';
import type { Agent } from '../entities/Agent';

/**
 * Domain service: Crypto operations delegated to port.
 * Provides high-level crypto methods used by use cases.
 */
export class CryptoService {
  constructor(private readonly cryptoPort: CryptoPort) {}

  async generateAgentCredentials(): Promise<{ token: string; hmacSecret: string }> {
    const token = crypto.randomUUID();
    const hmacSecret = await this.cryptoPort.generateHmacSecret();
    return { token, hmacSecret };
  }

  async verifyAgentRequest(
    agent: Agent,
    requestBody: string,
    signature: string
  ): Promise<boolean> {
    return await this.cryptoPort.verifyHmac(
      requestBody,
      agent.hmacSecret.value,
      signature
    );
  }

  async hashAgentToken(token: string): Promise<string> {
    return await this.cryptoPort.hashToken(token);
  }

  async hashPayload(payload: string): Promise<string> {
    return this.cryptoPort.computeSha256(payload);
  }
}
