
# Plano: Melhorar a Criação do EXE para Instalação do Agente

## Análise do Sistema Atual

### Arquitetura Atual
O processo de build do EXE é **assíncrono** e funciona assim:

```text
Frontend (AgentInstaller.tsx)
    │
    ├─► POST /build-agent-exe
    │       │
    │       ├─► Valida enrollment key
    │       ├─► Busca script do agente do Storage
    │       ├─► Gera instalador PS1 com credenciais embarcadas
    │       ├─► Codifica em Base64
    │       ├─► Triggera GitHub Actions via repository_dispatch
    │       └─► Retorna build_id (status: 202 Accepted)
    │
    ├─► Frontend faz polling em agent_builds
    │
    ├─► GitHub Actions executa ps2exe
    │       │
    │       └─► POST /build-callback com EXE base64
    │               │
    │               ├─► Upload do EXE para Storage
    │               └─► Atualiza build_status = 'completed'
    │
    └─► Frontend detecta build_status = 'completed'
            │
            └─► Download disponível
```

### Pontos Fortes Identificados
- Arquitetura assíncrona robusta
- Retry com exponential backoff no dispatch
- Build watchdog para detectar builds travados
- Validação SHA256 no frontend
- Telemetria detalhada
- Pipeline de validação (`validate-build-pipeline`)

### Problemas e Oportunidades de Melhoria

| Problema | Impacto | Solução Proposta |
|----------|---------|------------------|
| Dependência de GitHub Actions externo | Latência de 2-3 min, ponto único de falha | Build local via Deno + alternativas |
| Template PS1 embarcado na Edge Function (~600 linhas) | Difícil manutenção | Separar template para arquivo dedicado |
| Polling contínuo no frontend | UX ruim, requests desnecessários | Usar Realtime para notificar build completo |
| Sem cache de builds repetidos | Rebuild desnecessário para mesmo agente | Implementar cache de builds por hash |
| Falta de download resume | Downloads grandes podem falhar | Implementar download com chunking |
| Erro silencioso em ps2exe | Usuário não sabe causa da falha | Melhorar error reporting |
| Sem opção de instalação silenciosa corporativa | Empresas precisam de GPO/SCCM | Adicionar flags de instalação silenciosa |

---

## Melhorias Propostas

### 1. Build Cache Inteligente
Evitar rebuild quando os parâmetros são idênticos (mesmo tenant, mesma versão do script).

```sql
-- Adicionar coluna de cache key
ALTER TABLE agent_builds 
ADD COLUMN cache_key TEXT GENERATED ALWAYS AS (
  md5(tenant_id::text || agent_script_hash || version)
) STORED;

-- Índice para lookup rápido
CREATE INDEX idx_agent_builds_cache_key ON agent_builds(cache_key, build_status);
```

**Lógica na Edge Function:**
```typescript
// Verificar se existe build completo com mesmo cache_key
const { data: cachedBuild } = await supabase
  .from('agent_builds')
  .select('id, download_url, sha256_hash, file_size_bytes')
  .eq('cache_key', cacheKey)
  .eq('build_status', 'completed')
  .order('build_completed_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (cachedBuild && cachedBuild.download_url) {
  // Retornar build cacheado
  return new Response(JSON.stringify({
    success: true,
    build_id: cachedBuild.id,
    status: 'cached',
    download_url: cachedBuild.download_url,
    sha256_hash: cachedBuild.sha256_hash,
    cached: true
  }), { status: 200 });
}
```

### 2. Notificação Realtime em vez de Polling

**Habilitar Realtime na tabela agent_builds:**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE agent_builds;
```

**Frontend com Realtime:**
```typescript
useEffect(() => {
  if (!exeBuildId) return;
  
  const channel = supabase
    .channel(`build-${exeBuildId}`)
    .on('postgres_changes', 
      { event: 'UPDATE', schema: 'public', table: 'agent_builds', filter: `id=eq.${exeBuildId}` },
      (payload) => {
        const newStatus = payload.new.build_status;
        if (newStatus === 'completed') {
          setExeBuildStatus('completed');
          setExeDownloadUrl(payload.new.download_url);
          toast.success('EXE pronto para download!');
        } else if (newStatus === 'failed') {
          setExeBuildStatus('failed');
          toast.error(payload.new.error_message);
        }
      }
    )
    .subscribe();
    
  return () => { channel.unsubscribe(); };
}, [exeBuildId]);
```

### 3. Template PS1 Separado e Versionado

Mover o template de ~600 linhas embarcado na Edge Function para arquivo dedicado:

**Estrutura:**
```
supabase/functions/_shared/
├── installer-templates/
│   ├── windows-installer-v3.0.0.ps1.template
│   ├── windows-installer-v4.0.0.ps1.template  (nova versão)
│   └── installer-template-loader.ts
```

**Loader:**
```typescript
// installer-template-loader.ts
export const INSTALLER_TEMPLATES: Record<string, string> = {
  'v3.0.0': /* import from file */,
  'v4.0.0': /* nova versão */
};

