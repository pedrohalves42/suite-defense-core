import type {
  ComplianceTemplate,
  ComplianceReportPayload,
} from "@/types/compliance-report";

export type { ComplianceTemplate, ComplianceReportPayload };

export const TEMPLATE_COLORS: Record<ComplianceTemplate, string> = {
  LGPD: "text-blue-600",
  ISO_27001: "text-green-600",
  SOC2_LITE: "text-purple-600",
};

export interface FriendlyInvariant {
  name: string;
  description: string;
}

export const FRIENDLY_INVARIANT_NAMES: Record<string, FriendlyInvariant> = {
  "INV-001": { name: "Proteção de Dados", description: "Seus dados só podem ser acessados por pessoas autorizadas" },
  "INV-002": { name: "Comunicação Segura", description: "Os computadores usam assinatura digital para comunicação" },
  "INV-003": { name: "Isolamento de Dados", description: "Os dados da sua empresa estão separados de outras empresas" },
  "INV-004": { name: "Proteção de Senhas", description: "Senhas e credenciais não aparecem em logs do sistema" },
  "INV-005": { name: "Proteção Automática", description: "O sistema bloqueia automaticamente em caso de problemas" },
  "INV-006": { name: "Filtro de Sites", description: "Sites perigosos ou inadequados estão sendo bloqueados" },
};

export const LAYMAN_DESCRIPTIONS: Record<string, string> = {
  "INV-001": "Seus dados estão protegidos e só podem ser acessados por pessoas autorizadas.",
  "INV-002": "Os computadores usam assinatura digital para garantir comunicação segura.",
  "INV-003": "Os dados da sua empresa estão separados dos dados de outras empresas.",
  "INV-004": "Senhas e credenciais não aparecem em relatórios ou logs do sistema.",
  "INV-005": "O sistema bloqueia automaticamente em caso de problemas de segurança.",
  "INV-006": "Sites perigosos ou inadequados estão sendo bloqueados.",
};
