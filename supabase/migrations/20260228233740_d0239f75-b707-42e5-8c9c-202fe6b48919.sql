
-- Trigger to auto-provision baseline features for new tenants
CREATE OR REPLACE FUNCTION public.provision_tenant_baseline_features()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
  VALUES
    (NEW.id, 'advanced_dashboard', true, null, 0),
    (NEW.id, 'advanced_reporting', true, null, 0),
    (NEW.id, 'advanced_scans_daily', true, null, 0),
    (NEW.id, 'agents', true, 50, 0),
    (NEW.id, 'analytics_dashboard', true, null, 0),
    (NEW.id, 'api_access', true, null, 0),
    (NEW.id, 'audit_logs', true, null, 0),
    (NEW.id, 'auto_quarantine', true, null, 0),
    (NEW.id, 'custom_reports', true, null, 0),
    (NEW.id, 'dns_local_filter', true, null, 0),
    (NEW.id, 'email_alerts', true, null, 0),
    (NEW.id, 'email_support', true, null, 0),
    (NEW.id, 'jobs', true, 500, 0),
    (NEW.id, 'max_agents', true, 10, 0),
    (NEW.id, 'max_devices', true, 50, 0),
    (NEW.id, 'max_scans_per_month', true, 1000, 0),
    (NEW.id, 'max_users', true, 5, 0),
    (NEW.id, 'priority_support', true, null, 0),
    (NEW.id, 'quarantine', true, 100, 0),
    (NEW.id, 'virus_scans', true, 1000, 0),
    (NEW.id, 'webhook_alerts', true, null, 0)
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop if exists to avoid duplicates
DROP TRIGGER IF EXISTS trg_provision_tenant_features ON public.tenants;

CREATE TRIGGER trg_provision_tenant_features
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_tenant_baseline_features();
