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
  // Computadores/Agentes
  "computador": "Um dispositivo protegido pelo CyberShield que envia informações de segurança para o painel.",
  "computadores": "Dispositivos protegidos pelo sistema.",
  "sinal de vida": "Verificação periódica que confirma que o computador está online e funcionando corretamente.",
  "tempo online": "Período desde a última reinicialização do computador.",
  "versão do agente": "Versão do software de proteção instalado no computador.",
  "versão do software": "Versão do software de proteção instalado no computador.",
  "computador inativo": "Computador que não envia sinais de vida há mais de 24 horas.",
  "empresa": "Organização ou conta que agrupa computadores e usuários.",
  
  // Status e Comunicação
  "heartbeat": "Sinal de vida - verificação periódica que confirma que o computador está online.",
  "online": "Computador ativo e enviando dados normalmente.",
  "offline": "Computador desconectado ou desligado.",
  "inativo": "Computador que não se comunica há algum tempo.",
  "status": "Estado atual do computador: ativo, offline ou desativado.",
  
  // Segurança
  "cve": "Identificador único de vulnerabilidades de segurança conhecidas mundialmente.",
  "score de risco": "Pontuação de 0 a 100 que indica o nível de risco do computador.",
  "vulnerabilidade": "Falha de segurança que pode ser explorada por atacantes.",
  "ameaça": "Software malicioso ou atividade suspeita detectada.",
  "malware": "Software malicioso projetado para danificar ou acessar sistemas sem autorização.",
  "ransomware": "Tipo de malware que bloqueia arquivos e exige pagamento para liberá-los.",
  "phishing": "Tentativa de roubar informações através de sites ou emails falsos.",
  "severidade": "Nível de gravidade: Crítica (urgente), Alta (importante), Média (atenção) ou Baixa.",
  "antivírus atualizado": "Proteção com definições de vírus recentes (menos de 7 dias).",
  
  // Infraestrutura
  "endpoint": "Dispositivo final como computador, notebook ou servidor que precisa de proteção.",
  "agente": "Programa instalado no computador que coleta dados de segurança.",
  "agent": "Programa instalado no computador que coleta dados de segurança.",
  "tokens de acesso": "Chaves de autenticação usadas para verificar identidade de forma segura.",
  "chave de registro": "Código único usado para conectar um novo computador ao sistema.",
  "chave de instalação": "Código único necessário para cadastrar um novo computador no sistema.",
  "enrollment key": "Código único necessário para cadastrar um novo computador no sistema.",
  "api": "Interface que permite a comunicação entre diferentes sistemas.",
  "credenciais": "Informações de autenticação que permitem o agente se identificar.",
  
  // Métricas de Performance
  "cpu": "Processador - o cérebro do computador que executa programas.",
  "ram": "Memória de acesso rápido para programas em execução.",
  "memória": "RAM - armazenamento temporário para programas em execução.",
  "disco": "Espaço de armazenamento permanente para arquivos.",
  "uso de cpu": "Percentual do processador sendo utilizado no momento.",
  "uso de memória": "Percentual da memória RAM sendo utilizada.",
  "uso de disco": "Percentual do espaço de armazenamento ocupado.",
  "uptime": "Tempo online - período desde a última reinicialização.",
  "response time": "Tempo que o sistema leva para responder a uma solicitação.",
  "latency": "Tempo de resposta do sistema.",
  
  // Jobs e Tarefas
  "tarefa": "Ação programada executada pelo sistema de proteção.",
  "tarefas": "Ações programadas executadas pelo sistema de proteção.",
  "job": "Tarefa agendada - ação programada executada pelo sistema.",
  "jobs": "Tarefas agendadas - ações programadas executadas pelo sistema.",
  "fila": "Lista de tarefas aguardando execução.",
  "fila de tarefas": "Lista de comandos aguardando para serem executados.",
  "pendente": "Tarefa aguardando para ser executada.",
  "em execução": "Tarefa sendo processada no momento.",
  "concluído": "Tarefa finalizada com sucesso.",
  "falhou": "Tarefa que não foi concluída devido a um erro.",
  "taxa de sucesso": "Porcentagem de tarefas que foram concluídas sem erros.",
  "dlq": "Fila de tarefas que falharam e precisam de atenção manual.",
  
  // Atividade Web
  "atividade web": "Registro de sites e domínios acessados pelo computador.",
  "domínio": "Endereço principal de um site (ex: google.com).",
  "dns": "Sistema que traduz nomes de sites para endereços de rede.",
  "dns cache": "Histórico local de sites acessados recentemente.",
  "cache dns": "Histórico local de sites acessados recentemente.",
  
  // Relatórios
  "relatório": "Documento com análise detalhada da situação de segurança.",
  "laudo": "Documento oficial de análise de segurança com recomendações.",
  "diagnóstico": "Análise completa para identificar problemas de segurança.",
  "auditoria": "Verificação sistemática de conformidade e segurança.",
  "inventário de software": "Lista de todos os programas instalados nos computadores.",
  
  // Saúde do Sistema
  "saúde": "Estado geral de funcionamento do computador.",
  "alerta": "Aviso sobre situação que requer atenção.",
  "crítico": "Problema grave que requer ação imediata.",
  "aviso": "Situação que pode se tornar problemática.",
  "normal": "Funcionamento dentro dos parâmetros esperados.",
  "margem de falha": "Quanto do limite de problemas permitidos já foi usado.",
  "error budget": "Limite de problemas permitidos no período.",
  "meta de disponibilidade": "Porcentagem mínima de tempo que o sistema deve funcionar.",

  // Termos de Infraestrutura
  "tenant": "Empresa ou organização que utiliza o sistema.",
  "scan": "Verificação de segurança que analisa arquivos em busca de ameaças.",
  "scans": "Verificações de segurança.",
  "threat": "Ameaça de segurança detectada.",
  "threats": "Ameaças de segurança detectadas.",
  "hash": "Código único que identifica um arquivo de forma segura.",
  "hmac": "Método de verificação que garante a autenticidade das comunicações.",
  
  // Tipos de Ataque
  "sql injection": "Ataque que tenta acessar dados inserindo comandos maliciosos.",
  "xss": "Ataque que insere scripts maliciosos em páginas web.",
  "path traversal": "Tentativa de acessar arquivos restritos do sistema.",
  "rate limit": "Limite de requisições excedido - proteção contra abuso.",
  "força bruta": "Tentativa repetida de adivinhar senhas.",
  "brute force": "Tentativa repetida de adivinhar senhas ou credenciais.",
  
  // Métricas Financeiras SaaS
  "mrr": "Receita Mensal Recorrente - quanto a empresa ganha por mês com assinaturas.",
  "arr": "Receita Anual Recorrente - MRR multiplicado por 12 meses.",
  "arpa": "Receita Média Por Cliente - quanto cada cliente paga em média por mês.",
  "cac": "Custo de Aquisição de Cliente - quanto custa para conquistar um novo cliente.",
  "ltv": "Valor do Cliente ao Longo do Tempo - quanto um cliente gera de receita total.",
  "ltv/cac": "Razão LTV/CAC - indica quantas vezes o cliente paga o custo de aquisição. Meta: ≥3x.",
  "payback": "Tempo em meses para recuperar o investimento feito para adquirir um cliente.",
  "churn": "Taxa de Cancelamento - percentual de clientes que cancelam por mês.",
  "churn rate": "Taxa de Cancelamento - percentual de clientes que cancelam por mês.",
  "gross margin": "Margem Bruta - percentual da receita que sobra após custos diretos.",
  "margem bruta": "Percentual da receita que sobra após custos diretos de operação.",
  
  // Termos de Backend
  "edge function": "Função que processa dados de forma rápida e segura na nuvem.",
  "webhook": "Notificação automática enviada quando algo acontece no sistema.",
  "circuit breaker": "Proteção que desliga temporariamente um serviço com problemas.",
  "fallback": "Plano alternativo usado quando o sistema principal falha.",
  "rls": "Controle de acesso que protege dados sensíveis.",
  "policy": "Regra de segurança aplicada ao sistema.",
  
  // Novos termos de monitoramento
  "ip bloqueado": "Endereço de rede temporariamente impedido de acessar o sistema.",
  "tentativa falhada": "Acesso que não foi autorizado por credenciais incorretas.",
  "evento de segurança": "Ocorrência registrada relacionada à proteção do sistema.",
  "logs": "Registros detalhados de atividades do sistema.",
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
