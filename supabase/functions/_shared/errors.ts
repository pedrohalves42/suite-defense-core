const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token, x-admin-secret',
};

const ERROR_MESSAGES: Record<string, string> = {
  'duplicate key value violates': 'Recurso já existe',
  'foreign key constraint': 'Referência inválida',
  'check constraint': 'Formato de dados inválido',
  'not-null violation': 'Campo obrigatório ausente',
  'invalid input syntax': 'Formato de dados inválido',
};

export function handleError(error: unknown, requestId?: string): Response {
  // Log detailed error server-side only
  console.error('[INTERNAL ERROR]', {
    requestId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  // Return safe generic message
  let userMessage = 'Ocorreu um erro ao processar sua solicitação';

  if (error instanceof Error) {
    // Map known errors to safe messages
    for (const [pattern, message] of Object.entries(ERROR_MESSAGES)) {
      if (error.message.includes(pattern)) {
        userMessage = message;
        break;
      }
    }
  }

  return new Response(
    JSON.stringify({
      error: userMessage,
      requestId: requestId || crypto.randomUUID(),
    }),
    {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

export { corsHeaders };
