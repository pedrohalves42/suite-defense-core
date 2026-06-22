INSERT INTO public.feature_flags (tenant_id, key, enabled)
VALUES ('2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'hmac_success_coalescing', true)
ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();