/**
 * Maps raw error messages to user-facing strings.
 *
 * Replaces a chained if/else if block with a declarative lookup table,
 * lowering cyclomatic complexity and following the Open/Closed Principle:
 * adding a new mapping no longer requires editing control flow.
 */
interface ErrorRule {
  matches: (msg: string) => boolean;
  message: string;
}

const ERROR_RULES: ErrorRule[] = [
  {
    matches: (m) =>
      m.includes("NO_TENANT") ||
      m.includes("não está associado") ||
      m.includes("User not associated"),
    message: "Você não está associado a nenhum tenant. Contate o administrador.",
  },
  {
    matches: (m) => m.includes("Edge Function") || m.includes("Failed to fetch"),
    message: "Erro ao conectar com o servidor. Tente novamente.",
  },
  {
    matches: (m) => m.includes("Não autenticado"),
    message: "Sessão expirada. Faça login novamente.",
  },
];

export function resolveErrorMessage(error: unknown): string {
  const raw = (error as Error)?.message || "Erro desconhecido";
  const matched = ERROR_RULES.find((rule) => rule.matches(raw));
  return matched ? matched.message : `Erro ao gerar relatório: ${raw}`;
}
