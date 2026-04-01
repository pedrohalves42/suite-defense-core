import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string()
    .trim()
    .min(1, 'Email ou username é obrigatório')
    .max(255, 'Valor muito longo'),
  password: z.string()
    .min(1, 'Senha é obrigatória')
    .max(72, 'Senha muito longa'),
});

export function getLoginEmail(identifier: string): string {
  if (identifier.includes('@')) {
    return identifier.toLowerCase().trim();
  }
  return `${identifier.toLowerCase().trim()}@local.internal`;
}
