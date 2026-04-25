/**
 * Script-serving handlers: get-reinstall-script, get-reinstall-preserve-script
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { REINSTALL_SCRIPT_CONTENT } from '../../_shared/reinstall-script-content.ts';
import { REINSTALL_PRESERVE_SCRIPT_CONTENT } from '../../_shared/reinstall-preserve-script-content.ts';

export async function handleGetReinstallScript(
  _supabase: any, _req: Request, requestId: string, _payload: Record<string, unknown>,
): Promise<Response> {
  return new Response(REINSTALL_SCRIPT_CONTENT, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="reinstall-cybershield-agent.ps1"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache', 'Expires': '0',
    },
  });
}

export async function handleGetReinstallPreserveScript(
  _supabase: any, _req: Request, requestId: string, _payload: Record<string, unknown>,
): Promise<Response> {
  return new Response(REINSTALL_PRESERVE_SCRIPT_CONTENT, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache', 'Expires': '0',
      'X-Request-ID': requestId,
    },
  });
}