export function getInstallerTemplate(version: string): string {
  return INSTALLER_TEMPLATES[version] ?? INSTALLER_TEMPLATES['v3.0.0'];
}
```

### 4. Instalação Silenciosa para Deploy Corporativo

Adicionar suporte a flags de instalação silenciosa para GPO/SCCM/Intune:

**Parâmetros adicionais no instalador:**
```powershell
param(
    [switch]$Silent,        # Instalação sem UI
    [switch]$NoRestart,     # Não reiniciar serviço após install
    [string]$LogPath,       # Path customizado para logs
    [switch]$Force          # Sobrescrever instalação existente
)

if ($Silent) {
    $ErrorActionPreference = "SilentlyContinue"
    # Redirecionar output para log apenas
}
```

**Exemplo de uso via GPO:**
```powershell
CyberShield-Agent-Installer.exe /Silent /NoRestart /LogPath "\\server\logs"
```

### 5. Download com Verificação e Resume

Implementar download robusto com verificação de integridade:

```typescript
// Função de download com retry e verificação
const downloadWithVerification = async (url: string, expectedSha256: string) => {
  const MAX_RETRIES = 3;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const blob = await response.blob();
      
      // Verificar SHA256
      const isValid = await validateInstallerIntegrity(blob, expectedSha256);
      if (!isValid) {
        if (attempt < MAX_RETRIES) {
          toast.warn(`Verificação falhou, tentando novamente (${attempt}/${MAX_RETRIES})`);
          continue;
        }
        throw new Error('Verificação SHA256 falhou após todas as tentativas');
      }
      
      return blob;
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
};
```

### 6. Fallback para Build Local (Opcional - Complexo)

Para eliminar dependência do GitHub Actions, seria possível usar Deno para compilar:

```typescript
// Alternativa: Build local usando Deno + ps2exe via WASM
// NOTA: Isso é experimental e requer ps2exe compilado para WASM

// A abordagem mais prática seria manter múltiplos runners:
// 1. GitHub Actions (primário)
// 2. Self-hosted runner como backup
// 3. Pre-built installers para versões estáveis
```

### 7. Pre-built Installers por Versão

Manter EXEs pré-compilados para versões estáveis:

```sql
-- Tabela de instaladores pré-compilados
CREATE TABLE prebuilt_installers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'windows',
  download_url TEXT NOT NULL,
  sha256_hash TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Quando usuário solicita, apenas personalizar o instalador pré-compilado
-- em vez de compilar do zero
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/build-agent-exe/index.ts` | Adicionar cache lookup, separar template |
| `supabase/functions/_shared/installer-template-loader.ts` | NOVO: Loader de templates versionados |
| `src/pages/AgentInstaller.tsx` | Substituir polling por Realtime |
| SQL Migration | Adicionar `cache_key` + Realtime + RLS |

---

## Priorização Recomendada

| Fase | Melhoria | Esforço | Impacto |
|------|----------|---------|---------|
| 1 | Realtime em vez de polling | Médio | Alto (UX) |
| 2 | Build cache inteligente | Médio | Alto (Performance) |
| 3 | Template separado e versionado | Baixo | Médio (Manutenção) |
| 4 | Download com verificação | Baixo | Médio (Confiabilidade) |
| 5 | Instalação silenciosa | Médio | Alto (Enterprise) |
| 6 | Pre-built installers | Alto | Alto (Performance) |

---

## Seção Técnica

### Arquitetura Proposta

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         BUILD PIPELINE v2.0                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Frontend                   Edge Function                                │
│  ┌──────────┐              ┌──────────────┐                             │
│  │ Request  │─────────────►│ Check Cache  │                             │
│  │ Build    │              └──────┬───────┘                             │
│  └──────────┘                     │                                     │
│       │                    ┌──────┴───────┐                             │
│       │             HIT    │ Cache Key    │   MISS                      │
│       │            ◄───────┤ Lookup       ├───────►                     │
│       │                    └──────────────┘         │                   │
│       │                           │                 │                   │
│       │                    ┌──────┴───────┐  ┌──────┴───────┐           │
│       │                    │ Return       │  │ GitHub       │           │
│       │                    │ Cached EXE   │  │ Actions      │           │
│       │                    └──────────────┘  └──────┬───────┘           │
│       │                                             │                   │
│       │                                      ┌──────┴───────┐           │
│  ┌────┴─────┐                                │ Callback     │           │
│  │ Realtime │◄───────────────────────────────┤ Update DB    │           │
│  │ Subscribe│                                └──────────────┘           │
│  └────┬─────┘                                                           │
│       │                                                                 │
│  ┌────┴─────┐                                                           │
│  │ Download │                                                           │
│  │ + SHA256 │                                                           │
│  └──────────┘                                                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Métricas Esperadas

| Métrica | Atual | Com Melhorias |
|---------|-------|---------------|
| Tempo médio de build (novo) | 2-3 min | 2-3 min |
| Tempo médio de build (cache hit) | 2-3 min | **~5 seg** |
| Requests de polling | ~20-40 | **0** (Realtime) |
| Taxa de falha por timeout | ~5% | **<1%** |
| Downloads corrompidos | Ocasional | **0** (SHA256 + retry) |

