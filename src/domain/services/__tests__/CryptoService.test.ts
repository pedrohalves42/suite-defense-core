import { describe, it, expect, vi } from 'vitest';
import { CryptoService } from '@/domain/services/CryptoService';
import type { CryptoPort } from '@/domain/ports/CryptoPort';

describe('CryptoService', () => {
  const mockPort: CryptoPort = {
    generateHmacSecret: vi.fn().mockResolvedValue('mock-secret-hex'),
    verifyHmac: vi.fn().mockResolvedValue(true),
    hashToken: vi.fn().mockResolvedValue('hashed-token'),
    computeSha256: vi.fn().mockResolvedValue('sha256-hash'),
    encrypt: vi.fn().mockResolvedValue('encrypted'),
    decrypt: vi.fn().mockResolvedValue('decrypted'),
  };

  const service = new CryptoService(mockPort);

  it('generateAgentCredentials returns token and hmacSecret', async () => {
    const result = await service.generateAgentCredentials();
    expect(result.token).toBeDefined();
    expect(result.hmacSecret).toBe('mock-secret-hex');
    expect(mockPort.generateHmacSecret).toHaveBeenCalled();
  });

  it('verifyAgentRequest delegates to port', async () => {
    const agent = { hmacSecret: { value: 'secret' } } as any;
    const result = await service.verifyAgentRequest(agent, 'body', 'sig');
    expect(result).toBe(true);
    expect(mockPort.verifyHmac).toHaveBeenCalledWith('body', 'secret', 'sig');
  });

  it('hashAgentToken delegates to port', async () => {
    const result = await service.hashAgentToken('token');
    expect(result).toBe('hashed-token');
    expect(mockPort.hashToken).toHaveBeenCalledWith('token');
  });

  it('hashPayload delegates to computeSha256', async () => {
    const result = await service.hashPayload('payload');
    expect(result).toBe('sha256-hash');
    expect(mockPort.computeSha256).toHaveBeenCalledWith('payload');
  });
});
