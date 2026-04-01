import type { Tutorial } from './types';

/** Tutoriais: integracoes */
export const tutorials_integracoes: Tutorial[] = [
  {
    id: "siem-integration",
    title: "Integração com SIEM (Splunk, QRadar, Elastic)",
    description: "Configure integração completa com seu SIEM: formatos de log, filtros de eventos, troubleshooting e otimização de performance.",
    category: "admin",
    difficulty: "expert",
    estimatedTime: "20 min",
    tags: ["SIEM", "Splunk", "QRadar", "Elastic", "syslog", "integração"],
    prerequisites: ["admin-panel"],
    videoId: "siem-integration",
    steps: [
      {
        title: "Arquitetura da integração",
        content: "O CyberShield envia eventos para o SIEM via: Syslog (TCP/UDP, porta configurável — padrão 514) ou API REST (HTTPS, autenticação via token). Eventos são enviados em near real-time (delay <30s). Suporta formatos: CEF (Common Event Format — padrão para SIEMs), LEEF (Log Event Extended Format — IBM QRadar) e JSON (Elastic/Splunk HEC).",
      },
      {
        title: "Configurar Syslog (Splunk/QRadar)",
        content: "Admin → Integrações → SIEM → 'Syslog'. Configure: IP do servidor Syslog (ex: siem.empresa.local), porta (514 para UDP, 6514 para TCP+TLS), protocolo (UDP para melhor performance, TCP+TLS para garantia de entrega com criptografia), formato (CEF para QRadar, CEF ou JSON para Splunk) e facility/severity mapping.",
        code: "# Configuração recomendada para Splunk:\nProtocolo: TCP+TLS (porta 6514)\nFormato: JSON\nFacility: LOCAL0\nFiltro: severity >= medium\n\n# Exemplo de evento JSON para Splunk:\n{\n  \"timestamp\": \"2026-03-13T14:32:00.000Z\",\n  \"source\": \"cybershield\",\n  \"sourcetype\": \"cybershield:security\",\n  \"event\": {\n    \"type\": \"malware_detected\",\n    \"severity\": \"critical\",\n    \"agent\": { \"hostname\": \"SRV-DB01\", \"ip\": \"10.0.2.10\" },\n    \"threat\": { \"name\": \"Ransom.WannaCry\", \"hash\": \"a1b2c3...\" },\n    \"action\": \"quarantined\"\n  }\n}\n\n# Configuração para QRadar:\nProtocolo: TCP (porta 514)\nFormato: LEEF\nLog Source Type: Universal LEEF\nFiltro: todos os eventos de segurança",
      },
      {
        title: "Configurar API REST (Elastic/Custom)",
        content: "Para Elastic Stack (ELK) ou SIEMs com HTTP input: Admin → Integrações → SIEM → 'API REST'. Configure: URL do endpoint (ex: https://elastic.empresa.local:9200/cybershield/_doc), método (POST), headers (Authorization: Bearer xxx) e batch size (eventos agrupados em lotes de 100 para otimizar performance).",
      },
      {
        title: "Filtrar eventos enviados ao SIEM",
        content: "Não envie TUDO para o SIEM — isso sobrecarrega armazenamento e dificulta análise. Recomendação: envie apenas eventos de severidade média+, excluindo: heartbeats de agente (alto volume, baixo valor), métricas de hardware periódicas e scans sem detecção (exceto scan completo — envie resultado 'limpo' para compliance).",
      },
      {
        title: "Testar e validar a integração",
        content: "Use o botão 'Enviar Evento de Teste' para validar: 1) Verifique no SIEM se o evento chegou. 2) Confirme parsing correto dos campos. 3) Valide que dashboards/alertas do SIEM reconhecem os eventos. 4) Execute um scan com EICAR para gerar detecção real e verificar o fluxo completo.",
      },
    ],
    troubleshooting: [
      {
        problem: "Eventos não chegam ao SIEM",
        cause: "Firewall bloqueando a porta, certificado TLS inválido ou credenciais de API incorretas.",
        solution: "1) Teste conectividade: telnet siem.empresa.local 514. 2) Para TLS: verifique se o certificado do SIEM é confiável ou adicione como exceção. 3) Use o botão 'Testar Conexão' no painel. 4) Verifique logs do SIEM para erros de parsing.",
      },
      {
        problem: "Eventos chegam mas não são parseados corretamente",
        cause: "Formato de log incompatível com o log source configurado no SIEM.",
        solution: "1) Verifique se o formato (CEF/LEEF/JSON) corresponde ao esperado pelo SIEM. 2) No QRadar: verifique o Log Source Type. 3) No Splunk: verifique o sourcetype. 4) Use o evento de teste para comparar formato enviado vs. esperado.",
      },
    ],
  },
  {
    id: "api-integration",
    title: "API REST do CyberShield — Referência Técnica",
    description: "Guia completo da API REST: autenticação, endpoints, rate limiting, webhooks e exemplos práticos de integração.",
    category: "admin",
    difficulty: "expert",
    estimatedTime: "25 min",
    tags: ["API", "REST", "webhooks", "integração", "automação", "desenvolvimento"],
    prerequisites: ["admin-panel"],
    videoId: "api-integration",
    steps: [
      {
        title: "Autenticação e API Keys",
        content: "A API usa autenticação via Bearer Token (JWT). Gere um API Key em Admin → Integrações → 'API Keys'. Cada key tem: nome descritivo, permissões (read, write, admin), IP whitelist opcional e data de expiração. Inclua o token no header: Authorization: Bearer <token>.",
        code: "# Exemplo de requisição autenticada:\ncurl -X GET https://api.cybershield.com.br/v1/agents \\\n  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiI...' \\\n  -H 'Content-Type: application/json'\n\n# Resposta (200 OK):\n{\n  \"data\": [\n    {\n      \"id\": \"agt_abc123\",\n      \"hostname\": \"DESKTOP-001\",\n      \"status\": \"online\",\n      \"os\": \"Windows 11 Pro 23H2\",\n      \"agent_version\": \"2.5.1\",\n      \"last_heartbeat\": \"2026-03-13T14:30:00Z\"\n    }\n  ],\n  \"meta\": { \"total\": 45, \"page\": 1, \"per_page\": 20 }\n}",
        warning: "API Keys são segredos sensíveis. Nunca exponha em código frontend, repositórios públicos ou logs. Use variáveis de ambiente (secrets) em código backend.",
      },
      {
        title: "Endpoints principais",
        content: "Endpoints disponíveis: GET /v1/agents (listar agentes), GET /v1/agents/:id (detalhes de um agente), POST /v1/jobs (criar job), GET /v1/jobs/:id (status do job), GET /v1/threats (listar ameaças), POST /v1/scans (iniciar scan), GET /v1/compliance/score (score de compliance), GET /v1/reports (listar relatórios) e POST /v1/reports/generate (gerar novo relatório).",
        code: "# Exemplos de uso da API:\n\n# Listar agentes offline:\nGET /v1/agents?status=offline&per_page=100\n\n# Criar job de scan rápido:\nPOST /v1/jobs\n{\n  \"type\": \"virus_scan\",\n  \"scan_type\": \"quick\",\n  \"target_agents\": [\"agt_abc123\", \"agt_def456\"],\n  \"on_detection\": \"quarantine\"\n}\n\n# Obter score de compliance:\nGET /v1/compliance/score\n# Resposta: { \"overall\": 87.5, \"by_policy\": {...} }\n\n# Gerar relatório PDF:\nPOST /v1/reports/generate\n{\n  \"type\": \"executive\",\n  \"format\": \"pdf\",\n  \"period\": \"30d\",\n  \"send_to\": [\"cto@empresa.com\"]\n}",
      },
      {
        title: "Webhooks — Notificações em tempo real",
        content: "Configure webhooks para receber eventos em seus sistemas: Admin → Integrações → Webhooks → 'Novo'. Defina: URL de destino (HTTPS obrigatório), secret para validação HMAC, eventos a receber (threat.detected, agent.offline, job.completed, etc.) e retry policy (3 tentativas com backoff exponencial).",
        code: "# Exemplo de webhook recebido (threat.detected):\nPOST https://seu-sistema.com/webhooks/cybershield\nHeaders:\n  X-CyberShield-Signature: sha256=abc123...\n  Content-Type: application/json\n\nBody:\n{\n  \"event\": \"threat.detected\",\n  \"timestamp\": \"2026-03-13T14:32:00Z\",\n  \"data\": {\n    \"threat_id\": \"thr_xyz789\",\n    \"agent\": \"DESKTOP-001\",\n    \"threat_name\": \"Trojan.GenericKD.12345\",\n    \"severity\": \"critical\",\n    \"file_path\": \"C:\\\\Users\\\\user\\\\Downloads\\\\update.exe\",\n    \"action_taken\": \"quarantined\"\n  }\n}\n\n# Validar assinatura HMAC (Python):\nimport hmac, hashlib\nexpected = hmac.new(webhook_secret.encode(), body.encode(), hashlib.sha256).hexdigest()\nassert request.headers['X-CyberShield-Signature'] == f'sha256={expected}'",
      },
      {
        title: "Rate Limiting e boas práticas",
        content: "Limites: Auth endpoints (10/min), Mutation endpoints (30/min), Read endpoints (100/min), Export endpoints (5/5min). Headers de resposta incluem: X-RateLimit-Remaining e X-RateLimit-Reset. Para alto volume: use pagination (per_page=100), cache respostas de read (TTL 60s) e agrupe mutations em batch quando possível.",
      },
    ],
  },
];
