
export interface IScriptTemplateRepository {
  getTemplate(name: 'reinstall' | 'reinstall-preserve'): Promise<string>;
}
