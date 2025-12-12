import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Code, Lock, Unlock, Server, Cpu, Shield, Activity, Brain, Eye, Key, CreditCard, AlertTriangle, Globe, FileText, Zap, BarChart } from "lucide-react";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  auth: "jwt" | "hmac" | "public" | "service";
  category: string;
  requestBody?: Record<string, string>;
  responseExample?: Record<string, unknown>;
  headers?: Record<string, string>;
}

const endpoints: Endpoint[] = [
  // ============ AGENT ENDPOINTS ============
  {
    method: "POST",
    path: "/functions/v1/enroll-agent",
    description: "Registra novo agente usando enrollment key",
    auth: "public",
    category: "agent",
    requestBody: {
      enrollment_key: "string (required)",
      agent_name: "string (required)",
      hostname: "string",
      os_type: "string",
      os_version: "string"
    },
    responseExample: {
      success: true,
      agent_id: "uuid",
      token: "string",
      hmac_secret: "string (64 hex chars)"
    }
  },
  {
    method: "POST",
    path: "/functions/v1/heartbeat",
    description: "Envia heartbeat do agente e atualiza status",
    auth: "hmac",
    category: "agent",
    headers: {
      "X-Agent-Token": "Token do agente",
      "X-Timestamp": "Unix timestamp",
      "X-Signature": "HMAC-SHA256(token:timestamp:body)"
    },
    requestBody: {
      agent_name: "string (required)",
      agent_version: "string",
      hostname: "string",
      os_type: "string"
    },
    responseExample: {
      success: true,
      server_time: "ISO8601"
    }
  },
  {
    method: "GET",
    path: "/functions/v1/poll-jobs",
    description: "Busca jobs pendentes para o agente",
    auth: "hmac",
    category: "agent",
    headers: {
      "X-Agent-Token": "Token do agente",
      "X-Timestamp": "Unix timestamp",
      "X-Signature": "HMAC-SHA256(token:timestamp)"
    },
    responseExample: {
      jobs: [
        {
          id: "uuid",
          job_type: "software_inventory_collect",
          payload: {},
          agent_id: "uuid"
        }
      ]
    }
  },
  {
    method: "POST",
    path: "/functions/v1/submit-job-result",
    description: "Envia resultado de job executado",
    auth: "hmac",
    category: "agent",
    requestBody: {
      job_id: "uuid (required)",
      status: "completed | failed",
      result: "object",
      error_message: "string (optional)"
    }
  },
  {
    method: "GET",
    path: "/functions/v1/check-agent-updates",
    description: "Verifica se há atualização disponível para o agente",
    auth: "hmac",
    category: "agent",
    responseExample: {
      update_available: true,
      version: "3.10.35",
      download_url: "string",
      sha256: "string"
    }
  },
  {
    method: "GET",
    path: "/functions/v1/serve-agent-update",
    description: "Serve o script atualizado do agente",
    auth: "hmac",
    category: "agent",
    responseExample: {
      script: "PowerShell/Bash script content",
      version: "3.10.35",
      sha256: "string"
    }
  },

  // ============ METRICS ENDPOINTS ============
  {
    method: "POST",
    path: "/functions/v1/submit-system-metrics",
    description: "Envia métricas de sistema (CPU, RAM, disco)",
    auth: "hmac",
    category: "metrics",
    requestBody: {
      cpu_usage_percent: "number",
      memory_usage_percent: "number",
      disk_usage_percent: "number",
      uptime_seconds: "number"
    }
  },
  {
    method: "POST",
    path: "/functions/v1/submit-network-info",
    description: "Envia informações de rede do agente",
    auth: "hmac",
    category: "metrics",
    requestBody: {
      public_ip: "string",
      gateway_ip: "string",
      dns_servers: "array of strings",
      network_adapters: "array of adapter objects"
    }
  },

  // ============ SECURITY DATA ENDPOINTS ============
  {
    method: "POST",
    path: "/functions/v1/submit-software-inventory",
    description: "Envia inventário de software instalado",
    auth: "hmac",
    category: "security",
    requestBody: {
      items: "array of { name, version, publisher, install_date }"
    }
  },
  {
    method: "POST",
    path: "/functions/v1/submit-vuln-findings",
    description: "Envia resultados de scan de vulnerabilidades",
    auth: "hmac",
    category: "security",
    requestBody: {
      findings: "array of { cve_id, severity, package, description }"
    }
  },
  {
    method: "POST",
    path: "/functions/v1/submit-antivirus-status",
    description: "Envia status do antivírus",
    auth: "hmac",
    category: "security",
    requestBody: {
      engine_name: "string",
      status: "string",
      last_scan_at: "ISO8601",
      last_update_at: "ISO8601",
      threats_found: "number"
    }
  },
  {
    method: "POST",
    path: "/functions/v1/submit-web-activity",
    description: "Envia atividade web coletada",
    auth: "hmac",
    category: "security",
    requestBody: {
      entries: "array of { domain, visited_at, browser, visit_count }"
    }
  },
  {
    method: "POST",
    path: "/functions/v1/scan-vulnerabilities",
    description: "Executa scan de vulnerabilidades baseado em CVE",
    auth: "jwt",
    category: "security",
    requestBody: {
      agent_id: "uuid (required)",
      software_items: "array of { name, version }"
    }
  },
  {
    method: "GET",
    path: "/functions/v1/threat-intelligence-lookup",
    description: "Consulta reputação de domínio/IP via threat intelligence",
    auth: "jwt",
    category: "security",
    requestBody: {
      target: "string (domain or IP)",
      target_type: "url | ip | domain"
    },
    responseExample: {
      reputation_score: 85,
      sources: ["VirusTotal", "AbuseIPDB"],
      is_malicious: false
    }
  },

  // ============ AI ENDPOINTS ============
  {
    method: "POST",
    path: "/functions/v1/ai-system-analyzer",
    description: "Análise inteligente do estado do sistema usando IA",
    auth: "jwt",
    category: "ai",
    requestBody: {
      tenant_id: "uuid",
      analysis_type: "full | security | performance"
    },
    responseExample: {
      insights: [],
      recommendations: [],
      risk_score: 75
    }
  },
  {
    method: "POST",
    path: "/functions/v1/ai-analyze-agent",
    description: "Análise IA de agente específico",
    auth: "jwt",
    category: "ai",
    requestBody: {
      agent_id: "uuid (required)"
    },
    responseExample: {
      health_assessment: "string",
      anomalies: [],
      suggested_actions: []
    }
  },
  {
    method: "POST",
    path: "/functions/v1/ai-execute-solution",
    description: "Executa solução sugerida pela IA",
    auth: "jwt",
    category: "ai",
    requestBody: {
      action_id: "uuid (required)",
      confirmation: "boolean"
    }
  },
  {
    method: "POST",
    path: "/functions/v1/analyze-network-anomalies",
    description: "Detecta anomalias de rede usando IA",
    auth: "jwt",
    category: "ai",
    requestBody: {
      agent_id: "uuid",
      time_range_hours: "number (default: 24)"
    }
  },
  {
    method: "GET",
    path: "/functions/v1/ai-quality-check",
    description: "Verifica qualidade das inferências de IA",
    auth: "jwt",
    category: "ai",
    responseExample: {
      prompt_inventory: [],
      quality_metrics: {},
      drift_analysis: {}
    }
  },

  // ============ MONITORING ENDPOINTS ============
  {
    method: "GET",
    path: "/functions/v1/monitor-agent-health",
    description: "Monitora saúde de todos os agentes do tenant",
    auth: "jwt",
    category: "monitoring",
    responseExample: {
      healthy_count: 10,
      warning_count: 2,
      critical_count: 1,
      agents: []
    }
  },
  {
    method: "GET",
    path: "/functions/v1/check-installation-health",
    description: "Verifica taxa de sucesso de instalações",
    auth: "jwt",
    category: "monitoring",
    responseExample: {
      status: "healthy",
      failure_rate_pct: 5.2,
      total_attempts: 100
    }
  },
  {
    method: "GET",
    path: "/functions/v1/get-installation-pipeline-metrics",
    description: "Métricas do pipeline de instalação",
    auth: "jwt",
    category: "monitoring",
    responseExample: {
      total_generated: 50,
      total_installed: 45,
      conversion_rate: 90
    }
  },
  {
    method: "POST",
    path: "/functions/v1/validate-agent-health",
    description: "Validação detalhada de saúde de agente específico",
    auth: "jwt",
    category: "monitoring",
    requestBody: {
      agent_name: "string (required)"
    }
  },
  {
    method: "GET",
    path: "/functions/v1/get-agent-timeline",
    description: "Timeline de eventos do agente",
    auth: "jwt",
    category: "monitoring",
    requestBody: {
      agent_id: "uuid (required)",
      limit: "number (default: 50)"
    }
  },

  // ============ ENROLLMENT ENDPOINTS ============
  {
    method: "POST",
    path: "/functions/v1/create-enrollment-key",
    description: "Cria nova enrollment key para instalação de agentes",
    auth: "jwt",
    category: "enrollment",
    requestBody: {
      name: "string",
      expires_in_hours: "number (default: 24)",
      max_uses: "number (default: 1)"
    },
    responseExample: {
      id: "uuid",
      key: "string (shown only once)",
      expires_at: "ISO8601"
    }
  },
  {
    method: "GET",
    path: "/functions/v1/serve-installer",
    description: "Retorna script de instalação do agente",
    auth: "public",
    category: "enrollment",
    responseExample: {
      script: "PowerShell/Bash script content"
    }
  },
  {
    method: "POST",
    path: "/functions/v1/track-installation-event",
    description: "Rastreia eventos do pipeline de instalação",
    auth: "public",
    category: "enrollment",
    requestBody: {
      event_type: "generated | downloaded | command_copied | installed",
      enrollment_key_id: "uuid",
      platform: "windows | linux | macos"
    }
  },

  // ============ ADMIN ENDPOINTS ============
  {
    method: "POST",
    path: "/functions/v1/create-job",
    description: "Cria novo job para agente",
    auth: "jwt",
    category: "admin",
    requestBody: {
      agent_name: "string (required)",
      job_type: "string (required)",
      payload: "object"
    }
  },
  {
    method: "POST",
    path: "/functions/v1/send-invite",
    description: "Envia convite para novo usuário",
    auth: "jwt",
    category: "admin",
    requestBody: {
      email: "string (required)",
      role: "viewer | operator | admin"
    }
  },
  {
    method: "POST",
    path: "/functions/v1/remove-member",
    description: "Remove membro do tenant com validação de segurança",
    auth: "jwt",
    category: "admin",
    requestBody: {
      user_id: "uuid (required)"
    }
  },
  {
    method: "GET",
    path: "/functions/v1/diagnose-agent",
    description: "Diagnóstico detalhado de problemas do agente",
    auth: "jwt",
    category: "admin",
    requestBody: {
      agent_name: "string (required)"
    },
    responseExample: {
      issues: [
        {
          issue_type: "stale_heartbeat",
          severity: "high",
          description: "Último heartbeat há mais de 5 minutos"
        }
      ]
    }
  },
  {
    method: "POST",
    path: "/functions/v1/create-custom-trial",
    description: "Cria trial customizado para clientes especiais",
    auth: "jwt",
    category: "admin",
    requestBody: {
      tenant_id: "uuid (required)",
      trial_days: "number (required)",
      notes: "string"
    }
  },

  // ============ BILLING ENDPOINTS ============
  {
    method: "POST",
    path: "/functions/v1/create-checkout",
    description: "Cria sessão de checkout Stripe",
    auth: "jwt",
    category: "billing",
    requestBody: {
      price_id: "string (required)",
      success_url: "string",
      cancel_url: "string"
    }
  },
  {
    method: "POST",
    path: "/functions/v1/stripe-webhook",
    description: "Webhook para eventos Stripe",
    auth: "public",
    category: "billing"
  },
  {
    method: "POST",
    path: "/functions/v1/customer-portal",
    description: "Gera link para portal de gerenciamento Stripe",
    auth: "jwt",
    category: "billing",
    responseExample: {
      url: "https://billing.stripe.com/session/..."
    }
  },
  {
    method: "GET",
    path: "/functions/v1/check-subscription",
    description: "Verifica status da assinatura do tenant",
    auth: "jwt",
    category: "billing",
    responseExample: {
      status: "active",
      plan: "pro",
      trial_end: "ISO8601",
      current_period_end: "ISO8601"
    }
  },
  {
    method: "POST",
    path: "/functions/v1/sync-stripe-subscriptions",
    description: "Sincroniza assinaturas do Stripe com banco local",
    auth: "service",
    category: "billing"
  },

  // ============ CVE DATABASE ============
  {
    method: "POST",
    path: "/functions/v1/fetch-nvd-cves",
    description: "Busca CVEs do NVD e atualiza cache local",
    auth: "service",
    category: "security",
    responseExample: {
      success: true,
      cves_updated: 150,
      sync_time: "ISO8601"
    }
  }
];

