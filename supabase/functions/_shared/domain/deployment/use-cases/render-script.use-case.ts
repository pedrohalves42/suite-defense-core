
import { IScriptTemplateRepository } from '../ports/script-template.repository.ts';

export interface RenderContext {
  agentToken?: string;
  hmacSecret?: string;
  agentName?: string;
  serverUrl?: string;
  fallbackServerUrl?: string;
  [key: string]: string | undefined;
}

export class RenderScriptUseCase {
  constructor(private readonly templateRepo: IScriptTemplateRepository) {}

  async execute(templateName: 'reinstall' | 'reinstall-preserve', context: RenderContext): Promise<string> {
    const template = await this.templateRepo.getTemplate(templateName);
    
    // For these specific scripts, they are PowerShell with param() blocks or embedded variables.
    // If we need to perform string replacement (rendering), we do it here.
    // Currently, REINSTALL_SCRIPT_CONTENT is a script that takes parameters,
    // and REINSTALL_PRESERVE_SCRIPT_CONTENT is a standalone script that auto-extracts.
    
    // Example of simple placeholder replacement if needed in the future:
    let rendered = template;
    for (const [key, value] of Object.entries(context)) {
      if (value) {
        // This is a naive replacement, adjust based on actual template syntax if needed
        const placeholder = `{{${key}}}`;
        rendered = rendered.replaceAll(placeholder, value);
      }
    }

    return rendered;
  }
}
