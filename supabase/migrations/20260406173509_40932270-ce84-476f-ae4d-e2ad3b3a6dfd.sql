
CREATE OR REPLACE FUNCTION public.collect_soc2_evidence_for_tenant(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_roles_count INTEGER;
  v_audit_count INTEGER;
  v_agents_total INTEGER;
  v_agents_active INTEGER;
  v_alert_rules_active INTEGER;
  v_alert_rules_total INTEGER;
  v_enrollment_active INTEGER;
  v_enrollment_total INTEGER;
  v_policies_count INTEGER;
  v_policies_approved INTEGER;
  v_controls_total INTEGER;
  v_controls_implemented INTEGER;
  v_backup_count INTEGER;
  v_rotation_count INTEGER;
  v_unique_roles TEXT[];
BEGIN
  -- Roles: user_roles has tenant_id directly
  SELECT COUNT(*), ARRAY_AGG(DISTINCT role::text)
  INTO v_roles_count, v_unique_roles
  FROM user_roles WHERE tenant_id = p_tenant_id;

  SELECT COUNT(*) INTO v_audit_count
  FROM audit_logs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '30 days';

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('active','online'))
  INTO v_agents_total, v_agents_active
  FROM agents WHERE tenant_id = p_tenant_id;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = true)
  INTO v_alert_rules_total, v_alert_rules_active
  FROM alert_rules WHERE tenant_id = p_tenant_id;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = true)
  INTO v_enrollment_total, v_enrollment_active
  FROM enrollment_keys WHERE tenant_id = p_tenant_id;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'approved')
  INTO v_policies_count, v_policies_approved
  FROM compliance_policies WHERE tenant_id = p_tenant_id;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('implemented','verified'))
  INTO v_controls_total, v_controls_implemented
  FROM soc2_controls WHERE tenant_id = p_tenant_id;

  SELECT COUNT(*) INTO v_backup_count
  FROM backup_verifications WHERE tenant_id = p_tenant_id;

  SELECT COUNT(*) INTO v_rotation_count
  FROM secret_rotation_log WHERE tenant_id = p_tenant_id AND rotated_at > NOW() - INTERVAL '90 days';

  -- CC1.1
  IF v_policies_count > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC1.1', 'policy', 'compliance_policies',
      v_policies_count || ' política(s) de compliance documentada(s)',
      jsonb_build_object('count', v_policies_count, 'approved', v_policies_approved),
      'active', NOW());
    v_count := v_count + 1;
  END IF;

  -- CC1.2
  IF v_alert_rules_active > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC1.2', 'configuration', 'alert_rules',
      v_alert_rules_active || ' regra(s) de alerta ativa(s)',
      jsonb_build_object('active', v_alert_rules_active, 'total', v_alert_rules_total),
      'active', NOW());
    v_count := v_count + 1;
  END IF;

  -- CC1.3
  IF v_roles_count > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC1.3', 'configuration', 'user_roles',
      'RBAC com ' || COALESCE(array_length(v_unique_roles, 1), 0) || ' papel(is) distintos',
      jsonb_build_object('totalAssignments', v_roles_count, 'roles', to_jsonb(v_unique_roles)),
      'active', NOW());
    v_count := v_count + 1;
  END IF;

  -- CC1.5
  IF v_audit_count > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC1.5', 'log', 'audit_logs',
      'Trilha de auditoria com ' || v_audit_count || ' registros (30d)',
      jsonb_build_object('count_30d', v_audit_count), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  -- CC2.1
  IF v_policies_approved > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC2.1', 'policy', 'compliance_policies',
      v_policies_approved || ' política(s) aprovada(s)', 
      jsonb_build_object('approved', v_policies_approved, 'total', v_policies_count),
      'active', NOW());
    v_count := v_count + 1;
  END IF;

  -- CC3.1
  IF v_alert_rules_total > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC3.1', 'configuration', 'alert_rules',
      v_alert_rules_total || ' regra(s) de monitoramento',
      jsonb_build_object('count', v_alert_rules_total), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  -- CC6.1
  IF v_roles_count > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC6.1', 'configuration', 'user_roles + RLS',
      'Controle de acesso via RBAC (' || v_roles_count || ' atribuições) e RLS',
      jsonb_build_object('roleAssignments', v_roles_count), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  -- CC6.2
  IF v_agents_total > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC6.2', 'configuration', 'agents',
      v_agents_active || ' agente(s) ativo(s) de ' || v_agents_total || ', HMAC+JWT',
      jsonb_build_object('active', v_agents_active, 'total', v_agents_total), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  -- CC6.3
  IF v_enrollment_total > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC6.3', 'configuration', 'enrollment_keys',
      'Enrollment com ' || v_enrollment_active || ' chave(s) ativa(s)',
      jsonb_build_object('active', v_enrollment_active, 'total', v_enrollment_total), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  -- CC7.1
  IF v_audit_count > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC7.1', 'log', 'audit_logs',
      'Monitoramento com ' || v_audit_count || ' logs (30d)',
      jsonb_build_object('count_30d', v_audit_count), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  -- CC7.2
  IF v_alert_rules_active > 0 OR v_agents_total > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC7.2', 'configuration', 'alert_rules + agents',
      'Detecção via ' || v_alert_rules_active || ' regra(s) e ' || v_agents_total || ' agente(s)',
      jsonb_build_object('alertRules', v_alert_rules_active, 'agents', v_agents_total), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  -- CC8.1
  IF v_controls_total > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC8.1', 'control', 'soc2_controls',
      v_controls_implemented || '/' || v_controls_total || ' controles implementados',
      jsonb_build_object('implemented', v_controls_implemented, 'total', v_controls_total), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  -- A1.2
  INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
  VALUES (p_tenant_id, 'A1.2', 'log', 'backup_verifications + secret_rotation_log',
    v_backup_count || ' restore(s) e ' || v_rotation_count || ' rotação(ões) (90d)',
    jsonb_build_object('backups', v_backup_count, 'rotations_90d', v_rotation_count), 'active', NOW());
  v_count := v_count + 1;

  RETURN v_count;
END;
$$;
