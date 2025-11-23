// FORCE REBUILD: 2025-11-23T01:16:00Z - CRITICAL FIX v3.2.3-SCHEDULED-TASK-ARGS-FIX
// Forcing Edge Functions redeploy to fix Task Scheduler error 4294770688
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
