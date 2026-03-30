/**
 * Compliance report constants - Security invariants and template sections
 */

export const SECURITY_INVARIANTS = [
  { id: "INV-001", name: "Protecao de Dados", technicalName: "RLS Ativo", description: "Todas as tabelas possuem protecao de acesso (Row Level Security)", laymanDescription: "Seus dados sao protegidos e so voce pode ve-los", check: "rls_enabled" },
  { id: "INV-002", name: "Autenticacao Segura", technicalName: "HMAC Auth", description: "Comunicacao dos agentes usa assinatura criptografica HMAC-SHA256", laymanDescription: "A comunicacao entre seus computadores e o servidor e criptografada", check: "hmac_auth" },
  { id: "INV-003", name: "Isolamento de Dados", technicalName: "Multi-Tenant", description: "Dados segregados por tenant_id - isolamento garantido", laymanDescription: "Seus dados estao completamente separados de outras empresas", check: "tenant_isolation" },
  { id: "INV-004", name: "Senhas Protegidas", technicalName: "Credential Masking", description: "Credenciais nao aparecem em logs ou relatorios", laymanDescription: "Suas senhas nunca sao armazenadas em texto visivel", check: "credential_masking" },
  { id: "INV-005", name: "Modo Seguranca", technicalName: "Fail-Closed", description: "Sistema bloqueia automaticamente em caso de falha repetida", laymanDescription: "O sistema se protege automaticamente quando detecta problemas", check: "fail_closed" },
  { id: "INV-006", name: "Filtro de Sites", technicalName: "DNS Filter", description: "Bloqueio de sites maliciosos e perigosos esta configurado", laymanDescription: "Sites perigosos sao bloqueados automaticamente", check: "dns_filter" },
];

export const TEMPLATE_SECTIONS: Record<string, Array<{id: string; title: string; description: string; laymanDescription: string}>> = {
  LGPD: [
    { id: "SEC-LGPD-001", title: "Inventario de Dados", description: "Mapeamento de dados pessoais coletados e processados", laymanDescription: "Lista de quais informacoes pessoais sua empresa coleta" },
    { id: "SEC-LGPD-002", title: "Logs de Acesso", description: "Registros de quem acessou dados pessoais", laymanDescription: "Historico de quem viu ou alterou informacoes" },
    { id: "SEC-LGPD-003", title: "Retencao de Dados", description: "Politica de quanto tempo os dados sao mantidos", laymanDescription: "Por quanto tempo seus dados ficam armazenados" },
    { id: "SEC-LGPD-004", title: "Base Legal", description: "Verificacao de consentimento e bases legais", laymanDescription: "Confirmacao de que voce tem permissao para usar os dados" },
    { id: "SEC-LGPD-005", title: "Incidentes", description: "Registro de incidentes de seguranca no periodo", laymanDescription: "Problemas de seguranca que aconteceram" },
  ],
  ISO_27001: [
    { id: "SEC-ISO-001", title: "Politicas de Seguranca", description: "Controles de seguranca implementados", laymanDescription: "Regras de protecao que estao ativas" },
    { id: "SEC-ISO-002", title: "Gestao de Ativos", description: "Inventario de equipamentos e sistemas", laymanDescription: "Lista de todos os computadores e programas" },
    { id: "SEC-ISO-003", title: "Controle de Acesso", description: "Gestao de permissoes e autenticacao", laymanDescription: "Quem pode acessar o que no sistema" },
    { id: "SEC-ISO-004", title: "Logs de Alteracao", description: "Trilha de auditoria de modificacoes", laymanDescription: "Historico de todas as mudancas feitas" },
    { id: "SEC-ISO-005", title: "Gestao de Incidentes", description: "Timeline de eventos de seguranca", laymanDescription: "Cronograma de problemas e como foram resolvidos" },
  ],
  SOC2_LITE: [
    { id: "SEC-SOC-001", title: "Seguranca", description: "Protecao contra acessos nao autorizados", laymanDescription: "Como o sistema impede invasoes" },
    { id: "SEC-SOC-002", title: "Disponibilidade", description: "Tempo de atividade e performance", laymanDescription: "Quanto tempo o sistema ficou funcionando" },
    { id: "SEC-SOC-003", title: "Integridade", description: "Garantia de dados integros e corretos", laymanDescription: "Confirmacao de que os dados nao foram alterados" },
    { id: "SEC-SOC-004", title: "Confidencialidade", description: "Protecao de informacoes sensiveis", laymanDescription: "Como suas informacoes secretas sao protegidas" },
    { id: "SEC-SOC-005", title: "Trilhas de Auditoria", description: "Logs completos para verificacao", laymanDescription: "Registros de tudo que aconteceu no sistema" },
  ],
};

export async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function generateHMAC(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}