const methodColors: Record<string, string> = {
  GET: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30"
};

const authIcons: Record<string, React.ReactNode> = {
  jwt: <Lock className="h-3 w-3" />,
  hmac: <Shield className="h-3 w-3" />,
  public: <Unlock className="h-3 w-3" />,
  service: <Key className="h-3 w-3" />
};

const authColors: Record<string, string> = {
  jwt: "bg-purple-500/20 text-purple-400",
  hmac: "bg-cyan-500/20 text-cyan-400",
  public: "bg-gray-500/20 text-gray-400",
  service: "bg-orange-500/20 text-orange-400"
};

const categoryIcons: Record<string, React.ReactNode> = {
  agent: <Cpu className="h-4 w-4" />,
  metrics: <BarChart className="h-4 w-4" />,
  security: <Shield className="h-4 w-4" />,
  ai: <Brain className="h-4 w-4" />,
  monitoring: <Eye className="h-4 w-4" />,
  enrollment: <Key className="h-4 w-4" />,
  admin: <Lock className="h-4 w-4" />,
  billing: <CreditCard className="h-4 w-4" />
};

export default function ApiDocumentation() {
  const categories = [...new Set(endpoints.map(e => e.category))];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Code className="h-6 w-6" />
          Documentação da API
        </h1>
        <p className="text-muted-foreground">
          Referência completa das Edge Functions do CyberShield
        </p>
      </div>

      {/* Auth Legend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Tipos de Autenticação</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4 flex-wrap">
          <Badge variant="outline" className={authColors.jwt}>
            {authIcons.jwt} JWT - Token de usuário autenticado
          </Badge>
          <Badge variant="outline" className={authColors.hmac}>
            {authIcons.hmac} HMAC - Assinatura do agente (X-Agent-Token + X-Timestamp + X-Signature)
          </Badge>
          <Badge variant="outline" className={authColors.public}>
            {authIcons.public} Público - Sem autenticação
          </Badge>
          <Badge variant="outline" className={authColors.service}>
            {authIcons.service} Service - SERVICE_ROLE_KEY (interno)
          </Badge>
        </CardContent>
      </Card>

      {/* HMAC Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Autenticação HMAC (Agentes)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Endpoints de agente usam HMAC-SHA256 para autenticação. Headers necessários:
          </p>
          <pre className="text-xs bg-muted p-3 rounded font-mono">
{`X-Agent-Token: <token recebido no enroll>
X-Timestamp: <unix timestamp em segundos>
X-Signature: HMAC-SHA256(token:timestamp:body, hmac_secret)`}
          </pre>
          <p className="text-xs text-muted-foreground">
            O hmac_secret é retornado durante o enrollment e deve ser armazenado de forma segura.
            Assinaturas são válidas por 5 minutos e não podem ser reutilizadas (proteção contra replay).
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue={categories[0]} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          {categories.map(cat => (
            <TabsTrigger key={cat} value={cat} className="flex items-center gap-1 capitalize">
              {categoryIcons[cat]}
              {cat}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map(category => (
          <TabsContent key={category} value={category} className="space-y-4">
            {endpoints
              .filter(e => e.category === category)
              .map((endpoint, idx) => (
                <Card key={idx}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge 
                        variant="outline" 
                        className={`font-mono ${methodColors[endpoint.method]}`}
                      >
                        {endpoint.method}
                      </Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {endpoint.path}
                      </code>
                      <Badge variant="outline" className={authColors[endpoint.auth]}>
                        {authIcons[endpoint.auth]}
                        <span className="ml-1 uppercase text-xs">{endpoint.auth}</span>
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {endpoint.description}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {endpoint.headers && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Headers Requeridos</h4>
                        <ScrollArea className="h-auto max-h-40">
                          <pre className="text-xs bg-muted p-3 rounded font-mono overflow-x-auto">
                            {JSON.stringify(endpoint.headers, null, 2)}
                          </pre>
                        </ScrollArea>
                      </div>
                    )}
                    {endpoint.requestBody && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Request Body</h4>
                        <ScrollArea className="h-auto max-h-40">
                          <pre className="text-xs bg-muted p-3 rounded font-mono overflow-x-auto">
                            {JSON.stringify(endpoint.requestBody, null, 2)}
                          </pre>
                        </ScrollArea>
                      </div>
                    )}
                    {endpoint.responseExample && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Response Example</h4>
                        <ScrollArea className="h-auto max-h-40">
                          <pre className="text-xs bg-muted p-3 rounded font-mono overflow-x-auto">
                            {JSON.stringify(endpoint.responseExample, null, 2)}
                          </pre>
                        </ScrollArea>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
