// FORCE REBUILD: 2025-11-22T12:30:00Z - CRITICAL SYNTAX FIX
// Bug #1: \` -> ` (35 ocorrencias) | Bug #2: : $_ -> : $($_.Exception.Message) (12 ocorrencias)
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
