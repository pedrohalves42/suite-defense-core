
-- ETAPA 5: Comentários em colunas usando abordagem segura (DO block)
-- Apenas comenta colunas que realmente existem

DO $$
DECLARE
  comments RECORD;
BEGIN
  -- Array de (tabela, coluna, comentário)
  FOR comments IN 
    SELECT * FROM (VALUES
      -- profiles
      ('profiles','id','Identificador único do perfil. UUID.'),
      ('profiles','user_id','FK para auth.users. Identifica o usuário.'),
      ('profiles','full_name','Nome completo do usuário.'),
      ('profiles','username','Nome de usuário único.'),
      ('profiles','created_at','Data/hora de criação.'),
      ('profiles','updated_at','Última atualização. Trigger automático.'),
      -- tenants
      ('tenants','id','Identificador único do tenant. UUID.'),
      ('tenants','name','Nome da organização/empresa.'),
      ('tenants','slug','Slug único para URLs amigáveis.'),
      ('tenants','created_at','Data/hora de criação.'),
      ('tenants','updated_at','Última atualização. Trigger.'),
      -- agents
      ('agents','id','Identificador único do agente. UUID.'),
      ('agents','agent_name','Nome do agente/endpoint monitorado.'),
      ('agents','tenant_id','FK para tenants. Isolamento multi-tenant.'),
      ('agents','hostname','Hostname do computador.'),
      ('agents','status','Estado: online, offline, error, archived.'),
      ('agents','agent_version','Versão do software do agente.'),
      ('agents','os_type','SO: windows, linux, macos.'),
      ('agents','os_version','Versão do SO.'),
      ('agents','last_heartbeat','Última comunicação. Detecção de offline.'),
      ('agents','enrolled_at','Data/hora de registro.'),
      ('agents','hmac_secret','Segredo HMAC para autenticação.'),
      ('agents','display_name','Nome de exibição amigável.'),
      ('agents','agent_mode','Modo: normal, safe, light.'),
      ('agents','agent_state','Lifecycle: active, quarantined, archived.'),
      ('agents','is_isolated','Se isolado por segurança.'),
      ('agents','is_throttled','Se em throttling.'),
      ('agents','force_update_version','Versão para atualização forçada.'),
      ('agents','scheduling_paused','Se jobs pausados neste agente.'),
      -- jobs
      ('jobs','id','Identificador único do job. UUID.'),
      ('jobs','tenant_id','FK para tenants. Multi-tenant.'),
      ('jobs','created_at','Data/hora de criação.'),
      -- enrollment_keys
      ('enrollment_keys','id','Identificador único. UUID.'),
      ('enrollment_keys','tenant_id','FK para tenants.'),
      ('enrollment_keys','created_at','Data/hora de criação.'),
      -- audit_logs
      ('audit_logs','id','Identificador único. UUID.'),
      ('audit_logs','tenant_id','FK para tenants. Multi-tenant.'),
      ('audit_logs','created_at','Data/hora do evento. Imutável.'),
      -- security_policies
      ('security_policies','id','Identificador único. UUID.'),
      ('security_policies','tenant_id','FK para tenants.'),
      ('security_policies','created_at','Data/hora de criação.'),
      ('security_policies','updated_at','Última atualização. Trigger.'),
      -- system_alerts
      ('system_alerts','id','Identificador único. UUID.'),
      ('system_alerts','tenant_id','FK para tenants.'),
      ('system_alerts','alert_type','Tipo: security, performance, compliance.'),
      ('system_alerts','severity','Severidade: low, medium, high, critical.'),
      ('system_alerts','title','Título resumido do alerta.'),
      ('system_alerts','created_at','Data/hora de geração.'),
      -- ai_insights
      ('ai_insights','id','Identificador único. UUID.'),
      ('ai_insights','tenant_id','FK para tenants.'),
      ('ai_insights','agent_id','FK para agents. Agente relacionado.'),
      ('ai_insights','insight_type','Tipo: anomaly, recommendation, prediction.'),
      ('ai_insights','severity','Severidade: low, medium, high, critical.'),
      ('ai_insights','title','Título do insight.'),
      ('ai_insights','description','Descrição detalhada.'),
      ('ai_insights','confidence_score','Score de confiança (0.0 a 1.0).'),
      ('ai_insights','created_at','Data/hora de geração.'),
      ('ai_insights','updated_at','Última atualização. Trigger.'),
      -- user_roles
      ('user_roles','id','Identificador único. UUID.'),
      ('user_roles','user_id','FK para auth.users.'),
      ('user_roles','tenant_id','FK para tenants.'),
      ('user_roles','role','Role: viewer, operator, analyst, admin, super_admin.'),
      -- invites
      ('invites','id','Identificador único. UUID.'),
      ('invites','tenant_id','FK para tenants.'),
      ('invites','email','Email do convidado.'),
      ('invites','role','Role a atribuir ao aceitar.'),
      -- api_keys
      ('api_keys','id','Identificador único. UUID.'),
      ('api_keys','tenant_id','FK para tenants.'),
      ('api_keys','name','Nome descritivo da chave.'),
      ('api_keys','key_hash','Hash SHA-256. Original não armazenada.'),
      ('api_keys','is_active','Se a chave está ativa.'),
      ('api_keys','created_at','Data/hora de criação.'),
      ('api_keys','updated_at','Última atualização. Trigger.'),
      ('api_keys','expires_at','Expiração. NULL = não expira.'),
      ('api_keys','last_used_at','Último uso.'),
      -- notification_channels
      ('notification_channels','id','Identificador único. UUID.'),
      ('notification_channels','tenant_id','FK para tenants.'),
      ('notification_channels','name','Nome do canal.'),
      ('notification_channels','channel_type','Tipo: email, slack, webhook, teams.'),
      ('notification_channels','is_active','Se está ativo.'),
      ('notification_channels','created_at','Data/hora de criação.'),
      ('notification_channels','updated_at','Última atualização. Trigger.'),
      -- tenant_subscriptions
      ('tenant_subscriptions','id','Identificador único. UUID.'),
      ('tenant_subscriptions','tenant_id','FK para tenants.'),
      ('tenant_subscriptions','created_at','Data/hora de criação.'),
      ('tenant_subscriptions','updated_at','Última atualização. Trigger.')
    ) AS t(tbl, col, cmt)
  LOOP
    -- Só comenta se a coluna existir
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = comments.tbl 
      AND column_name = comments.col
    ) THEN
      EXECUTE format('COMMENT ON COLUMN public.%I.%I IS %L', comments.tbl, comments.col, comments.cmt);
    END IF;
  END LOOP;
END $$;
