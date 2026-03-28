
-- ETAPA 5: Comentarios em colunas usando abordagem segura (DO block)
-- Apenas comenta colunas que realmente existem

DO $$
DECLARE
  comments RECORD;
BEGIN
  -- Array de (tabela, coluna, comentario)
  FOR comments IN 
    SELECT * FROM (VALUES
      -- profiles
      ('profiles','id','Identificador unico do perfil. UUID.'),
      ('profiles','user_id','FK para auth.users. Identifica o usuario.'),
      ('profiles','full_name','Nome completo do usuario.'),
      ('profiles','username','Nome de usuario unico.'),
      ('profiles','created_at','Data/hora de criacao.'),
      ('profiles','updated_at','Ultima atualizacao. Trigger automatico.'),
      -- tenants
      ('tenants','id','Identificador unico do tenant. UUID.'),
      ('tenants','name','Nome da organizacao/empresa.'),
      ('tenants','slug','Slug unico para URLs amigaveis.'),
      ('tenants','created_at','Data/hora de criacao.'),
      ('tenants','updated_at','Ultima atualizacao. Trigger.'),
      -- agents
      ('agents','id','Identificador unico do agente. UUID.'),
      ('agents','agent_name','Nome do agente/endpoint monitorado.'),
      ('agents','tenant_id','FK para tenants. Isolamento multi-tenant.'),
      ('agents','hostname','Hostname do computador.'),
      ('agents','status','Estado: online, offline, error, archived.'),
      ('agents','agent_version','Versao do software do agente.'),
      ('agents','os_type','SO: windows, linux, macos.'),
      ('agents','os_version','Versao do SO.'),
      ('agents','last_heartbeat','Ultima comunicacao. Deteccao de offline.'),
      ('agents','enrolled_at','Data/hora de registro.'),
      ('agents','hmac_secret','Segredo HMAC para autenticacao.'),
      ('agents','display_name','Nome de exibicao amigavel.'),
      ('agents','agent_mode','Modo: normal, safe, light.'),
      ('agents','agent_state','Lifecycle: active, quarantined, archived.'),
      ('agents','is_isolated','Se isolado por seguranca.'),
      ('agents','is_throttled','Se em throttling.'),
      ('agents','force_update_version','Versao para atualizacao forcada.'),
      ('agents','scheduling_paused','Se jobs pausados neste agente.'),
      -- jobs
      ('jobs','id','Identificador unico do job. UUID.'),
      ('jobs','tenant_id','FK para tenants. Multi-tenant.'),
      ('jobs','created_at','Data/hora de criacao.'),
      -- enrollment_keys
      ('enrollment_keys','id','Identificador unico. UUID.'),
      ('enrollment_keys','tenant_id','FK para tenants.'),
      ('enrollment_keys','created_at','Data/hora de criacao.'),
      -- audit_logs
      ('audit_logs','id','Identificador unico. UUID.'),
      ('audit_logs','tenant_id','FK para tenants. Multi-tenant.'),
      ('audit_logs','created_at','Data/hora do evento. Imutavel.'),
      -- security_policies
      ('security_policies','id','Identificador unico. UUID.'),
      ('security_policies','tenant_id','FK para tenants.'),
      ('security_policies','created_at','Data/hora de criacao.'),
      ('security_policies','updated_at','Ultima atualizacao. Trigger.'),
      -- system_alerts
      ('system_alerts','id','Identificador unico. UUID.'),
      ('system_alerts','tenant_id','FK para tenants.'),
      ('system_alerts','alert_type','Tipo: security, performance, compliance.'),
      ('system_alerts','severity','Severidade: low, medium, high, critical.'),
      ('system_alerts','title','Titulo resumido do alerta.'),
      ('system_alerts','created_at','Data/hora de geracao.'),
      -- ai_insights
      ('ai_insights','id','Identificador unico. UUID.'),
      ('ai_insights','tenant_id','FK para tenants.'),
      ('ai_insights','agent_id','FK para agents. Agente relacionado.'),
      ('ai_insights','insight_type','Tipo: anomaly, recommendation, prediction.'),
      ('ai_insights','severity','Severidade: low, medium, high, critical.'),
      ('ai_insights','title','Titulo do insight.'),
      ('ai_insights','description','Descricao detalhada.'),
      ('ai_insights','confidence_score','Score de confianca (0.0 a 1.0).'),
      ('ai_insights','created_at','Data/hora de geracao.'),
      ('ai_insights','updated_at','Ultima atualizacao. Trigger.'),
      -- user_roles
      ('user_roles','id','Identificador unico. UUID.'),
      ('user_roles','user_id','FK para auth.users.'),
      ('user_roles','tenant_id','FK para tenants.'),
      ('user_roles','role','Role: viewer, operator, analyst, admin, super_admin.'),
      -- invites
      ('invites','id','Identificador unico. UUID.'),
      ('invites','tenant_id','FK para tenants.'),
      ('invites','email','Email do convidado.'),
      ('invites','role','Role a atribuir ao aceitar.'),
      -- api_keys
      ('api_keys','id','Identificador unico. UUID.'),
      ('api_keys','tenant_id','FK para tenants.'),
      ('api_keys','name','Nome descritivo da chave.'),
      ('api_keys','key_hash','Hash SHA-256. Original nao armazenada.'),
      ('api_keys','is_active','Se a chave esta ativa.'),
      ('api_keys','created_at','Data/hora de criacao.'),
      ('api_keys','updated_at','Ultima atualizacao. Trigger.'),
      ('api_keys','expires_at','Expiracao. NULL = nao expira.'),
      ('api_keys','last_used_at','Ultimo uso.'),
      -- notification_channels
      ('notification_channels','id','Identificador unico. UUID.'),
      ('notification_channels','tenant_id','FK para tenants.'),
      ('notification_channels','name','Nome do canal.'),
      ('notification_channels','channel_type','Tipo: email, slack, webhook, teams.'),
      ('notification_channels','is_active','Se esta ativo.'),
      ('notification_channels','created_at','Data/hora de criacao.'),
      ('notification_channels','updated_at','Ultima atualizacao. Trigger.'),
      -- tenant_subscriptions
      ('tenant_subscriptions','id','Identificador unico. UUID.'),
      ('tenant_subscriptions','tenant_id','FK para tenants.'),
      ('tenant_subscriptions','created_at','Data/hora de criacao.'),
      ('tenant_subscriptions','updated_at','Ultima atualizacao. Trigger.')
    ) AS t(tbl, col, cmt)
  LOOP
    -- So comenta se a coluna existir
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
