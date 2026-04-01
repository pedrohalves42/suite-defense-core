import { Globe, Monitor, Shield, AlertTriangle } from 'lucide-react';

export const typeLabels: Record<string, { label: string; description: string; icon: typeof Globe }> = {
  agent: { label: "Computadores", description: "Máquinas da sua rede monitoradas", icon: Monitor },
  domain: { label: "Sites Externos", description: "Endereços de sites acessados ou detectados", icon: Globe },
  ip: { label: "Endereços IP", description: "IPs de servidores acessados", icon: Globe },
  process: { label: "Programas", description: "Softwares detectados nas máquinas", icon: Shield },
  hash: { label: "Arquivos Analisados", description: "Impressões digitais de arquivos verificados", icon: Shield },
  user: { label: "Usuários", description: "Contas de usuários detectadas", icon: Monitor },
  file: { label: "Arquivos", description: "Arquivos monitorados", icon: Shield },
  cve: { label: "Vulnerabilidades", description: "Falhas de segurança conhecidas", icon: AlertTriangle },
};

export const sourceExplanations: Record<string, { name: string; reason: string }> = {
  abuse_ch_urlhaus: {
    name: "URLhaus (Abuse.ch)",
    reason: "Este endereço foi reportado como distribuidor de malware (vírus) por pesquisadores de segurança do mundo todo.",
  },
  abuse_ch_feodotracker: {
    name: "Feodo Tracker (Abuse.ch)",
    reason: "Este IP é usado por criminosos para controlar computadores infectados (servidor de comando e controle).",
  },
  abuse_ch_malwarebazaar: {
    name: "MalwareBazaar (Abuse.ch)",
    reason: "Este arquivo foi identificado como malware (software malicioso) por múltiplos laboratórios de segurança.",
  },
  alienvault_otx: {
    name: "AlienVault OTX",
    reason: "Identificado como ameaça pela comunidade global de inteligência de ameaças AlienVault.",
  },
  virustotal: {
    name: "VirusTotal",
    reason: "Detectado como malicioso por múltiplos antivírus no VirusTotal.",
  },
  cybershield_network: {
    name: "Rede CyberShield",
    reason: "Detectado pela análise de comportamento da rede CyberShield.",
  },
  internal: {
    name: "Detecção Interna",
    reason: "Identificado pela análise comportamental do agente instalado na máquina.",
  },
  edr_detection: {
    name: "Detecção EDR",
    reason: "O sistema de proteção detectou comportamento suspeito neste item.",
  },
  network_telemetry: {
    name: "Análise de Rede",
    reason: "Detectado pela análise do tráfego de rede dos computadores monitorados.",
  },
};

export function getRiskInfo(score: number) {
  if (score >= 80) return {
    level: "danger" as const,
    label: "Perigoso",
    emoji: "🔴",
    description: "Pode representar uma ameaça à segurança",
    badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
    barClass: "bg-destructive",
    textClass: "text-destructive",
  };
  if (score >= 60) return {
    level: "warning" as const,
    label: "Atenção",
    emoji: "🟠",
    description: "Requer análise — pode ser suspeito",
    badgeClass: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    barClass: "bg-orange-400",
    textClass: "text-orange-400",
  };
  if (score >= 40) return {
    level: "caution" as const,
    label: "Moderado",
    emoji: "🟡",
    description: "Risco baixo, mas vale monitorar",
    badgeClass: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    barClass: "bg-yellow-400",
    textClass: "text-yellow-400",
  };
  return {
    level: "safe" as const,
    label: "Seguro",
    emoji: "🟢",
    description: "Sem risco identificado",
    badgeClass: "bg-green-500/15 text-green-400 border-green-500/30",
    barClass: "bg-green-400",
    textClass: "text-green-400",
  };
}

export const riskGroupConfig = [
  {
    key: "danger",
    title: "🔴 Itens Perigosos",
    subtitle: "Podem representar ameaças — verifique com atenção",
    headerClass: "bg-destructive/10 border-destructive/20",
    countClass: "text-destructive",
  },
  {
    key: "warning",
    title: "🟠 Itens que Precisam de Atenção",
    subtitle: "Podem ser suspeitos — recomendamos análise",
    headerClass: "bg-orange-500/10 border-orange-500/20",
    countClass: "text-orange-400",
  },
  {
    key: "caution",
    title: "🟡 Itens Moderados",
    subtitle: "Risco baixo, monitorados automaticamente",
    headerClass: "bg-yellow-500/10 border-yellow-500/20",
    countClass: "text-yellow-400",
  },
  {
    key: "safe",
    title: "🟢 Itens Seguros",
    subtitle: "Sem risco detectado",
    headerClass: "bg-green-500/10 border-green-500/20",
    countClass: "text-green-400",
  },
];
