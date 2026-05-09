export type ApiLocale = 'en' | 'pt-BR' | 'es';

type MessageKey =
  | 'auth.unauthorized'
  | 'auth.missing_hmac_headers'
  | 'auth.invalid_hmac_signature'
  | 'auth.invalid_hmac_secret'
  | 'auth.replay_detected'
  | 'auth.replay_check_failed'
  | 'auth.timestamp_out_of_range';

const MESSAGES: Record<ApiLocale, Record<MessageKey, string>> = {
  en: {
    'auth.unauthorized': 'Unauthorized',
    'auth.missing_hmac_headers': 'Missing strict HMAC headers (X-HMAC-Signature, X-HMAC-Timestamp, X-HMAC-Nonce)',
    'auth.invalid_hmac_signature': 'Invalid strict HMAC signature (payload/secret/header mismatch)',
    'auth.invalid_hmac_secret': 'Invalid HMAC secret. Agent must be reinstalled with a valid 64-character HEX secret.',
    'auth.replay_detected': 'Signature already used (replay attack detected)',
    'auth.replay_check_failed': 'Replay protection check failed',
    'auth.timestamp_out_of_range': 'Timestamp expired or outside the allowed 300-second skew',
  },
  'pt-BR': {
    'auth.unauthorized': 'Nao autorizado',
    'auth.missing_hmac_headers': 'Cabecalhos HMAC estritos ausentes (X-HMAC-Signature, X-HMAC-Timestamp, X-HMAC-Nonce)',
    'auth.invalid_hmac_signature': 'Assinatura HMAC estrita invalida (payload/segredo/cabecalho divergente)',
    'auth.invalid_hmac_secret': 'Segredo HMAC invalido. Reinstale o agente com um segredo HEX valido de 64 caracteres.',
    'auth.replay_detected': 'Assinatura ja utilizada (ataque de replay detectado)',
    'auth.replay_check_failed': 'Falha na verificacao de protecao contra replay',
    'auth.timestamp_out_of_range': 'Timestamp expirado ou fora da janela permitida de 300 segundos',
  },
  es: {
    'auth.unauthorized': 'No autorizado',
    'auth.missing_hmac_headers': 'Faltan encabezados HMAC estrictos (X-HMAC-Signature, X-HMAC-Timestamp, X-HMAC-Nonce)',
    'auth.invalid_hmac_signature': 'Firma HMAC estricta invalida (payload/secreto/encabezado no coincide)',
    'auth.invalid_hmac_secret': 'Secreto HMAC invalido. Reinstale el agente con un secreto HEX valido de 64 caracteres.',
    'auth.replay_detected': 'Firma ya utilizada (ataque de replay detectado)',
    'auth.replay_check_failed': 'Error al verificar la proteccion contra replay',
    'auth.timestamp_out_of_range': 'Timestamp expirado o fuera de la ventana permitida de 300 segundos',
  },
};

export function resolveApiLocale(acceptLanguage?: string | null): ApiLocale {
  const raw = (acceptLanguage || '').toLowerCase();
  if (raw.includes('pt')) return 'pt-BR';
  if (raw.includes('es')) return 'es';
  return 'en';
}

export function apiMessage(key: MessageKey, locale: ApiLocale): string {
  return MESSAGES[locale]?.[key] ?? MESSAGES.en[key];
}

export function hmacErrorMessage(errorCode: string | undefined, locale: ApiLocale, fallback?: string): string {
  const map: Record<string, MessageKey> = {
    AUTH_MISSING_HEADERS: 'auth.missing_hmac_headers',
    AUTH_INVALID_SECRET_FORMAT: 'auth.invalid_hmac_secret',
    AUTH_REPLAY_DETECTED: 'auth.replay_detected',
    AUTH_REPLAY_CHECK_FAILED: 'auth.replay_check_failed',
    AUTH_TIMESTAMP_OUT_OF_RANGE: 'auth.timestamp_out_of_range',
    AUTH_INVALID_SIGNATURE: 'auth.invalid_hmac_signature',
  };
  const key = errorCode ? map[errorCode] : undefined;
  return key ? apiMessage(key, locale) : (fallback || apiMessage('auth.unauthorized', locale));
}
