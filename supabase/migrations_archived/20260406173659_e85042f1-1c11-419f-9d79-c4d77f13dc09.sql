
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
  v_detection_rules_count INTEGER;
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
  SELECT COUNT(*), ARRAY_AGG(DISTINCT role::text)
  INTO v_roles_count, v_unique_roles
  FROM user_roles WHERE tenant_id = p_tenant_id;

  SELECT COUNT(*) INTO v_audit_count
  FROM audit_logs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '30 days';

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('active','online'))
  INTO v_agents_total, v_agents_active
  FROM agents WHERE tenant_id = p_tenant_id;

  SELECT COUNT(*) INTO v_detection_rules_count
  FROM detection_rules WHERE tenant_id = p_tenant_id OR tenant_id IS NULL;

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

  IF v_policies_count > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC1.1', 'policy', 'compliance_policies',
      v_policies_count || ' política(s) documentada(s)',
      jsonb_build_object('count', v_policies_count, 'approved', v_policies_approved), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  IF v_detection_rules_count > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC1.2', 'config', 'detection_rules',
      v_detection_rules_count || ' regra(s) de detecção',
      jsonb_build_object('count', v_detection_rules_count), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  IF v_roles_count > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC1.3', 'config', 'user_roles',
      'RBAC com ' || COALESCE(array_length(v_unique_roles, 1), 0) || ' papel(is)',
      jsonb_build_object('totalAssignments', v_roles_count, 'roles', to_jsonb(v_unique_roles)), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  IF v_audit_count > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC1.5', 'log', 'audit_logs',
      v_audit_count || ' registros de auditoria (30d)',
      jsonb_build_object('count_30d', v_audit_count), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  IF v_policies_approved > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC2.1', 'policy', 'compliance_policies',
      v_policies_approved || ' política(s) aprovada(s)',
      jsonb_build_object('approved', v_policies_approved, 'total', v_policies_count), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  IF v_detection_rules_count > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC3.1', 'config', 'detection_rules',
      v_detection_rules_count || ' regra(s) de monitoramento',
      jsonb_build_object('count', v_detection_rules_count), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  IF v_roles_count > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC6.1', 'config', 'user_roles + RLS',
      'RBAC (' || v_roles_count || ' atribuições) + RLS',
      jsonb_build_object('roleAssignments', v_roles_count), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  IF v_agents_total > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC6.2', 'config', 'agents',
      v_agents_active || '/' || v_agents_total || ' agente(s) HMAC+JWT',
      jsonb_build_object('active', v_agents_active, 'total', v_agents_total), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  IF v_enrollment_total > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC6.3', 'config', 'enrollment_keys',
      v_enrollment_active || '/' || v_enrollment_total || ' chave(s)',
      jsonb_build_object('active', v_enrollment_active, 'total', v_enrollment_total), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  IF v_audit_count > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC7.1', 'log', 'audit_logs',
      'Monitoramento com ' || v_audit_count || ' logs (30d)',
      jsonb_build_object('count_30d', v_audit_count), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  IF v_detection_rules_count > 0 OR v_agents_total > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC7.2', 'config', 'detection_rules + agents',
      v_detection_rules_count || ' regra(s) + ' || v_agents_total || ' agente(s)',
      jsonb_build_object('rules', v_detection_rules_count, 'agents', v_agents_total), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  IF v_controls_total > 0 THEN
    INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
    VALUES (p_tenant_id, 'CC8.1', 'config', 'soc2_controls',
      v_controls_implemented || '/' || v_controls_total || ' controles implementados',
      jsonb_build_object('implemented', v_controls_implemented, 'total', v_controls_total), 'active', NOW());
    v_count := v_count + 1;
  END IF;

  INSERT INTO soc2_evidence (tenant_id, control_id, evidence_type, reference, description, metadata, status, valid_from)
  VALUES (p_tenant_id, 'A1.2', 'log', 'backup_verifications + secret_rotation_log',
    v_backup_count || ' restore(s), ' || v_rotation_count || ' rotação(ões) (90d)',
    jsonb_build_object('backups', v_backup_count, 'rotations_90d', v_rotation_count), 'active', NOW());
  v_count := v_count + 1;

  RETURN v_count;
END;
$$;
