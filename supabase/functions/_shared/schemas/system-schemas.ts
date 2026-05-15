import { z } from 'https://esm.sh/zod@3.23.8';

/**
 * Mapeamento e Validação Ponta a Ponta do CyberShield
 * Este arquivo é a fonte de verdade para contratos entre Frontend e Edge Functions.
 */

// --- 1. Autenticação e Usuários ---

export const signupSchema = z.object({
  email: z.string().trim().min(1, 'Email é obrigatório').email('Email inválido').max(255),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres').max(72),
  fullName: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email ou username é obrigatório').max(255),
  password: z.string().min(1, 'Senha é obrigatória').max(72),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
  newPassword: z.string()
    .min(8, 'Mínimo 8 caracteres')
    .max(72)
    .regex(/[A-Z]/, 'Deve conter letra maiúscula')
    .regex(/[a-z]/, 'Deve conter letra minúscula')
    .regex(/[0-9]/, 'Deve conter número'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

// --- 2. Gestão de Membros e Convites ---

export const createUserSchema = z.object({
  username: z.string()
    .min(3, 'Username deve ter pelo menos 3 caracteres')
    .max(32)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'Formato de username inválido'),
  password: z.string().min(8).max(72),
  full_name: z.string().min(2).max(100),
  role: z.enum(['admin', 'operator', 'viewer']),
});

export const sendInviteSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
  role: z.enum(['admin', 'operator', 'viewer']),
});

// --- 3. Infraestrutura e Agentes ---

export const enrollAgentSchema = z.object({
  enrollmentKey: z.string().min(1, 'Chave de instalação necessária'),
  agentName: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  agentVersion: z.string().optional(),
  supportsHmac: z.boolean().default(false),
  metadataHash: z.string().optional(),
});

export const createJobSchema = z.object({
  agentName: z.string().min(1),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  approved: z.boolean().default(true),
  scheduledAt: z.string().datetime().optional(),
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.string().optional(),
});

// --- 4. Configurações e Branding ---

export const tenantSettingsSchema = z.object({
  alert_email: z.string().email().optional().or(z.literal('')),
  alert_webhook_url: z.string().url().optional().or(z.literal('')),
  enable_email_alerts: z.boolean().default(true),
  enable_webhook_alerts: z.boolean().default(false),
  virustotal_enabled: z.boolean().default(false),
});

export const brandingSchema = z.object({
  company_name: z.string().min(1).max(255),
  company_cnpj: z.string().max(20).optional(),
  primary_color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Cor inválida'),
  secondary_color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Cor inválida'),
  logo_url: z.string().url().optional().or(z.literal('')),
});

// --- 5. Contratos de API Gateway (Payloads) ---

export const gatewayRequestSchema = z.object({
  action: z.string().min(1).max(80), // Formato: "namespace:action"
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});
