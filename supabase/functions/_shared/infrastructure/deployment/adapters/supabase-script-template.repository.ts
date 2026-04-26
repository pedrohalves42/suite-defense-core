
import { IScriptTemplateRepository } from '../../../domain/deployment/ports/script-template.repository.ts';
import { REINSTALL_SCRIPT_CONTENT } from '../../../domain/deployment/legacy-reinstall-content.ts';
import { REINSTALL_PRESERVE_SCRIPT_CONTENT } from '../../../domain/deployment/legacy-preserve-content.ts';

export class StaticScriptTemplateRepository implements IScriptTemplateRepository {
  async getTemplate(name: 'reinstall' | 'reinstall-preserve'): Promise<string> {
    if (name === 'reinstall') {
      return REINSTALL_SCRIPT_CONTENT;
    }
    if (name === 'reinstall-preserve') {
      return REINSTALL_PRESERVE_SCRIPT_CONTENT;
    }
    throw new Error(`Template ${name} not found`);
  }
}
