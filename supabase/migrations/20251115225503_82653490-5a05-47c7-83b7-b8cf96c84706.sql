-- Correção 2.3: Remover duplicatas de user_roles e adicionar constraint

-- Passo 1: Remover duplicatas mantendo apenas a role mais privilegiada
-- (super_admin > admin > operator > viewer)
WITH duplicates AS (
  SELECT 
    tenant_id,
    user_id,
    id,
    role,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, user_id 
      ORDER BY 
        CASE role::text
          WHEN 'super_admin' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'operator' THEN 3
          WHEN 'viewer' THEN 4
          ELSE 5
        END,
        created_at DESC
    ) as rn
  FROM user_roles
)
DELETE FROM user_roles
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Passo 2: Adicionar constraint de unicidade
ALTER TABLE user_roles
DROP CONSTRAINT IF EXISTS user_roles_unique_user_per_tenant;

ALTER TABLE user_roles
ADD CONSTRAINT user_roles_unique_user_per_tenant
UNIQUE (tenant_id, user_id);

-- Passo 3: Corrigir profiles com full_name vazio
UPDATE profiles p
SET full_name = COALESCE(
  NULLIF(TRIM(p.full_name), ''),
  split_part(u.email, '@', 1)
)
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.full_name IS NULL OR TRIM(p.full_name) = '');