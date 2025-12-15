import * as React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

interface TechTooltipProps {
  term: string;
  children?: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

// Dicionário de termos técnicos com explicações amigáveis
const techTerms: Record<string, string> = {
  // Status e Comunicação
  "heartbeat": "O computador envia sinais periódicos para confirmar que está funcionando. Se não recebemos sinal por mais de 5 minutos, consideramos offline.",
  "sinal de vida": "O computador envia sinais periódicos para confirmar que está funcionando. Se não recebemos sinal por mais de 5 minutos, consideramos offline.",
  "status": "Estado atual do computador: ativo (funcionando normalmente), offline (sem comunicação) ou desativado (pausado manualmente).",
  "online": "O computador está conectado e enviando dados normalmente.",
  "offline": "O computador não está enviando dados. Pode estar desligado, sem internet ou com problema no agente.",
  
  // Segurança
  "vulnerabilidade": "Falha de segurança conhecida que pode ser explorada por atacantes para invadir o sistema.",
  "cve": "Identificador único de vulnerabilidades públicas no banco de dados mundial (Common Vulnerabilities and Exposures).",
  "score de risco": "Pontuação de 0 a 100 que indica o nível de segurança do ambiente. 100 significa mais seguro, 0 significa risco crítico.",
  "severidade": "Nível de gravidade de uma vulnerabilidade: Crítica (urgente), Alta (importante), Média (atenção) ou Baixa (informativo).",
  "ameaça": "Software malicioso ou atividade suspeita detectada pelo antivírus ou sistema de monitoramento.",
  "antivírus atualizado": "Proteção com definições de vírus recentes (menos de 7 dias). Definições antigas podem não detectar novas ameaças.",
  
  // Infraestrutura
  "endpoint": "Computador ou dispositivo protegido pelo CyberShield.",
  "agente": "Programa instalado no computador que coleta dados de segurança e envia para o painel.",
  "agent": "Programa instalado no computador que coleta dados de segurança e envia para o painel.",
  "tokens de acesso": "Chaves de autenticação que permitem o agente se comunicar de forma segura com o sistema.",
  "credenciais": "Informações de autenticação (tokens) que permitem o agente se identificar no sistema.",
  "chave de instalação": "Código único necessário para cadastrar um novo computador no sistema.",
  "enrollment key": "Código único necessário para cadastrar um novo computador no sistema.",
  
  // Métricas de Performance
  "cpu": "Processador do computador. Uso alto (acima de 90%) pode indicar problema ou programa consumindo muitos recursos.",
  "ram": "Memória do computador. Uso alto (acima de 85%) pode causar lentidão.",
  "disco": "Armazenamento do computador. Pouco espaço livre (menos de 10%) pode causar problemas.",
  "uptime": "Tempo desde a última reinicialização do computador.",
  "tempo online": "Porcentagem de tempo que seus computadores ficaram conectados e funcionando.",
  "response time": "Tempo que o sistema leva para responder a uma solicitação. Quanto menor, mais rápido.",
  "performance metrics": "Medições de velocidade e eficiência do sistema. Ajudam a identificar lentidão ou problemas.",
  "latency": "Tempo que o sistema leva para responder a uma solicitação.",
  
  // Jobs e Tarefas
  "tarefa": "Comando enviado para o computador executar, como coletar dados ou verificar vulnerabilidades.",
  "job": "Comando enviado para o computador executar, como coletar dados ou verificar vulnerabilidades.",
  "fila de tarefas": "Lista de comandos aguardando para serem executados nos computadores.",
  "taxa de sucesso": "Porcentagem de tarefas que foram concluídas sem erros.",
  "dlq": "Fila de tarefas que falharam após várias tentativas e precisam de atenção manual.",
  "dead letter queue": "Fila de tarefas que falharam após várias tentativas e precisam de atenção manual.",
  
  // Atividade Web
  "atividade web": "Histórico de sites acessados pelo computador, coletado do cache DNS e navegadores.",
  "dns cache": "Lista de sites recentemente acessados armazenada pelo sistema operacional.",
  "domínio": "Endereço de um site na internet (exemplo: google.com).",
  
  // Relatórios
  "laudo": "Documento oficial de análise de segurança com recomendações e certificado de verificação.",
  "inventário de software": "Lista de todos os programas instalados nos computadores monitorados.",
  
  // Saúde do Sistema (SLO humanizado)
  "margem de falha": "Quanto do limite de problemas permitidos já foi usado este mês. Acima de 80% indica que o sistema está próximo do limite aceitável.",
  "error budget": "Quanto do limite de problemas permitidos já foi usado este mês. Acima de 80% indica que o sistema está próximo do limite aceitável.",
  "meta de disponibilidade": "Porcentagem mínima de tempo que o sistema deve funcionar corretamente. Ex: 99.9% significa no máximo 43 minutos de problema por mês.",
  
  // Termos de backend
  "edge function": "Código que roda no servidor para processar dados de forma segura.",
  "api": "Conexão que permite que diferentes sistemas conversem entre si.",
  "webhook": "Notificação automática enviada quando algo acontece no sistema.",
  
  // IA
  "circuit breaker": "Proteção que desliga temporariamente um serviço com problemas para evitar cascata de falhas.",
  "fallback": "Plano alternativo usado quando o sistema principal falha.",
};

export function TechTooltip({ term, children, side = "top" }: TechTooltipProps) {
  const explanation = techTerms[term.toLowerCase()];
  
  if (!explanation) {
    return <>{children || term}</>;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help border-b border-dashed border-muted-foreground/50">
            {children || term}
            <HelpCircle className="h-3 w-3 text-muted-foreground" />
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          <p className="text-sm">{explanation}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Componente para apenas o ícone de ajuda
export function HelpTooltip({ term, side = "top" }: { term: string; side?: "top" | "right" | "bottom" | "left" }) {
  const explanation = techTerms[term.toLowerCase()];
  
  if (!explanation) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help inline-block ml-1" />
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          <p className="text-sm">{explanation}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
