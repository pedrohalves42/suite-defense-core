import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Code, Lock, Unlock, Server, Cpu, Shield, Activity } from "lucide-react";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  auth: "jwt" | "hmac" | "public";
  category: string;
  requestBody?: Record<string, string>;
  responseExample?: Record<string, unknown>;
}

const endpoints: Endpoint[] = [
  // Agent Endpoints
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
  // Metrics
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
  // Security Data
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
      last_update_at: "ISO8601"
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
  // Installer
  {
    method: "GET",
    path: "/functions/v1/serve-installer",
    description: "Retorna script de instalação do agente",
    auth: "public",
    category: "installer",
    responseExample: {
      script: "PowerShell/Bash script content"
    }
  },
  // Admin/User endpoints
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
  // Stripe
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
  public: <Unlock className="h-3 w-3" />
};

const authColors: Record<string, string> = {
  jwt: "bg-purple-500/20 text-purple-400",
  hmac: "bg-cyan-500/20 text-cyan-400",
  public: "bg-gray-500/20 text-gray-400"
};

const categoryIcons: Record<string, React.ReactNode> = {
  agent: <Cpu className="h-4 w-4" />,
  metrics: <Activity className="h-4 w-4" />,
  security: <Shield className="h-4 w-4" />,
  installer: <Server className="h-4 w-4" />,
  admin: <Lock className="h-4 w-4" />,
  billing: <Code className="h-4 w-4" />
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
            {authIcons.hmac} HMAC - Assinatura do agente
          </Badge>
          <Badge variant="outline" className={authColors.public}>
            {authIcons.public} Público - Sem autenticação
          </Badge>
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
