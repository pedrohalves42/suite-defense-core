/**
 * Script-serving handlers: get-reinstall-script, get-reinstall-preserve-script
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { StaticScriptTemplateRepository } from '../../_shared/infrastructure/deployment/adapters/supabase-script-template.repository.ts';
import { RenderScriptUseCase } from '../../_shared/domain/deployment/use-cases/render-script.use-case.ts';

export async function handleGetReinstallScript(
  _supabase: any, _req: Request, requestId: string, _payload: Record<string, unknown>,
): Promise<Response> {
  const repository = new StaticScriptTemplateRepository();
  const useCase = new RenderScriptUseCase(repository);
  
  const content = await useCase.execute('reinstall', {});

  return new Response(content, {
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
  const repository = new StaticScriptTemplateRepository();
  const useCase = new RenderScriptUseCase(repository);
  
  const content = await useCase.execute('reinstall-preserve', {});

  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache', 'Expires': '0',
      'X-Request-ID': requestId,
    },
  });
}
